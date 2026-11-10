import { randomToken, hashPassword } from "./auth";
import { get, nowIso, run } from "./db";
import { env } from "./env";

const FAQ_SEED = [
  {
    category: "playlist",
    q_de: "Wie füge ich meine eigene Playlist hinzu?",
    a_de: "Öffne StreamingHub auf deinem Gerät und wähle „Playlist hinzufügen“. Hinterlege die Zugangsdaten oder die M3U-URL deines Anbieters. Die App speichert die Playlist und ihre Zugangsdaten lokal auf dem Gerät. Bittest du uns ausdrücklich, eine von dir selbst bereitgestellte M3U-URL für dein Konto zu hinterlegen, wird diese URL serverseitig gespeichert und ausschließlich an das ausgewählte aktive gekoppelte Gerät übermittelt; die Playlist-Inhalte bleiben lokal. Bitte verwende nur Quellen, für die du eine gültige Nutzungsberechtigung besitzt.",
    q_en: "How do I add my own playlist?",
    a_en: "Open StreamingHub on your device and choose “Add playlist”. Enter the credentials or the M3U URL provided by your provider. The app stores the playlist and its credentials locally on the device. If you expressly ask us to store an M3U URL that you provided yourself for your account, that URL is stored on the server and sent only to the selected active linked device; playlist content remains local. Please only use sources you are licensed to access.",
  },
  {
    category: "installation",
    q_de: "Wie installiere ich StreamingHub auf einem Fire TV Stick?",
    a_de: "Aktiviere auf dem Fire TV Stick die Option „Apps aus unbekannten Quellen installieren“ für den von dir verwendeten Installer, lade die APK über die Download-Seite und starte die Installation. Eine offizielle Amazon-Appstore-Version ist noch nicht verfügbar; bis dahin ist die Sideload-Installation der dokumentierte Weg.",
    q_en: "How do I install StreamingHub on a Fire TV Stick?",
    a_en: "On your Fire TV Stick, allow installing apps from unknown sources for your installer, download the APK from the download page and start the installation. An official Amazon Appstore release is not available yet; until then, sideloading is the documented path.",
  },
  {
    category: "devices",
    q_de: "Wie aktiviere ich ein Gerät?",
    a_de: "Starte die App und öffne „Gerät koppeln“. Die App zeigt einen zeitlich begrenzten Kopplungscode an. Melde dich auf streaminghub.org/activate an, gib den Code ein und bestätige. Das Gerät erscheint anschließend in deiner Geräteübersicht. Ein Code ist nur einmal und für wenige Minuten gültig.",
    q_en: "How do I activate a device?",
    a_en: "Start the app and open “Pair device”. The app displays a time-limited pairing code. Sign in at streaminghub.org/activate, enter the code and confirm. The device then appears in your device list. A code is valid once, for a few minutes only.",
  },
  {
    category: "devices",
    q_de: "Wie entferne ich ein Gerät?",
    a_de: "Öffne im Dashboard den Bereich Geräte und wähle beim gewünschten Gerät „Gerät entfernen“. Die Verknüpfung wird sofort serverseitig aufgehoben und das Gerät muss sich erneut koppeln.",
    q_en: "How do I remove a device?",
    a_en: "In your dashboard, open the devices section and choose “Remove device” next to the device. The link is revoked on the server immediately and the device must pair again.",
  },
  {
    category: "premium",
    q_de: "Was kostet StreamingHub Premium?",
    a_de: "StreamingHub Premium kostet 2,49 € pro Monat. Der Preis ist der Endpreis; wegen der Kleinunternehmerregelung gemäß § 19 UStG wird keine Umsatzsteuer ausgewiesen. Der Abschluss ist über den Web-Checkout für die Sideload-Version vorgesehen; in einer Amazon-Appstore-Version erfolgt der Kauf ausschließlich über Amazon In-App Purchasing.",
    q_en: "How much does StreamingHub Premium cost?",
    a_en: "StreamingHub Premium costs €2.49 per month. This is the final price; no VAT is charged under the German small business regulation pursuant to § 19 of the German VAT Act. Subscriptions are intended to be completed via the web checkout for the sideload version; in an Amazon Appstore build, purchase is handled exclusively through Amazon In-App Purchasing.",
  },
  {
    category: "premium",
    q_de: "Ist die VPN-Funktion bereits verfügbar?",
    a_de: "Die integrierte VPN-/Proxy-Funktion ist in Entwicklung und noch nicht produktiv aktiviert. Wir kennzeichnen sie auf der Premium-Seite transparent als „In Entwicklung“ und informieren vor einer Aktivierung über Funktionen, Kosten und Datenschutz.",
    q_en: "Is the VPN feature available yet?",
    a_en: "The integrated VPN/proxy capability is in development and not active in production. It is labelled clearly as “In development” on the premium page and we will explain functionality, cost and privacy before activation.",
  },
  {
    category: "troubleshooting",
    q_de: "Die Wiedergabe ruckelt – was kann ich tun?",
    a_de: "Prüfe zuerst die Verbindungsgeschwindigkeit am Gerät, wechsle nach Möglichkeit auf eine kabelgebundene oder 5-GHz-Verbindung und reduziere die Wiedergabequalität. Leere zusätzlich den App-Cache. StreamingHub passt die Wiedergabe automatisch an die Gerätehardware an, sofern die Quelle dies zulässt.",
    q_en: "Playback is stuttering – what can I do?",
    a_en: "First check the connection speed on the device, prefer a wired or 5 GHz connection and lower the playback quality. You can also clear the app cache. StreamingHub adapts playback to the device hardware automatically where the source allows it.",
  },
  {
    category: "troubleshooting",
    q_de: "Warum lädt meine Playlist nicht?",
    a_de: "Prüfe, ob die Playlist-URL noch gültig ist und ob dein Anbieter die gleichzeitige Nutzung auf mehreren Geräten erlaubt. Achte auf Tippfehler bei Zugangsdaten und teste die URL in einem Browser. Bei anhaltenden Problemen erstelle eine Support-Anfrage mit Gerätebezeichnung und Fehlermeldung.",
    q_en: "Why is my playlist not loading?",
    a_en: "Check whether the playlist URL is still valid and whether your provider allows simultaneous use on multiple devices. Look out for typos in credentials and test the URL in a browser. If the problem persists, open a support ticket including device model and error message.",
  },
  {
    category: "account",
    q_de: "Wie lösche ich mein Konto?",
    a_de: "Im Dashboard unter Einstellungen kannst du den Datenexport und die Kontolöschung beantragen. Wir bestätigen die Anfrage per E-Mail und löschen personenbezogene Daten, soweit keine gesetzlichen Aufbewahrungspflichten entgegenstehen.",
    q_en: "How do I delete my account?",
    a_en: "In the dashboard under Settings you can request a data export or account deletion. We confirm the request by email and delete personal data unless statutory retention obligations apply.",
  },
  {
    category: "account",
    q_de: "Ich habe mein Passwort vergessen.",
    a_de: "Nutze „Passwort vergessen“ auf der Anmeldeseite. Du erhältst eine E-Mail mit einem 60 Minuten gültigen Link. Aus Sicherheitsgründen zeigen wir nicht an, ob eine E-Mail-Adresse registriert ist.",
    q_en: "I forgot my password.",
    a_en: "Use “Forgot password” on the sign-in page. You will receive an email with a link valid for 60 minutes. For security reasons we do not reveal whether an email address is registered.",
  },
  {
    category: "playlist",
    q_de: "Wer stellt die Inhalte bereit?",
    a_de: "StreamingHub stellt keine Sender, Filme, Serien oder Playlists bereit. Es handelt sich ausschließlich um einen technischen Medienplayer. Du importierst ausschließlich deine eigenen, rechtmäßig zugänglichen Quellen und bist für deren Nutzung selbst verantwortlich.",
    q_en: "Who provides the content?",
    a_en: "StreamingHub does not provide channels, films, series or playlists. It is purely a technical media player. You import only your own lawfully accessible sources and remain responsible for their use.",
  },
  {
    category: "installation",
    q_de: "Gibt es eine iOS- oder Web-Version?",
    a_de: "Aktuell sind Fire TV, Android TV sowie Android-Smartphones und Tablets unterstützt. Weitere Plattformen sind nicht bestätigt; wir veröffentlichen neue Plattformen ausschließlich auf der Download-Seite.",
    q_en: "Is there an iOS or web version?",
    a_en: "Fire TV, Android TV and Android phones and tablets are supported today. Further platforms are not confirmed; new platforms are announced only on the download page.",
  },
];

/**
 * Legacy FAQ copy, used only to match rows seeded before the managed-playlist
 * disclosure. It is replaced by the current FAQ answer during bootstrap.
 */
const LEGACY_PLAYLIST_FAQ_DE =
  "Öffne StreamingHub auf deinem Gerät und wähle „Playlist hinzufügen“. Hinterlege die Zugangsdaten oder die M3U-URL deines Anbieters. StreamingHub speichert die Zugangsdaten auf dem Gerät und ruft die Inhalte ausschließlich für dich ab. Bitte verwende nur Quellen, für die du eine gültige Nutzungsberechtigung besitzt.";
const LEGACY_PLAYLIST_FAQ_EN =
  "Open StreamingHub on your device and choose “Add playlist”. Enter the credentials or the M3U URL provided by your provider. StreamingHub stores the credentials on the device and only loads the content on your behalf. Please only use sources you are licensed to access.";

/**
 * Previous FAQ answer from the first managed-playlist disclosure. Kept only
 * to migrate existing rows without overwriting manual admin edits.
 */
const PREVIOUS_PLAYLIST_FAQ_DE =
  "Öffne StreamingHub auf deinem Gerät und wähle „Playlist hinzufügen“. Hinterlege die Zugangsdaten oder die M3U-URL deines Anbieters. Die App speichert die Playlist und ihre Zugangsdaten lokal auf dem Gerät. Hinterlegt ein Administrator eine M3U-URL für dein Konto, wird diese URL serverseitig gespeichert und ausschließlich an aktive gekoppelte Geräte übermittelt; die Playlist-Inhalte bleiben lokal. Bitte verwende nur Quellen, für die du eine gültige Nutzungsberechtigung besitzt.";
const PREVIOUS_PLAYLIST_FAQ_EN =
  "Open StreamingHub on your device and choose “Add playlist”. Enter the credentials or the M3U URL provided by your provider. The app stores the playlist and its credentials locally on the device. If an administrator stores an M3U URL for your account, that URL is stored on the server and sent only to active linked devices; playlist content remains local. Please only use sources you are licensed to access.";

/**
 * FAQ answer from the account-wide managed-playlist disclosure. It predates
 * device-specific assignment and is migrated on bootstrap, but only when the
 * row still matches the seeded copy.
 */
const PREVIOUS_SELECTED_DEVICE_FAQ_DE =
  "Öffne StreamingHub auf deinem Gerät und wähle „Playlist hinzufügen“. Hinterlege die Zugangsdaten oder die M3U-URL deines Anbieters. Die App speichert die Playlist und ihre Zugangsdaten lokal auf dem Gerät. Bittest du uns ausdrücklich, eine von dir selbst bereitgestellte M3U-URL für dein Konto zu hinterlegen, wird diese URL serverseitig gespeichert und ausschließlich an aktive gekoppelte Geräte übermittelt; die Playlist-Inhalte bleiben lokal. Bitte verwende nur Quellen, für die du eine gültige Nutzungsberechtigung besitzt.";
const PREVIOUS_SELECTED_DEVICE_FAQ_EN =
  "Open StreamingHub on your device and choose “Add playlist”. Enter the credentials or the M3U URL provided by your provider. The app stores the playlist and its credentials locally on the device. If you expressly ask us to store an M3U URL that you provided yourself for your account, that URL is stored on the server and sent only to active linked devices; playlist content remains local. Please only use sources you are licensed to access.";

function syncLegacyPlaylistFaqCopy() {
  const target = FAQ_SEED.find(
    (item) => item.q_de === "Wie füge ich meine eigene Playlist hinzu?",
  );
  if (!target) return;

  const current = get<{ answer_de: string; answer_en: string }>(
    `SELECT answer_de, answer_en FROM faq_items WHERE question_de = ?`,
    target.q_de,
  );
  if (!current) return;

  const matchesLegacy =
    current.answer_de === LEGACY_PLAYLIST_FAQ_DE &&
    current.answer_en === LEGACY_PLAYLIST_FAQ_EN;
  const matchesPrevious =
    current.answer_de === PREVIOUS_PLAYLIST_FAQ_DE &&
    current.answer_en === PREVIOUS_PLAYLIST_FAQ_EN;
  const matchesSelectedDevice =
    current.answer_de === PREVIOUS_SELECTED_DEVICE_FAQ_DE &&
    current.answer_en === PREVIOUS_SELECTED_DEVICE_FAQ_EN;
  if (!matchesLegacy && !matchesPrevious && !matchesSelectedDevice) {
    return;
  }

  run(
    `UPDATE faq_items SET answer_de = ?, answer_en = ?, updated_at = ? WHERE question_de = ?`,
    target.a_de,
    target.a_en,
    nowIso(),
    target.q_de,
  );
}

function seedFaq() {
  syncLegacyPlaylistFaqCopy();
  const count = get<{ c: number }>(`SELECT COUNT(*) AS c FROM faq_items`)?.c ?? 0;
  if (count > 0) return;
  FAQ_SEED.forEach((item, index) => {
    run(
      `INSERT INTO faq_items (id, category, sort_order, question_de, answer_de, question_en, answer_en, published, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      `faq-${index + 1}`,
      item.category,
      index,
      item.q_de,
      item.a_de,
      item.q_en,
      item.a_en,
      nowIso(),
    );
  });
}

function seedSettings() {
  const defaults: Record<string, string> = {
    announcement_de: "",
    announcement_en: "",
    product_summary_de:
      "StreamingHub ist ein technischer IPTV-Player für Fire TV, Android TV und Android-Mobilgeräte. Eigene Playlists importieren, übersichtlich verwalten und aufeinander abgestimmte Wiedergabe nutzen.",
    product_summary_en:
      "StreamingHub is a technical IPTV player for Fire TV, Android TV and Android mobile devices. Import your own playlists, manage them clearly and use hardware-aware playback.",
    free_device_limit: "2",
    premium_device_limit: "5",
  };
  for (const [key, value] of Object.entries(defaults)) {
    run(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO NOTHING`,
      key,
      value,
      nowIso(),
    );
  }
}

/**
 * Creates the initial administrator account from ADMIN_EMAIL / ADMIN_PASSWORD.
 * No default credentials exist – without those variables no admin is created.
 */
export function ensureSeed() {
  seedFaq();
  seedSettings();

  if (!env.adminEmail || !env.adminPassword) return;
  const email = env.adminEmail.toLowerCase();
  const existing = get<{ id: string }>(`SELECT id FROM users WHERE email = ?`, email);
  if (existing) return;

  const id = randomToken(12);
  const now = nowIso();
  run(
    `INSERT INTO users (id, email, password_hash, display_name, locale, role, email_verified, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'de', 'admin', 1, ?, ?)`,
    id,
    email,
    hashPassword(env.adminPassword),
    "Administrator",
    now,
    now,
  );
  run(
    `INSERT INTO subscriptions (id, user_id, plan, status, channel, provider, updated_at, created_at)
     VALUES (?, ?, 'premium', 'none', 'web', 'none', ?, ?)`,
    randomToken(12),
    id,
    now,
    now,
  );
  console.log(`[seed] administrator account created for ${email}`);
}
