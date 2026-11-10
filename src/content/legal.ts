/**
 * Legal copy. Operator-specific data comes from src/lib/env.ts (placeholders
 * until confirmed). This is prepared text for a German digital service and is
 * not a substitute for legal review.
 */
export type Clause = {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
};

export type LegalDoc = {
  slug: string;
  titleDe: string;
  titleEn: string;
  updated: string;
  introDe?: string;
  introEn?: string;
  clausesDe: Clause[];
  clausesEn: Clause[];
};

const UPDATED = "2026-11-10";

export const legalDocs: Record<string, LegalDoc> = {
  privacy: {
    slug: "privacy",
    titleDe: "Datenschutzerklärung",
    titleEn: "Privacy policy",
    updated: UPDATED,
    introDe:
      "Diese Datenschutzerklärung informiert über die Verarbeitung personenbezogener Daten bei der Nutzung der Website streaminghub.org, des Kundenportals und der StreamingHub-App.",
    introEn:
      "This privacy policy explains how personal data is processed when using the streaminghub.org website, the customer portal and the StreamingHub app.",
    clausesDe: [
      {
        heading: "1. Verantwortlicher",
        paragraphs: [
          "Verantwortlich für die Datenverarbeitung ist der im Impressum genannte Diensteanbieter. Datenschutzanfragen richten Sie bitte an service@streaminghub.org.",
        ],
      },
      {
        heading: "2. Hosting und Server-Logfiles",
        paragraphs: [
          "Beim Aufruf der Website verarbeitet unser Hosting-Dienstleister Fly.io, Inc. (USA) technisch erforderliche Verbindungsdaten (IP-Adresse, Zeitpunkt, aufgerufene Ressource, User-Agent, Referrer, HTTP-Status). Die Anwendung und die SQLite-Datenbank werden in der Region Frankfurt am Main (Deutschland) betrieben. Die Auslieferung der APK-Downloads erfolgt über Cloudflare R2 (Cloudflare, Inc., USA). Die Verarbeitung dient der Auslieferung, Systemsicherheit und Fehleranalyse. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an sicherem Betrieb).",
          "Die Logdaten werden nach spätestens 30 Tagen gelöscht, sofern sie nicht zur Aufklärung eines konkreten Sicherheitsvorfalls länger benötigt werden.",
        ],
      },
      {
        heading: "3. Konto, Anmeldung und Sicherheit",
        paragraphs: [
          "Für Konto, Geräteaktivierung und Abonnement verarbeiten wir E-Mail-Adresse, Passwort-Hash, Anzeigename, Spracheinstellung, Kontoerstellungsdatum, Anmeldezeitpunkte, Sitzungsinformationen (IP-Adresse, User-Agent) sowie Rollen- und Berechtigungsdaten. Passwörter werden mit einem salted scrypt-Hash gespeichert und niemals im Klartext.",
          "Sitzungen verwenden ein HTTP-only-Cookie mit SameSite=Lax und werden serverseitig validiert. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (Vertrag bzw. Konto-Nutzung) sowie Art. 6 Abs. 1 lit. f DSGVO für Sicherheitsmaßnahmen.",
        ],
      },
      {
        heading: "4. Geräteaktivierung und Kopplungscodes",
        paragraphs: [
          "Bei der Kopplung eines Geräts verarbeiten wir den von der App erzeugten Kopplungscode (nur als Hash gespeichert), Gerätebezeichnung, Plattform, App-Version, Aktivierungszeitpunkt, letzte Geräteaktivität sowie die Verknüpfung zu Ihrem Konto. Die Verarbeitung ist zur Erbringung der Geräteverwaltung erforderlich (Art. 6 Abs. 1 lit. b DSGVO). Geräte können Sie jederzeit im Dashboard entkoppeln.",
        ],
      },
      {
        heading: "5. Zahlungen und Abonnements",
        paragraphs: [
          "Für Premium-Abonnements über den Web-Checkout nutzen wir Stripe Payments Europe, Ltd. (Irland). Zahlungsdaten wie Kartendaten werden direkt bei Stripe eingegeben und nicht auf unseren Servern gespeichert. Wir erhalten Statusinformationen (Zahlungsstatus, Ablaufzeitpunkt, Abo-Kennung).",
          "Bei Käufen über den Amazon Appstore erfolgt die Abwicklung durch Amazon. Es gelten die Datenschutzbestimmungen von Amazon; wir erhalten Statusinformationen zum Abonnement.",
          "Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO sowie Art. 6 Abs. 1 lit. c DSGVO für steuerrechtliche Aufbewahrung.",
        ],
      },
      {
        heading: "6. Support und Kontaktformular",
        paragraphs: [
          "Bei Kontaktaufnahme verarbeiten wir Name, E-Mail-Adresse, Betreff, Nachricht, Zeitpunkt und IP-Adresse zur Bearbeitung der Anfrage. Kontaktanfragen werden an service@streaminghub.org übermittelt und im Support-System gespeichert. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b bzw. lit. f DSGVO.",
          "Bitte senden Sie keine Passwörter, Zahlungsdaten oder sensible Inhalte über das Kontaktformular.",
        ],
      },
      {
        heading: "7. E-Mail-Versand",
        paragraphs: [
          "Für Bestätigungs-, Passwort-Zurücksetzen- und Support-E-Mails nutzen wir Resend (Resend, Inc., USA). Dabei werden E-Mail-Adresse und Nachrichteninhalt an den Dienst übermittelt. Ist der Versand nicht konfiguriert oder vorübergehend nicht erreichbar, werden Nachrichten im internen Ausgang gespeichert und nur durch berechtigte Mitarbeiter eingesehen.",
        ],
      },
      {
        heading: "8. VPN-/Proxy-Funktion",
        paragraphs: [
          "Die integrierte VPN-/Proxy-Funktion befindet sich in Entwicklung und ist nicht aktiv. Sollte sie aktiviert werden, informieren wir vorab über verarbeitete Verbindungsdaten, Serverstandorte, Speicherdauer und Auftragsverarbeiter und holen, soweit erforderlich, eine Einwilligung ein.",
        ],
      },
      {
        heading: "9. Cookies und Einwilligung",
        paragraphs: [
          "Technisch notwendige Cookies setzen wir für Anmeldung (Sitzung), Spracheinstellung und Einwilligungsspeicherung. Diese Cookies sind für den Betrieb erforderlich und benötigen keine Einwilligung (§ 25 Abs. 2 TDDDG).",
          "Optionale Analyse- oder Marketingdienste sind derzeit nicht im Einsatz. Sollten sie eingeführt werden, werden sie ausschließlich nach wirksamer Einwilligung geladen. Ihre Auswahl können Sie jederzeit über „Cookie-Einstellungen“ im Footer ändern.",
        ],
        bullets: [
          "sh_session – Anmeldung, HTTP-only, Laufzeit 30 Tage",
          "sh_locale – gewählte Sprache, Laufzeit 12 Monate",
          "sh_consent – Einwilligungsstatus, Laufzeit 6 Monate",
        ],
      },
      {
        heading: "10. Sicherheit und Protokolle",
        paragraphs: [
          "Sicherheitsrelevante Ereignisse (Anmeldung, Passwortänderung, Rollenänderung, Geräteentkopplung, administrative Eingriffe) protokollieren wir mit Zeitstempel, Akteur, IP-Adresse und User-Agent. Die Protokolle dienen der Missbrauchs- und Angriffserkennung (Art. 6 Abs. 1 lit. f DSGVO) und werden nach 90 Tagen gelöscht, sofern sie nicht zur Aufklärung eines Vorfalls erforderlich bleiben.",
        ],
      },
      {
        heading: "11. Empfänger und Drittlandübermittlung",
        paragraphs: [
          "Wir setzen sorgfältig ausgewählte Dienstleister als Auftragsverarbeiter ein: Fly.io, Inc. (Hosting, Region Frankfurt am Main), Stripe Payments Europe, Ltd. (Zahlungsabwicklung, Irland), Resend, Inc. (E-Mail-Versand, USA) und Cloudflare, Inc. (DNS und R2-Downloads, USA). Eine Übermittlung in Drittländer erfolgt nur auf Grundlage eines Angemessenheitsbeschlusses oder geeigneter Garantien (insbesondere EU-Standardvertragsklauseln), soweit erforderlich.",
        ],
      },
      {
        heading: "12. Speicherdauer",
        paragraphs: [
          "Kontodaten speichern wir bis zur Löschung des Kontos. Nach Löschantrag entfernen wir personenbezogene Daten unverzüglich, soweit keine gesetzlichen Aufbewahrungspflichten (insbesondere handels- und steuerrechtliche Fristen für Abrechnungsdaten) entgegenstehen. Supportanfragen löschen wir spätestens 24 Monate nach Abschluss.",
        ],
      },
      {
        heading: "13. Ihre Rechte",
        bullets: [
          "Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung (Art. 18), Datenübertragbarkeit (Art. 20), Widerspruch (Art. 21)",
          "Widerruf einer Einwilligung mit Wirkung für die Zukunft (Art. 7 Abs. 3 DSGVO)",
          "Beschwerde bei einer Datenschutzaufsichtsbehörde (Art. 77 DSGVO)",
        ],
        paragraphs: [
          "Datenexport und Kontolöschung können Sie im Dashboard unter Einstellungen beantragen oder per E-Mail an service@streaminghub.org.",
        ],
      },
      {
        heading: "14. Keine automatisierte Entscheidungsfindung",
        paragraphs: [
          "Eine automatisierte Entscheidungsfindung mit rechtlicher Wirkung einschließlich Profiling findet nicht statt.",
        ],
      },
    ],
    clausesEn: [
      {
        heading: "1. Controller",
        paragraphs: [
          "The service provider named in the legal notice is the controller. Privacy requests can be sent to service@streaminghub.org.",
        ],
      },
      {
        heading: "2. Hosting and server logs",
        paragraphs: [
          "When you visit the website, our hosting provider Fly.io, Inc. (USA) processes technically required connection data (IP address, timestamp, requested resource, user agent, referrer, HTTP status). The application and the SQLite database run in the Frankfurt am Main region (Germany). APK downloads are delivered via Cloudflare R2 (Cloudflare, Inc., USA). This serves delivery, system security and error analysis on the basis of Art. 6(1)(f) GDPR.",
          "Log data is deleted after 30 days at the latest unless it is needed longer to investigate a specific security incident.",
        ],
      },
      {
        heading: "3. Account, sign-in and security",
        paragraphs: [
          "For accounts, device activation and subscriptions we process email address, password hash, display name, language preference, account creation date, sign-in times, session information (IP address, user agent) and role data. Passwords are stored as salted scrypt hashes and never in plain text.",
          "Sessions use an HTTP-only cookie with SameSite=Lax and are validated server-side. Legal bases are Art. 6(1)(b) GDPR (account use) and Art. 6(1)(f) GDPR for security measures.",
        ],
      },
      {
        heading: "4. Device activation and pairing codes",
        paragraphs: [
          "When pairing a device we process the pairing code generated by the app (stored only as a hash), device name, platform, app version, activation time, last device activity and the link to your account. This is required to provide device management (Art. 6(1)(b) GDPR). You can unlink devices in the dashboard at any time.",
        ],
      },
      {
        heading: "5. Payments and subscriptions",
        paragraphs: [
          "For premium subscriptions via the web checkout we use Stripe Payments Europe, Ltd. (Ireland). Payment details such as card data are entered directly with Stripe and are not stored on our servers. We receive status information (payment status, period end, subscription reference).",
          "Purchases via the Amazon Appstore are processed by Amazon. Amazon's privacy terms apply; we receive subscription status information.",
          "Legal bases are Art. 6(1)(b) GDPR and Art. 6(1)(c) GDPR for statutory retention.",
        ],
      },
      {
        heading: "6. Support and contact form",
        paragraphs: [
          "When you contact us we process name, email address, subject, message, timestamp and IP address to handle the request. Requests are sent to service@streaminghub.org and stored in the support system (Art. 6(1)(b) or (f) GDPR).",
          "Please never send passwords, payment data or sensitive content through the contact form.",
        ],
      },
      {
        heading: "7. Email delivery",
        paragraphs: [
          "We use Resend (Resend, Inc., USA) for verification, password reset and support emails. Email address and message content are transmitted to that service. If delivery is not configured or temporarily unavailable, messages are stored in the internal outbox and visible only to authorised staff.",
        ],
      },
      {
        heading: "8. VPN/proxy capability",
        paragraphs: [
          "The integrated VPN/proxy capability is in development and not active. If it is activated, we will explain in advance which connection data is processed, the server locations, retention periods and processors, and obtain consent where required.",
        ],
      },
      {
        heading: "9. Cookies and consent",
        paragraphs: [
          "We use technically necessary cookies for sign-in (session), language preference and consent storage. These are required for operation and do not require consent under § 25(2) TDDDG.",
          "Optional analytics or marketing services are not in use. If introduced, they will load only after valid consent. You can change your choice at any time via “Cookie settings” in the footer.",
        ],
        bullets: [
          "sh_session – sign-in, HTTP-only, 30 days",
          "sh_locale – selected language, 12 months",
          "sh_consent – consent status, 6 months",
        ],
      },
      {
        heading: "10. Security and logs",
        paragraphs: [
          "Security-relevant events (sign-in, password change, role change, device unlinking, administrative actions) are logged with timestamp, actor, IP address and user agent. Logs support abuse and attack detection (Art. 6(1)(f) GDPR) and are deleted after 90 days unless needed to investigate an incident.",
        ],
      },
      {
        heading: "11. Recipients and third-country transfers",
        paragraphs: [
          "We use carefully selected processors: Fly.io, Inc. (hosting, Frankfurt am Main region), Stripe Payments Europe, Ltd. (payment processing, Ireland), Resend, Inc. (email delivery, USA) and Cloudflare, Inc. (DNS and R2 downloads, USA). Transfers to third countries occur only under an adequacy decision or appropriate safeguards (in particular EU standard contractual clauses) where required.",
        ],
      },
      {
        heading: "12. Retention",
        paragraphs: [
          "Account data is stored until the account is deleted. After a deletion request we remove personal data without undue delay unless statutory retention obligations (especially commercial and tax retention for billing data) apply. Support requests are deleted no later than 24 months after closure.",
        ],
      },
      {
        heading: "13. Your rights",
        bullets: [
          "Access (Art. 15 GDPR), rectification (Art. 16), erasure (Art. 17), restriction (Art. 18), data portability (Art. 20), objection (Art. 21)",
          "Withdrawal of consent with future effect (Art. 7(3) GDPR)",
          "Complaint to a data protection supervisory authority (Art. 77 GDPR)",
        ],
        paragraphs: [
          "You can request a data export or account deletion in the dashboard under Settings or by email to service@streaminghub.org.",
        ],
      },
      {
        heading: "14. No automated decision-making",
        paragraphs: [
          "No automated decision-making with legal effect, including profiling, takes place.",
        ],
      },
    ],
  },

  terms: {
    slug: "terms",
    titleDe: "Nutzungsbedingungen",
    titleEn: "Terms of use",
    updated: UPDATED,
    introDe:
      "Diese Nutzungsbedingungen regeln die Nutzung der Website, des Kundenportals und der StreamingHub-App.",
    introEn:
      "These terms govern the use of the website, the customer portal and the StreamingHub app.",
    clausesDe: [
      {
        heading: "1. Geltungsbereich und Vertragspartner",
        paragraphs: [
          "Vertragspartner ist der im Impressum genannte Diensteanbieter. Mit der Registrierung eines Kontos oder der Nutzung der Website erklären Sie sich mit diesen Bedingungen einverstanden. Verbraucherinnen und Verbraucher sind Personen, die den Dienst überwiegend privat nutzen.",
        ],
      },
      {
        heading: "2. Leistungsbeschreibung",
        paragraphs: [
          "StreamingHub ist ein technischer Medienplayer für eigene, rechtmäßig zugängliche Playlists und Streaming-Quellen. StreamingHub stellt keine Fernsehsender, Filme, Serien, Playlists oder sonstige Inhalte bereit und vermittelt keine Zugangsrechte an Inhalten Dritter.",
          "Der Funktionsumfang ergibt sich aus der jeweils aktuellen Produktbeschreibung. Als „in Entwicklung“ gekennzeichnete Funktionen sind nicht Bestandteil des geschuldeten Leistungsumfangs.",
        ],
      },
      {
        heading: "3. Verantwortung für Inhalte und Quellen",
        paragraphs: [
          "Sie sind allein dafür verantwortlich, dass die von Ihnen importierten Playlists und Quellen rechtmäßig sind und Sie über die erforderlichen Nutzungsrechte verfügen. Sie stellen sicher, dass Ihre Nutzung keine Rechte Dritter, insbesondere Urheber- und Leistungsschutzrechte, verletzt.",
          "Wir behalten uns vor, Konten bei konkreten Anhaltspunkten für rechtswidrige Nutzung zu sperren und erforderliche Maßnahmen zu ergreifen.",
        ],
      },
      {
        heading: "4. Konto und Zugangsdaten",
        paragraphs: [
          "Für Geräteverwaltung, Abonnement und Support ist ein Konto erforderlich. Sie müssen wahrheitsgemäße Angaben machen, Ihre Zugangsdaten geheim halten und uns unverzüglich über Missbrauch informieren. Die Nutzung durch Dritte mit Ihren Zugangsdaten erfolgt auf Ihre Verantwortung.",
          "Ein Anspruch auf ein Konto besteht nicht. Wir können Konten bei Verstößen gegen diese Bedingungen oder bei Missbrauch sperren oder löschen.",
        ],
      },
      {
        heading: "5. Zulässige Nutzung",
        bullets: [
          "Keine Umgehung technischer Schutzmaßnahmen oder Zugriffsbeschränkungen",
          "Keine automatisierte Massenabfrage, kein Reverse Engineering der Server-API",
          "Keine Weitergabe, kein Verkauf und kein Weiterverkauf von Konten oder Kopplungscodes",
          "Keine rechtswidrigen, schädigenden oder belästigenden Handlungen",
        ],
      },
      {
        heading: "6. Verfügbarkeit",
        paragraphs: [
          "Wir bemühen uns um eine hohe Verfügbarkeit, schulden jedoch keine ununterbrochene Erreichbarkeit. Wartungsarbeiten und Störungen können zu Einschränkungen führen. Der aktuelle Status ist auf streaminghub.org/status einsehbar.",
        ],
      },
      {
        heading: "7. Haftung",
        paragraphs: [
          "Wir haften unbeschränkt bei Vorsatz und grober Fahrlässigkeit sowie bei Verletzung von Leben, Körper oder Gesundheit. Bei einfacher Fahrlässigkeit haften wir nur für die Verletzung wesentlicher Vertragspflichten und begrenzt auf den vertragstypischen, vorhersehbaren Schaden. Die Haftung nach dem Produkthaftungsgesetz bleibt unberührt.",
          "Für die Verfügbarkeit, Qualität oder Rechtmäßigkeit der von Ihnen importierten Inhalte und Quellen übernehmen wir keine Haftung.",
        ],
      },
      {
        heading: "8. Rechte an Software und Marken",
        paragraphs: [
          "Die von uns bereitgestellte Software, das Design und die Marke StreamingHub sind urheber- bzw. markenrechtlich geschützt. Sie erhalten ein einfaches, nicht übertragbares Nutzungsrecht für den bestimmungsgemäßen Gebrauch. Weitergehende Rechte werden nicht eingeräumt.",
        ],
      },
      {
        heading: "9. Beendigung",
        paragraphs: [
          "Sie können Ihr Konto jederzeit im Dashboard oder per E-Mail an service@streaminghub.org löschen. Wir können den Vertrag mit angemessener Frist kündigen oder bei schwerwiegenden Verstößen fristlos sperren. Gesetzliche Aufbewahrungspflichten bleiben bestehen.",
        ],
      },
      {
        heading: "10. Änderungen",
        paragraphs: [
          "Wir können diese Bedingungen anpassen, wenn dies aus rechtlichen oder technischen Gründen erforderlich ist. Änderungen werden vor Wirksamwerden in Textform mitgeteilt; für Kunden mit Abonnement gilt die gesonderte Regelung in den Abonnementbedingungen.",
        ],
      },
      {
        heading: "11. Streitbeilegung und Schlussbestimmungen",
        paragraphs: [
          "Es gilt das Recht der Bundesrepublik Deutschland unter Ausschluss des UN-Kaufrechts; zwingende Verbraucherschutzvorschriften des Aufenthaltsstaats bleiben unberührt. Gerichtsstand für Verbraucher ist nach Wahl der gesetzliche Gerichtsstand.",
          "Sollte eine Bestimmung unwirksam sein, bleibt der übrige Vertrag wirksam. Die EU-Plattform zur Online-Streitbeilegung wurde zum 20. Juli 2025 eingestellt; wir sind nicht verpflichtet und nicht bereit, an Verbraucherschlichtungsverfahren teilzunehmen.",
        ],
      },
    ],
    clausesEn: [
      {
        heading: "1. Scope and contracting party",
        paragraphs: [
          "The contracting party is the service provider named in the legal notice. By registering an account or using the website you agree to these terms. Consumers are individuals using the service predominantly for private purposes.",
        ],
      },
      {
        heading: "2. Service description",
        paragraphs: [
          "StreamingHub is a technical media player for your own lawfully accessible playlists and streaming sources. StreamingHub does not provide television channels, films, series, playlists or other content, and does not broker access rights to third-party content.",
          "The scope of functions follows the current product description. Features marked “in development” are not part of the owed scope of services.",
        ],
      },
      {
        heading: "3. Responsibility for content and sources",
        paragraphs: [
          "You are solely responsible for ensuring that the playlists and sources you import are lawful and that you hold the necessary usage rights. You ensure that your use does not infringe third-party rights, in particular copyright and related rights.",
          "We reserve the right to block accounts where there are concrete indications of unlawful use and to take necessary measures.",
        ],
      },
      {
        heading: "4. Account and credentials",
        paragraphs: [
          "An account is required for device management, subscription and support. You must provide accurate information, keep credentials secret and notify us immediately of misuse. Use by third parties with your credentials is your responsibility.",
          "There is no entitlement to an account. We may block or delete accounts in case of violations or misuse.",
        ],
      },
      {
        heading: "5. Permitted use",
        bullets: [
          "No circumvention of technical protection measures or access restrictions",
          "No automated bulk querying, no reverse engineering of the server API",
          "No sharing, sale or resale of accounts or pairing codes",
          "No unlawful, harmful or harassing conduct",
        ],
      },
      {
        heading: "6. Availability",
        paragraphs: [
          "We strive for high availability but do not owe uninterrupted reachability. Maintenance and incidents may cause limitations. The current status is available at streaminghub.org/status.",
        ],
      },
      {
        heading: "7. Liability",
        paragraphs: [
          "Liability is unlimited for intent and gross negligence and for injury to life, body or health. For slight negligence we are liable only for breach of essential contractual obligations and limited to the foreseeable damage typical for the contract. Liability under the Product Liability Act remains unaffected.",
          "We accept no liability for the availability, quality or lawfulness of content and sources you import.",
        ],
      },
      {
        heading: "8. Software and trademark rights",
        paragraphs: [
          "The software we provide, the design and the StreamingHub brand are protected by copyright and trademark law. You receive a simple, non-transferable right of use for the intended purpose. No further rights are granted.",
        ],
      },
      {
        heading: "9. Termination",
        paragraphs: [
          "You may delete your account at any time in the dashboard or by email to service@streaminghub.org. We may terminate with reasonable notice or block without notice in case of serious violations. Statutory retention obligations remain unaffected.",
        ],
      },
      {
        heading: "10. Changes",
        paragraphs: [
          "We may amend these terms where required for legal or technical reasons. Changes are communicated in text form before taking effect; for subscription customers the separate provision in the subscription terms applies.",
        ],
      },
      {
        heading: "11. Dispute resolution and final provisions",
        paragraphs: [
          "German law applies excluding the UN Convention on Contracts for the International Sale of Goods; mandatory consumer protection rules of your country of residence remain unaffected. For consumers, jurisdiction is at the statutory place of jurisdiction.",
          "If a provision is invalid, the remaining contract stays valid. The EU online dispute resolution platform was discontinued on 20 July 2025; we are neither obliged nor willing to participate in consumer arbitration.",
        ],
      },
    ],
  },

  "subscription-terms": {
    slug: "subscription-terms",
    titleDe: "Abonnementbedingungen",
    titleEn: "Subscription terms",
    updated: UPDATED,
    introDe:
      "Ergänzende Bedingungen für das monatliche StreamingHub-Premium-Abonnement.",
    introEn: "Supplementary terms for the monthly StreamingHub Premium subscription.",
    clausesDe: [
      {
        heading: "1. Preis und Steuern",
        paragraphs: [
          "StreamingHub Premium kostet 2,49 € pro Monat. Der Preis ist der Endpreis; wegen der Kleinunternehmerregelung gemäß § 19 UStG wird keine Umsatzsteuer ausgewiesen. Der Preis wird im Checkout als Gesamtbetrag ausgewiesen. Bei Verbraucherpreisanpassungen informieren wir vorab.",
        ],
      },
      {
        heading: "2. Laufzeit und Kündigung",
        paragraphs: [
          "Das Abonnement verlängert sich monatlich um einen weiteren Monat, sofern es nicht vor Ablauf gekündigt wird. Die Kündigung ist jederzeit zum Ende des aktuellen Abrechnungszeitraums möglich. Eine Kündigung über das Dashboard beim Kanal „Web“ wird serverseitig an den Zahlungsanbieter übermittelt.",
          "Bei Kanal „Amazon Appstore“ erfolgt die Kündigung ausschließlich in Ihrem Amazon-Konto. Eine Kündigung über die Website ist technisch nicht möglich.",
        ],
      },
      {
        heading: "3. Zahlungswege",
        paragraphs: [
          "Für die Sideload-Version wird der Web-Checkout über Stripe abgewickelt. Für Amazon-Appstore-Versionen erfolgt der Kauf ausschließlich über Amazon In-App Purchasing; in der App werden keine externen Zahlungsaufforderungen angezeigt.",
          "Ein Abonnement wird erst nach erfolgreicher Zahlung und serverseitiger Bestätigung begründet. Ein angezeigter Status „nicht aktiv“ bedeutet nicht, dass ein Vertrag besteht.",
        ],
      },
      {
        heading: "4. Leistungsumfang und Entwicklung",
        paragraphs: [
          "Premium umfasst die zum jeweiligen Zeitpunkt produktiv verfügbaren Premiumfunktionen. Als „in Entwicklung“ gekennzeichnete Funktionen (insbesondere VPN-/Proxy-Funktion und erweiterte Streaming-Optimierung) sind nicht geschuldet, bis sie ausdrücklich als verfügbar gekennzeichnet werden.",
          "Der Ausfall einzelner Premiumfunktionen berechtigt nicht zur Minderung, solange die übrigen Leistungen nutzbar bleiben; gesetzliche Rechte bleiben unberührt.",
        ],
      },
      {
        heading: "5. Gerätelimit und Missbrauch",
        paragraphs: [
          "Premium erhöht das Gerätelimit. Kopplungscodes dürfen nicht weitergegeben werden. Bei missbräuchlicher Nutzung, insbesondere Weitergabe von Kontozugängen, können wir das Abonnement nach erfolgloser Abmahnung kündigen; bei erheblichem Missbrauch fristlos.",
        ],
      },
      {
        heading: "6. Widerruf",
        paragraphs: [
          "Verbrauchern steht ein Widerrufsrecht zu. Einzelheiten und das Muster-Widerrufsformular finden Sie in den Widerrufsinformationen. Bei digitalen Diensten kann das Widerrufsrecht erlöschen, wenn die Ausführung mit ausdrücklicher Zustimmung begonnen hat und der Kunde bestätigt hat, dass er sein Widerrufsrecht damit verliert.",
        ],
      },
      {
        heading: "7. Beendigung und Erstattungen",
        paragraphs: [
          "Bereits gezahlte Entgelte für den laufenden Abrechnungszeitraum werden bei einer ordentlichen Kündigung nicht anteilig erstattet, soweit gesetzlich zulässig. Erstattungen bei technischen Störungen erfolgen nach den gesetzlichen Vorschriften.",
        ],
      },
    ],
    clausesEn: [
      {
        heading: "1. Price and taxes",
        paragraphs: [
          "StreamingHub Premium costs €2.49 per month. This is the final price; no VAT is charged under the German small business regulation pursuant to § 19 of the German VAT Act. The checkout shows the total amount. We will inform you in advance of consumer price adjustments.",
        ],
      },
      {
        heading: "2. Term and cancellation",
        paragraphs: [
          "The subscription renews monthly for a further month unless cancelled before expiry. Cancellation is possible at any time with effect from the end of the current billing period. Cancellation via the dashboard for the “web” channel is transmitted server-side to the payment provider.",
          "For the “Amazon Appstore” channel, cancellation occurs exclusively in your Amazon account and is technically not possible via the website.",
        ],
      },
      {
        heading: "3. Payment channels",
        paragraphs: [
          "For the sideload version the web checkout is processed by Stripe. For Amazon Appstore builds, purchase occurs exclusively through Amazon In-App Purchasing; no external payment prompts are shown in the app.",
          "A subscription is formed only after successful payment and server-side confirmation. A displayed status of “not active” does not mean a contract exists.",
        ],
      },
      {
        heading: "4. Scope and development",
        paragraphs: [
          "Premium covers the premium features productively available at the relevant time. Features marked “in development” (in particular the VPN/proxy capability and advanced streaming optimisation) are not owed until explicitly marked available.",
          "Unavailability of individual premium features does not entitle to a price reduction while the remaining services remain usable; statutory rights remain unaffected.",
        ],
      },
      {
        heading: "5. Device limit and misuse",
        paragraphs: [
          "Premium raises the device limit. Pairing codes must not be shared. In case of misuse, especially sharing account access, we may terminate the subscription after unsuccessful warning; in case of serious misuse without notice.",
        ],
      },
      {
        heading: "6. Withdrawal",
        paragraphs: [
          "Consumers have a right of withdrawal. Details and the model withdrawal form are provided in the withdrawal information. For digital services the right may expire once performance has begun with express consent and the customer has confirmed losing the right of withdrawal.",
        ],
      },
      {
        heading: "7. Termination and refunds",
        paragraphs: [
          "Fees already paid for the current billing period are not refunded pro rata upon ordinary cancellation to the extent legally permitted. Refunds for technical incidents follow statutory rules.",
        ],
      },
    ],
  },

  withdrawal: {
    slug: "withdrawal",
    titleDe: "Widerrufsinformationen",
    titleEn: "Withdrawal information",
    updated: UPDATED,
    introDe:
      "Verbraucherinnen und Verbrauchern steht ein gesetzliches Widerrufsrecht zu. Die folgenden Informationen gelten für kostenpflichtige Abonnements von Verbrauchern.",
    introEn:
      "Consumers have a statutory right of withdrawal. The following information applies to paid subscriptions by consumers.",
    clausesDe: [
      {
        heading: "Widerrufsrecht",
        paragraphs: [
          "Sie haben das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen. Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag des Vertragsschlusses.",
          "Um Ihr Widerrufsrecht auszuüben, müssen Sie uns (Angaben siehe Impressum, E-Mail: service@streaminghub.org) mittels einer eindeutigen Erklärung (z. B. per E-Mail) über Ihren Entschluss informieren, diesen Vertrag zu widerrufen. Sie können dafür das Muster-Widerrufsformular verwenden, das jedoch nicht vorgeschrieben ist.",
          "Zur Wahrung der Widerrufsfrist reicht es aus, dass Sie die Mitteilung über die Ausübung des Widerrufsrechts vor Ablauf der Widerrufsfrist absenden.",
        ],
      },
      {
        heading: "Folgen des Widerrufs",
        paragraphs: [
          "Wenn Sie diesen Vertrag widerrufen, haben wir Ihnen alle Zahlungen, die wir von Ihnen erhalten haben, unverzüglich und spätestens binnen vierzehn Tagen ab dem Tag zurückzuzahlen, an dem die Mitteilung über Ihren Widerruf bei uns eingegangen ist. Für die Rückzahlung verwenden wir dasselbe Zahlungsmittel, das Sie bei der ursprünglichen Transaktion eingesetzt haben, sofern nichts anderes vereinbart wurde; Entgelte für die Rückzahlung werden nicht berechnet.",
        ],
      },
      {
        heading: "Vorzeitiges Erlöschen des Widerrufsrechts",
        paragraphs: [
          "Bei Verträgen über digitale Inhalte oder digitale Dienstleistungen erlischt das Widerrufsrecht, wenn wir mit der Ausführung begonnen haben, nachdem Sie ausdrücklich zugestimmt haben und gleichzeitig bestätigt haben, dass Sie mit Beginn der Ausführung Ihr Widerrufsrecht verlieren. Wir holen diese Zustimmung im Zahlungsvorgang gesondert ein.",
        ],
      },
      {
        heading: "Ausnahmen",
        paragraphs: [
          "Das Widerrufsrecht besteht nicht für Verträge über die Lieferung von nicht auf einem körperlichen Datenträger befindlichen digitalen Inhalten, wenn der Unternehmer mit der Ausführung begonnen hat und die gesetzlichen Voraussetzungen vorliegen. Gesetzliche Rechte bei Mängeln bleiben unberührt.",
        ],
      },
      {
        heading: "Muster-Widerrufsformular",
        paragraphs: [
          "An: den im Impressum genannten Diensteanbieter, E-Mail: service@streaminghub.org",
          "Hiermit widerrufe(n) ich/wir den von mir/uns abgeschlossenen Vertrag über die Erbringung der folgenden Dienstleistung: StreamingHub Premium. Bestellt am / erhalten am: __________. Name des/der Verbraucher(s): __________. Anschrift: __________. Unterschrift (nur bei Mitteilung auf Papier): __________. Datum: __________.",
        ],
      },
      {
        heading: "Zahlungen über den Amazon Appstore",
        paragraphs: [
          "Wurde das Abonnement über den Amazon Appstore abgeschlossen, richten Sie den Widerruf bitte zusätzlich an Amazon, da die Zahlungs- und Vertragsabwicklung dort erfolgt. Die gesetzlichen Rechte gegenüber StreamingHub bleiben unberührt.",
        ],
      },
    ],
    clausesEn: [
      {
        heading: "Right of withdrawal",
        paragraphs: [
          "You have the right to withdraw from this contract within fourteen days without giving any reason. The withdrawal period is fourteen days from the day the contract was concluded.",
          "To exercise your right, you must inform us (details in the legal notice, email: service@streaminghub.org) by a clear statement (e.g. by email) of your decision to withdraw. You may use the model withdrawal form, which is not mandatory.",
          "To meet the deadline it is sufficient to send your communication before the withdrawal period expires.",
        ],
      },
      {
        heading: "Consequences of withdrawal",
        paragraphs: [
          "If you withdraw, we will reimburse all payments received from you without undue delay and no later than fourteen days from the day we receive your withdrawal notice. We use the same means of payment as in the original transaction unless agreed otherwise; no fees are charged for the reimbursement.",
        ],
      },
      {
        heading: "Early expiry of the right",
        paragraphs: [
          "For contracts concerning digital content or digital services, the right of withdrawal expires once we have begun performance after you expressly consented and simultaneously confirmed that you lose the right of withdrawal upon commencement. We obtain this consent separately during checkout.",
        ],
      },
      {
        heading: "Exceptions",
        paragraphs: [
          "The right of withdrawal does not apply to contracts for digital content not supplied on a tangible medium if the trader has begun performance and the statutory requirements are met. Statutory rights in case of defects remain unaffected.",
        ],
      },
      {
        heading: "Model withdrawal form",
        paragraphs: [
          "To: the service provider named in the legal notice, email: service@streaminghub.org",
          "I/we hereby withdraw from the contract concluded by me/us for the provision of the following service: StreamingHub Premium. Ordered on / received on: __________. Name of consumer(s): __________. Address: __________. Signature (only for paper notification): __________. Date: __________.",
        ],
      },
      {
        heading: "Payments via the Amazon Appstore",
        paragraphs: [
          "If the subscription was concluded via the Amazon Appstore, please also direct the withdrawal to Amazon, as payment and contract processing take place there. Your statutory rights towards StreamingHub remain unaffected.",
        ],
      },
    ],
  },
};

export const legalUpdatedLabel = UPDATED;
