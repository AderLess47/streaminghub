import type { LegalDoc } from "./legal";

/**
 * Barrierefreiheits-Erklärung nach BFSG. Die Angaben beschreiben den tatsächlich
 * geprüften Stand – geprüft wurde auf einem Testsysten mit Chromium, nicht mit
 * echten Screenreadern oder auf Fire-TV-Geräten. Diese Erklärung ist kein
 * Rechtsrat und sollte vor Veröffentlichung juristisch gegengelesen werden.
 */
export const accessibilityDoc: LegalDoc = {
  slug: "barrierefreiheit",
  titleDe: "Erklärung zur Barrierefreiheit",
  titleEn: "Accessibility statement",
  updated: "2026-11-12",
  introDe:
    "StreamingHub möchte, dass die Website streaminghub.org und das Kundenportal von möglichst allen Menschen genutzt werden können – unabhängig von Sehvermögen, Motorik, Hörvermögen oder kognitiven Fähigkeiten. Diese Erklärung beschreibt, was erreicht ist, wie geprüft wurde und wo noch Barrieren bestehen.",
  introEn:
    "StreamingHub wants the streaminghub.org website and the customer portal to be usable by as many people as possible, regardless of sight, motor skills, hearing or cognitive ability. This statement describes what has been achieved, how it was tested and where barriers remain.",
  clausesDe: [
    {
      heading: "1. Geltungsbereich",
      paragraphs: [
        "Diese Erklärung gilt für die Website streaminghub.org einschließlich Kundenportal und Verwaltungsbereich. Sie gilt nicht für die StreamingHub-App für Fire TV und Android; deren Barrierefreiheit wird derzeit nicht systematisch geprüft und ist hier nicht zugesichert.",
      ],
    },
    {
      heading: "2. Stand der Vereinbarkeit",
      paragraphs: [
        "Die Website ist weitgehend mit den Web Content Accessibility Guidelines (WCAG) 2.2 auf Konformitätsstufe AA vereinbar. Maßgeblich ist die europäische Norm EN 301 549 sowie das Barrierefreiheitsstärkungsgesetz (BFSG).",
        "Geprüft wurde am 12. November 2026. Die Prüfung umfasste die öffentlichen Seiten (Start, Premium, Download, Aktivierung, Hilfe, FAQ, Kontakt, Systemstatus, Rechtstexte, Anmeldung und Registrierung) sowie den angemeldeten Bereich mit Kundenportal und Verwaltung.",
      ],
    },
    {
      heading: "3. Wie geprüft wurde",
      bullets: [
        "Automatisierte Prüfung mit axe-core 4.10.2 auf 14 Seiten: keine festgestellten Verstöße.",
        "Kontrastmessung aller Textknoten gegen den tatsächlich gezeichneten Hintergrund; alle Textkontraste erreichen mindestens 4,5:1, große Schrift mindestens 3:1.",
        "Bedienung ausschließlich per Tastatur mit sichtbarem Fokus; Fokusführung nach Formularfehlern und nach dem Speichern.",
        "Layoutprüfung ohne horizontales Scrollen bei 320 Pixel Breite und bei 390 Pixel Breite.",
        "Zielgrößen aller Bedienelemente: mindestens 24 × 24 Pixel nach WCAG 2.5.8, die wichtigsten Bedienelemente 44 Pixel.",
        "Prüfung des Accessibility-Baums im Browser, unter anderem für Überschriften, Landmarken, Tabellen, Formulare und Statusmeldungen.",
        "Berücksichtigung der Systemeinstellung „Bewegung reduzieren“ und des erzwungenen Kontrastmodus.",
      ],
    },
    {
      heading: "4. Bekannte Barrieren",
      paragraphs: [
        "Wir benennen offen, was noch nicht geprüft oder noch nicht vollständig umgesetzt ist:",
      ],
      bullets: [
        "Die Prüfung erfolgte mit dem Accessibility-Baum des Browsers, nicht mit echten Screenreadern (NVDA, JAWS, VoiceOver, TalkBack). Ein Test mit Hilfsmitteln und betroffenen Nutzerinnen und Nutzern steht aus.",
        "Die App für Fire TV und Android ist nicht Teil dieser Erklärung; Tastatur- und Sprachbedienung dort sind ungeprüft.",
        "Der angemeldete Bereich wurde auf einem Testsystem geprüft, nicht mit echten Kundendaten in der Produktivumgebung.",
        "Die Sprachen Türkisch, Arabisch, Französisch, Spanisch, Italienisch und Griechisch sind nur teilweise übersetzt; nicht übersetzte Inhalte erscheinen auf Englisch.",
        "Videos und Player-Oberflächen innerhalb der App bieten derzeit keine geprüften Untertitel oder Audiodeskription.",
      ],
    },
    {
      heading: "5. Feedback und Kontakt",
      paragraphs: [
        "Wenn Ihnen eine Barriere auffällt oder Sie Inhalte in einer zugänglichen Form benötigen, schreiben Sie an service@streaminghub.org. Bitte nennen Sie die Seite, das genutzte Hilfsmittel und was nicht funktioniert hat. Wir antworten in der Regel innerhalb von zwei Werktagen und bemühen uns, gemeldete Barrieren zu beheben.",
      ],
    },
    {
      heading: "6. Durchsetzung",
      paragraphs: [
        "Wenn wir auf eine Rückmeldung nicht zufriedenstellend reagieren, können Sie sich an die nach dem Barrierefreiheitsstärkungsgesetz zuständige Marktüberwachungsstelle wenden. Die Kontaktdaten der zuständigen Stelle erteilen wir auf Anfrage.",
      ],
    },
  ],
  clausesEn: [
    {
      heading: "1. Scope",
      paragraphs: [
        "This statement covers the streaminghub.org website, including the customer portal and the administration area. It does not cover the StreamingHub app for Fire TV and Android; accessibility there is not systematically tested and is not assured here.",
      ],
    },
    {
      heading: "2. Compliance status",
      paragraphs: [
        "The website largely conforms to the Web Content Accessibility Guidelines (WCAG) 2.2 at level AA, the relevant standard being EN 301 549 and the German Accessibility Strengthening Act (BFSG).",
        "Testing took place on 12 November 2026 and covered the public pages (home, premium, download, activation, help, FAQ, contact, status, legal documents, sign-in and registration) as well as the signed-in area with customer portal and administration.",
      ],
    },
    {
      heading: "3. How it was tested",
      bullets: [
        "Automated testing with axe-core 4.10.2 on 14 pages: no violations found.",
        "Contrast measurement of every text node against its rendered background; all text reaches at least 4.5:1, large text at least 3:1.",
        "Keyboard-only operation with a visible focus indicator, including focus handling after form errors and after saving.",
        "Layout check without horizontal scrolling at 320 px and at 390 px width.",
        "Target sizes: at least 24 × 24 px per WCAG 2.5.8, primary controls 44 px.",
        "Inspection of the browser accessibility tree for headings, landmarks, tables, forms and status messages.",
        "The system settings for reduced motion and forced colours were taken into account.",
      ],
    },
    {
      heading: "4. Known barriers",
      paragraphs: ["We state openly what is not yet tested or not yet complete:"],
      bullets: [
        "Testing used the browser accessibility tree rather than real screen readers (NVDA, JAWS, VoiceOver, TalkBack). Testing with assistive technology and affected users is still pending.",
        "The Fire TV and Android app is outside this statement; keyboard and voice operation there are untested.",
        "The signed-in area was tested on a test system, not with real customer data in production.",
        "Turkish, Arabic, French, Spanish, Italian and Greek are only partly translated; untranslated content appears in English.",
        "Video and player interfaces inside the app provide no tested captions or audio description.",
      ],
    },
    {
      heading: "5. Feedback and contact",
      paragraphs: [
        "If you encounter a barrier or need content in an accessible format, write to service@streaminghub.org. Please name the page, the assistive technology you use and what did not work. We usually reply within two working days and try to remove reported barriers.",
      ],
    },
    {
      heading: "6. Enforcement",
      paragraphs: [
        "If our response to your feedback is not satisfactory, you may contact the market surveillance authority responsible under the German Accessibility Strengthening Act. We will provide the contact details of the competent authority on request.",
      ],
    },
  ],
};
