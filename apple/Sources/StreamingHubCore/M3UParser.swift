import Foundation

/// Liest das erweiterte M3U-Format der IPTV-Anbieter.
///
/// Jede URL bleibt eine undurchsichtige Quelle: StreamingHub bündelt, proxyt oder
/// beansprucht keine Rechte an Playlist-Inhalten. Die Regeln entsprechen dem
/// Android- und dem Vega-Client, damit dieselbe Datei überall gleich aussieht.
public enum M3UParser {

    static let maxChannels = 50_000

    private struct PendingInfo {
        var name: String
        var logo: String?
        var group: String
        var tvgID: String?
    }

    private static let attributeRegex = try! NSRegularExpression(
        pattern: #"([A-Za-z0-9_-]+)\s*=\s*"([^"]*)""#
    )

    public static func parse(_ content: String) -> [Channel] {
        var channels: [Channel] = []
        var seen = Set<String>()
        var pending: PendingInfo?
        var extGroup = ""

        for rawLine in content.split(separator: "\n", omittingEmptySubsequences: false) {
            let line = rawLine
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .replacingOccurrences(of: "\u{FEFF}", with: "")
            if line.isEmpty { continue }

            if line.uppercased().hasPrefix("#EXTINF") {
                let info = line.drop(while: { $0 != ":" }).dropFirst()
                guard let comma = info.lastIndex(of: ",") else {
                    pending = PendingInfo(
                        name: "Unbenannter Eintrag",
                        logo: nil,
                        group: extGroup,
                        tvgID: nil
                    )
                    continue
                }
                let metadata = String(info[info.startIndex..<comma])
                let title = String(info[info.index(after: comma)...]).trimmingCharacters(in: .whitespaces)
                let attributes = parseAttributes(metadata)
                pending = PendingInfo(
                    name: title.isEmpty ? "Unbenannter Eintrag" : title,
                    logo: attributes["tvg-logo"].flatMap { $0.isEmpty ? nil : $0 },
                    group: nonEmpty(attributes["group-title"]) ?? extGroup,
                    tvgID: nonEmpty(attributes["tvg-id"])
                )
                continue
            }

            if line.uppercased().hasPrefix("#EXTGRP:") {
                extGroup = String(line.dropFirst("#EXTGRP:".count)).trimmingCharacters(in: .whitespaces)
                continue
            }

            if line.hasPrefix("#") { continue }
            guard line.contains("://") || line.hasPrefix("/") else { continue }
            guard channels.count < maxChannels else { break }

            let fallbackName = line
                .split(separator: "/").last
                .map(String.init)?
                .split(separator: "?").first
                .map(String.init)?
                .trimmingCharacters(in: .whitespaces) ?? ""
            let name = nonEmpty(pending?.name) ?? (fallbackName.isEmpty ? "Sender" : fallbackName)
            let group = nonEmpty(pending?.group) ?? (extGroup.isEmpty ? "Ohne Kategorie" : extGroup)

            let channel = Channel(
                name: name,
                url: line,
                logo: pending?.logo,
                group: group,
                tvgID: pending?.tvgID,
                kind: inferKind(name: name, group: group, url: line)
            )
            if seen.insert(channel.url).inserted {
                channels.append(channel)
            }
            pending = nil
        }

        return channels
    }

    public static func inferKind(name: String, group: String, url: String) -> MediaKind {
        let haystack = "\(name) \(group)".lowercased()
        let path = url.lowercased()

        let looksLikeSeries =
            haystack.contains("serie") ||
            haystack.contains("series") ||
            haystack.contains("episode") ||
            haystack.contains("staffel") ||
            path.contains("/series/") ||
            path.contains("/serie/")
        if looksLikeSeries { return .series }

        let looksLikeMovie =
            haystack.contains("film") ||
            haystack.contains("movie") ||
            haystack.contains("kino") ||
            haystack.contains("vod") ||
            haystack.contains("doku") ||
            haystack.contains("documentary") ||
            path.contains("/movie/") ||
            path.hasSuffix(".mp4") ||
            path.hasSuffix(".mkv") ||
            path.hasSuffix(".avi") ||
            path.hasSuffix(".webm")
        if looksLikeMovie { return .movie }

        return .live
    }

    /// Gruppen in der Reihenfolge des ersten Auftretens.
    public static func groups(in channels: [Channel]) -> [String] {
        var seen = Set<String>()
        var result: [String] = []
        for channel in channels where !seen.contains(channel.group) {
            seen.insert(channel.group)
            result.append(channel.group)
        }
        return result
    }

    private static func parseAttributes(_ metadata: String) -> [String: String] {
        let range = NSRange(metadata.startIndex..., in: metadata)
        var result: [String: String] = [:]
        for match in attributeRegex.matches(in: metadata, range: range) {
            guard
                let keyRange = Range(match.range(at: 1), in: metadata),
                let valueRange = Range(match.range(at: 2), in: metadata)
            else { continue }
            result[metadata[keyRange].lowercased()] = metadata[valueRange].trimmingCharacters(in: .whitespaces)
        }
        return result
    }

    private static func nonEmpty(_ value: String?) -> String? {
        guard let value else { return nil }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
