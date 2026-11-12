import type { LegalDoc } from "./legal";

/**
 * „Informationen zur Barrierefreiheit" nach § 14 Abs. 1 Nr. 2 BFSG in Verbindung
 * mit Anlage 3 Nr. 1 BFSG. Das ist bewusst NICHT die „Erklärung zur
 * Barrierefreiheit" nach § 12b BGG – die gilt nur für öffentliche Stellen des
 * Bundes. Pflichtangaben nach Anlage 3 Nr. 1: allgemeine Beschreibung der
 * Dienstleistung, zum Verständnis nötige Erläuterungen, Beschreibung der
 * Erfüllung der Barrierefreiheitsanforderungen und die Angabe der zuständigen
 * Marktüberwachungsbehörde.
 *
 * Behördenangaben zuletzt geprüft am 12.11.2026 auf mlbf-barrierefrei.de
 * (Kontaktseite). Aufbau geprüft gegen die FAQ „Informationen zur
 * Barrierefreiheit (Dienstleistungen)" der Bundesfachstelle Barrierefreiheit.
 * Eine juristische Prüfung durch eine qualifizierte Person steht noch aus.
 */
export const accessibilityDoc: LegalDoc = {
  slug: "barrierefreiheit",
  titleDe: "Informationen zur Barrierefreiheit",
  titleEn: "Accessibility information",
  updated: "2026-11-12",
  introDe:
    "Diese Informationen richten sich an Verbraucherinnen und Verbraucher und beschreiben, wie barrierefrei die Website streaminghub.org und das Kundenportal nutzbar sind. Sie folgen dem Aufbau, den § 14 Absatz 1 Nummer 2 des Barrierefreiheitsstärkungsgesetzes (BFSG) in Verbindung mit Anlage 3 Nummer 1 BFSG für Dienstleistungserbringer vorsieht, und werden unabhängig davon bereitgestellt, ob StreamingHub in den Anwendungsbereich des Gesetzes fällt.",
  introEn:
    "This information is addressed to consumers and describes how accessible the streaminghub.org website and the customer portal are. It follows the structure that section 14(1) no. 2 of the German Accessibility Strengthening Act (BFSG) in conjunction with Annex 3 no. 1 BFSG sets out for service providers, and is provided regardless of whether StreamingHub falls within the scope of that act.",
  clausesDe: [
    {
      heading: "1. Beschreibung der Dienstleistung",
      paragraphs: [
        "StreamingHub ist ein technischer Player für selbst mitgebrachte IPTV-Playlists auf Fire TV, Android TV und mobilen Geräten. Über die Website streaminghub.org können Interessierte das Angebot kennenlernen, ein Abonnement abschließen, ein Gerät aktivieren und den Support erreichen. Angemeldete Kundinnen und Kunden verwalten im Kundenportal ihr Profil, ihr Abonnement, ihre Geräte und ihre Support-Anfragen; Mitarbeitende nutzen einen geschützten Verwaltungsbereich.",
        "Die Website ist ohne Anmeldung vollständig lesbar. Für Abo-Verwaltung und Support ist ein Konto erforderlich; die Anmeldung erfolgt per E-Mail-Adresse und Passwort, auf Wunsch mit Zwei-Faktor-Code.",
      ],
    },
    {
      heading: "2. Wie die Barrierefreiheitsanforderungen erfüllt werden",
      paragraphs: [
        "Maßgeblich sind die Anforderungen der Richtlinie (EU) 2019/882, umgesetzt durch das BFSG und die BFSGV, sowie die Norm EN 301 549 mit den Web Content Accessibility Guidelines (WCAG) 2.2 auf Konformitätsstufe AA.",
        "Umgesetzt und am 12. November 2026 geprüft:",
      ],
      bullets: [
        "Wahrnehmbarkeit: Textkontraste von mindestens 4,5:1 (große Schrift 3:1), gemessen an allen Textknoten gegen den tatsächlich gezeichneten Hintergrund; Informationen werden nie allein über Farbe transportiert; eigene Einstellung für reduzierte Bewegung und für den erzwungenen Kontrastmodus.",
        "Bedienbarkeit: vollständige Bedienung per Tastatur mit sichtbarem Fokus, logische Fokusführung nach Fehlern und nach dem Speichern, Zielgrößen von mindestens 24 × 24 Pixel nach WCAG 2.5.8 (Hauptbedienelemente 44 Pixel), keine Inhalte, die schneller als drei Mal pro Sekunde blinken.",
        "Verständlichkeit: durchgängige Überschriftenhierarchie, beschriftete Formularfelder mit verknüpften Fehlermeldungen, verständliche Rückmeldungen in dauerhaften Live-Regionen, klare und konsistente Navigation.",
        "Robustheit: semantisches HTML mit Landmarken, Tabellen mit Beschriftung, Statusmeldungen mit Rollen; Layout ohne horizontales Scrollen bei 320 Pixel Breite.",
        "Automatisierte Prüfung mit axe-core 4.10.2 auf 14 Seiten ohne festgestellte Verstöße, ergänzt durch manuelle Tastatur-, Reflow- und Kontrastprüfungen.",
      ],
    },
    {
      heading: "3. Bereitstellung dieser Informationen",
      paragraphs: [
        "Diese Informationen sind über einen Link „Barrierefreiheit“ im Fußbereich jeder Seite erreichbar, in Textform verfügbar und so aufgebaut, dass sie sich in andere Darstellungen und Hilfsmittel überführen lassen. Sie stehen auf Deutsch und Englisch bereit. Auf Anfrage erläutern wir sie mündlich oder in einer anderen wahrnehmbaren Form.",
      ],
    },
    {
      heading: "4. Bekannte Lücken",
      paragraphs: [
        "Wir arbeiten daran, die Barrierefreiheit weiter zu verbessern. Derzeit offen:",
      ],
      bullets: [
        "Die Prüfung erfolgte mit dem Accessibility-Baum des Browsers, nicht mit echten Screenreadern (NVDA, JAWS, VoiceOver, TalkBack). Ein Test mit Hilfsmitteln und mit betroffenen Nutzerinnen und Nutzern steht aus.",
        "Die App für Fire TV und Android ist nicht Gegenstand dieser Informationen; ihre Barrierefreiheit wird derzeit nicht systematisch geprüft.",
        "Der angemeldete Bereich wurde auf einem Testsystem geprüft, nicht mit echten Kundendaten in der Produktivumgebung.",
        "Die Sprachen Türkisch, Arabisch, Französisch, Spanisch, Italienisch und Griechisch sind nur teilweise übersetzt; nicht übersetzte Inhalte erscheinen auf Englisch.",
        "Video- und Player-Oberflächen bieten derzeit keine geprüften Untertitel und keine Audiodeskription.",
      ],
    },
    {
      heading: "5. Feedback und Kontakt",
      paragraphs: [
        "Wenn Ihnen eine Barriere auffällt oder Sie Inhalte in einer zugänglichen Form benötigen, schreiben Sie an service@streaminghub.org. Bitte nennen Sie die Seite, das genutzte Hilfsmittel und was nicht funktioniert hat. Wir antworten in der Regel innerhalb von zwei Werktagen.",
      ],
    },
    {
      heading: "6. Zuständige Marktüberwachungsbehörde",
      paragraphs: [
        "Zuständig für die Überwachung der Barrierefreiheitsanforderungen nach dem BFSG ist die Marktüberwachungsstelle der Länder für die Barrierefreiheit von Produkten und Dienstleistungen – Anstalt öffentlichen Rechts (MLBF AöR).",
        "Dort können Sie eine Barriere melden oder einen Antrag nach § 32 Absatz 1 BFSG stellen. Für Streitigkeiten aus dem BFSG ist die Schlichtungsstelle nach § 16 des Behindertengleichstellungsgesetzes (BGG) zuständig.",
      ],
    },
    {
      heading: "7. Stand",
      paragraphs: [
        "Diese Informationen wurden am 12. November 2026 erstellt und zuletzt geprüft. Die Angaben zur Marktüberwachungsbehörde wurden am selben Tag auf der Website der Behörde abgeglichen.",
      ],
    },
  ],
  clausesEn: [
    {
      heading: "1. Description of the service",
      paragraphs: [
        "StreamingHub is a technical player for IPTV playlists you bring yourself, on Fire TV, Android TV and mobile devices. The streaminghub.org website lets visitors learn about the offer, take out a subscription, activate a device and reach support. Signed-in customers manage their profile, subscription, devices and support requests in the customer portal; staff use a protected administration area.",
        "The website can be read in full without signing in. Managing a subscription and support require an account; sign-in uses email address and password, optionally with a two-factor code.",
      ],
    },
    {
      heading: "2. How the accessibility requirements are met",
      paragraphs: [
        "The relevant requirements are Directive (EU) 2019/882, implemented by the BFSG and the BFSGV, and standard EN 301 549 with the Web Content Accessibility Guidelines (WCAG) 2.2 at level AA.",
        "Implemented and tested on 12 November 2026:",
      ],
      bullets: [
        "Perceivable: text contrast of at least 4.5:1 (large text 3:1), measured for every text node against its rendered background; information is never conveyed by colour alone; reduced motion and forced-colours settings are supported.",
        "Operable: fully keyboard operable with a visible focus indicator, deliberate focus handling after errors and after saving, targets of at least 24 × 24 px per WCAG 2.5.8 (primary controls 44 px), nothing flashing more than three times per second.",
        "Understandable: consistent heading hierarchy, labelled form fields with linked error messages, clear feedback in standing live regions, clear and consistent navigation.",
        "Robust: semantic HTML with landmarks, tables with captions, status messages with roles; layout without horizontal scrolling at 320 px width.",
        "Automated testing with axe-core 4.10.2 on 14 pages found no violations, complemented by manual keyboard, reflow and contrast checks.",
      ],
    },
    {
      heading: "3. How this information is provided",
      paragraphs: [
        "This information is reachable through an accessibility link in the footer of every page, is available in text form and is structured so that it can be converted into other presentations and assistive formats. It is available in German and English. On request we explain it verbally or in another perceivable form.",
      ],
    },
    {
      heading: "4. Known gaps",
      paragraphs: ["We are working to improve accessibility further. Currently open:"],
      bullets: [
        "Testing used the browser accessibility tree rather than real screen readers (NVDA, JAWS, VoiceOver, TalkBack). Testing with assistive technology and with affected users is still pending.",
        "The Fire TV and Android app is not covered by this information; its accessibility is not systematically tested at present.",
        "The signed-in area was tested on a test system, not with real customer data in production.",
        "Turkish, Arabic, French, Spanish, Italian and Greek are only partly translated; untranslated content appears in English.",
        "Video and player interfaces currently provide no tested captions and no audio description.",
      ],
    },
    {
      heading: "5. Feedback and contact",
      paragraphs: [
        "If you encounter a barrier or need content in an accessible format, write to service@streaminghub.org. Please name the page, the assistive technology you use and what did not work. We usually reply within two working days.",
      ],
    },
    {
      heading: "6. Competent market surveillance authority",
      paragraphs: [
        "The authority responsible for monitoring the accessibility requirements under the BFSG is the Marktüberwachungsstelle der Länder für die Barrierefreiheit von Produkten und Dienstleistungen – Anstalt öffentlichen Rechts (MLBF AöR).",
        "You can report a barrier there or file an application under section 32(1) BFSG. For disputes under the BFSG, the conciliation body under section 16 of the German Equal Opportunities for People with Disabilities Act (BGG) is responsible.",
      ],
    },
    {
      heading: "7. Status",
      paragraphs: [
        "This information was created and last reviewed on 12 November 2026. The details of the market surveillance authority were checked against the authority's website on the same day.",
      ],
    },
  ],
};
