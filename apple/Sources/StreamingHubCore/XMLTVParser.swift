import Foundation
#if canImport(FoundationXML)
import FoundationXML
#endif

/// Liest XMLTV für den Programmführer.
///
/// Anders als in React Native steht hier ein echter XML-Parser zur Verfügung –
/// einer, der Entities, CDATA und Namensräume korrekt behandelt, statt Text mit
/// regulären Ausdrücken zu zerlegen.
public enum XMLTVParser {

    public static let maxProgrammes = 50_000

    public static func parse(_ xml: Data) -> [Programme] {
        let delegate = Delegate()
        let parser = XMLParser(data: xml)
        parser.delegate = delegate
        parser.shouldProcessNamespaces = false
        parser.shouldResolveExternalEntities = false
        guard parser.parse() else { return [] }
        return delegate.programmes.sorted { lhs, rhs in
            lhs.startMs == rhs.startMs
                ? lhs.channelName.localizedStandardCompare(rhs.channelName) == .orderedAscending
                : lhs.startMs < rhs.startMs
        }
    }

    public static func parse(_ xml: String) -> [Programme] {
        parse(Data(xml.utf8))
    }

    /// XMLTV-Zeit: `YYYYMMDDhhmmss +HHMM`; die Zone ist optional.
    public static func time(from raw: String) -> Int64? {
        let value = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty else { return nil }

        for pattern in ["yyyyMMddHHmmss Z", "yyyyMMddHHmmssZ", "yyyyMMddHHmmss"] {
            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.timeZone = TimeZone(secondsFromGMT: 0)
            formatter.dateFormat = pattern
            formatter.isLenient = false
            if let date = formatter.date(from: value) {
                return Int64((date.timeIntervalSince1970 * 1000).rounded())
            }
        }
        return nil
    }

    private final class Delegate: NSObject, XMLParserDelegate {
        var programmes: [Programme] = []

        private var channelNames: [String: String] = [:]
        private var channelID: String?
        private var channelDisplayName: String?

        private var programme: Programme?
        private var textElement: String?
        private var buffer = ""

        func parser(
            _ parser: XMLParser,
            didStartElement elementName: String,
            namespaceURI: String?,
            qualifiedName qName: String?,
            attributes attributeDict: [String: String]
        ) {
            buffer = ""
            switch elementName {
            case "channel":
                channelID = attributeDict["id"]?.trimmingCharacters(in: .whitespaces)
                channelDisplayName = nil
            case "programme":
                guard
                    let id = attributeDict["channel"]?.trimmingCharacters(in: .whitespaces),
                    !id.isEmpty,
                    let start = attributeDict["start"].flatMap(XMLTVParser.time(from:)),
                    let stop = attributeDict["stop"].flatMap(XMLTVParser.time(from:)),
                    stop > start
                else {
                    programme = nil
                    return
                }
                programme = Programme(
                    channelID: id,
                    channelName: id,
                    startMs: start,
                    stopMs: stop,
                    title: "",
                    detail: nil
                )
            case "display-name", "title", "desc":
                textElement = elementName
            default:
                textElement = nil
            }
        }

        func parser(_ parser: XMLParser, foundCharacters string: String) {
            guard textElement != nil else { return }
            buffer += string
        }

        func parser(
            _ parser: XMLParser,
            didEndElement elementName: String,
            namespaceURI: String?,
            qualifiedName qName: String?
        ) {
            let value = buffer.trimmingCharacters(in: .whitespacesAndNewlines)
            switch elementName {
            case "channel":
                if let id = channelID, let name = channelDisplayName, !name.isEmpty {
                    channelNames[id] = name
                }
                channelID = nil
                channelDisplayName = nil
            case "display-name":
                if !value.isEmpty, channelDisplayName == nil {
                    channelDisplayName = value
                }
            case "title":
                if programme?.title.isEmpty == true { programme?.title = value }
            case "desc":
                if programme?.detail == nil, !value.isEmpty { programme?.detail = value }
            case "programme":
                if var finished = programme {
                    finished.channelName = channelNames[finished.channelID] ?? finished.channelID
                    if !finished.title.isEmpty, programmes.count < XMLTVParser.maxProgrammes {
                        programmes.append(finished)
                    }
                }
                programme = nil
            default:
                break
            }
            textElement = nil
            buffer = ""
        }
    }
}

public enum EPG {
    /// Laufende Sendung eines Senders.
    public static func running(_ programmes: [Programme], channelID: String, at date: Date = Date()) -> Programme? {
        programmes.first { $0.channelID == channelID && $0.isRunning(at: date) }
    }

    /// Nächste Sendung, die nach `date` beginnt.
    public static func next(_ programmes: [Programme], channelID: String, after date: Date = Date()) -> Programme? {
        let now = Int64(date.timeIntervalSince1970 * 1000)
        return programmes
            .filter { $0.channelID == channelID && $0.startMs > now }
            .min { $0.startMs < $1.startMs }
    }

    /// Sendungen, die im Zeitfenster beginnen – Grundlage der Erinnerungen.
    public static func upcoming(_ programmes: [Programme], from date: Date, window: TimeInterval) -> [Programme] {
        let start = Int64(date.timeIntervalSince1970 * 1000)
        let end = Int64(date.addingTimeInterval(window).timeIntervalSince1970 * 1000)
        return programmes
            .filter { $0.startMs > start && $0.startMs <= end }
            .sorted { $0.startMs < $1.startMs }
    }

    /// XMLTV verweist über `tvg-id` auf den Sender. Fehlt die Kennung, bleibt der
    /// Sender ohne Programm – geraten wird nicht.
    public static func channelID(for channel: Channel) -> String? {
        guard let tvgID = channel.tvgID, !tvgID.isEmpty else { return nil }
        return tvgID
    }
}
