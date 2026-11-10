import type { Locale } from "@/i18n/config";

type Article = { intro: string; steps: string[]; note: string };

export type HelpTopicKey =
  | "playlist"
  | "install"
  | "activate"
  | "premium"
  | "playback"
  | "connection"
  | "account"
  | "subscription";

export const helpArticles: Record<HelpTopicKey, Record<"de" | "en", Article>> = {
  playlist: {
    de: {
      intro:
        "StreamingHub bringt keine Inhalte mit. Du bindest die Playlist deines Anbieters selbst ein – als M3U-Link oder über Zugangsdaten.",
      steps: [
        "Öffne StreamingHub und wähle im Menü „Playlist hinzufügen“.",
        "Trage die M3U-URL oder Server, Benutzername und Passwort deines Anbieters ein.",
        "Vergib einen Namen (z. B. „Wohnzimmer“) und speichere die Playlist.",
        "Starte die Aktualisierung und prüfe, ob Kanäle und Kategorien erscheinen.",
      ],
      note: "Nutze ausschließlich Quellen, für die du eine gültige Zugriffsberechtigung besitzt. Bei lokaler Eingabe bleiben Zugangsdaten auf dem Gerät. Eine vom Administrator hinterlegte M3U-URL wird nur auf deine ausdrückliche Anfrage und nur dann gespeichert, wenn du die URL selbst bereitstellst; sie kann Zugangsdaten enthalten und wird ausschließlich an das ausgewählte aktive gekoppelte Gerät übermittelt. Playlist-Inhalte bleiben lokal.",
    },
    en: {
      intro:
        "StreamingHub ships without content. You add your provider's playlist yourself – as an M3U link or via credentials.",
      steps: [
        "Open StreamingHub and choose “Add playlist” in the menu.",
        "Enter your provider's M3U URL, or server, username and password.",
        "Give the playlist a name (e.g. “Living room”) and save it.",
        "Start the refresh and check whether channels and categories appear.",
      ],
      note: "Only use sources you are licensed to access. Credentials entered locally stay on the device. An M3U URL stored by an administrator is stored only at your express request and only if you provided the URL yourself; it may contain credentials and is sent only to the selected active linked device. Playlist content remains local.",
    },
  },
  install: {
    de: {
      intro:
        "Aktuell sind Fire TV, Android TV sowie Android-Smartphones und -Tablets unterstützt. Die Installation erfolgt über die APK.",
      steps: [
        "Lade die passende APK über die Download-Seite auf dein Gerät.",
        "Erlaube die Installation aus unbekannten Quellen für die App, mit der du die Datei öffnest.",
        "Öffne die Datei und bestätige die Installation.",
        "Starte StreamingHub und koppele das Gerät über streaminghub.org/activate.",
      ],
      note: "Sideload-Installationen erhalten keine automatischen Updates. Prüfe die Download-Seite regelmäßig auf neue Versionen und Prüfsummen.",
    },
    en: {
      intro:
        "Fire TV, Android TV and Android phones and tablets are supported today. Installation uses the APK.",
      steps: [
        "Download the correct APK from the download page onto your device.",
        "Allow installation from unknown sources for the app you use to open the file.",
        "Open the file and confirm the installation.",
        "Start StreamingHub and pair the device at streaminghub.org/activate.",
      ],
      note: "Sideloaded installs do not update automatically. Check the download page regularly for new versions and checksums.",
    },
  },
  activate: {
    de: {
      intro:
        "Die Kopplung verbindet ein Gerät mit deinem Konto. Der Code stammt aus der App und ist nur wenige Minuten gültig.",
      steps: [
        "Öffne in der App „Gerät koppeln“ und notiere den Code.",
        "Melde dich auf streaminghub.org/activate an.",
        "Gib den Code ein und bestätige die Kopplung.",
        "Die App erhält den Aktivierungsstatus automatisch; das Gerät erscheint im Dashboard.",
      ],
      note: "Jeder Code ist einmalig gültig. Nach zu vielen Fehlversuchen wird er gesperrt – fordere dann in der App einen neuen Code an.",
    },
    en: {
      intro:
        "Pairing links a device to your account. The code comes from the app and is valid for a few minutes only.",
      steps: [
        "Open “Pair device” in the app and note the code.",
        "Sign in at streaminghub.org/activate.",
        "Enter the code and confirm the pairing.",
        "The app receives the activation status automatically and the device appears in your dashboard.",
      ],
      note: "Every code is single-use. After too many failed attempts it is blocked – request a new code in the app.",
    },
  },
  premium: {
    de: {
      intro:
        "Premium kostet 2,49 € pro Monat. Der Preis ist der Endpreis; wegen der Kleinunternehmerregelung gemäß § 19 UStG wird keine Umsatzsteuer ausgewiesen. Die Abwicklung erfolgt über den Web-Checkout über Stripe.",
      steps: [
        "Melde dich an und öffne „Abonnement“ im Dashboard.",
        "Prüfe den Abrechnungskanal (Web oder Amazon Appstore).",
        "Starte den Web-Checkout für die Sideload-Version.",
        "Der Status wird erst nach serverseitiger Zahlungsbestätigung aktiv.",
      ],
      note: "In Amazon-Appstore-Versionen erfolgt der Kauf ausschließlich über Amazon In-App Purchasing. Es werden keine externen Zahlungsaufforderungen in der App angezeigt.",
    },
    en: {
      intro:
        "Premium costs €2.49 per month. This is the final price; no VAT is charged under the German small business regulation pursuant to § 19 of the German VAT Act. Payment is handled via the Stripe web checkout.",
      steps: [
        "Sign in and open “Subscription” in your dashboard.",
        "Check the billing channel (web or Amazon Appstore).",
        "Start the web checkout for the sideload version.",
        "The status only becomes active after server-side payment confirmation.",
      ],
      note: "In Amazon Appstore builds, purchases are handled exclusively through Amazon In-App Purchasing. No external payment prompts are shown in the app.",
    },
  },
  playback: {
    de: {
      intro:
        "Ruckeln oder Abbrüche liegen häufig an der Quelle, der Netzwerkverbindung oder der Geräteleistung. Gehe die Punkte der Reihe nach durch.",
      steps: [
        "Prüfe die Internetgeschwindigkeit auf dem Gerät (mindestens 15 Mbit/s für HD).",
        "Wechsle von WLAN auf 5 GHz oder LAN und reduziere die Wiedergabequalität.",
        "Leere den App-Cache und starte das Gerät neu.",
        "Teste die Quelle in einem anderen Player, um Anbieter-Probleme auszuschließen.",
      ],
      note: "StreamingHub kann nur die Wiedergabe optimieren, nicht die Qualität der Quelle verbessern. Bleibt ein Sender dauerhaft fehlerhaft, wende dich an deinen Anbieter.",
    },
    en: {
      intro:
        "Stuttering or dropouts usually come from the source, the network or device performance. Work through the steps in order.",
      steps: [
        "Check the internet speed on the device (at least 15 Mbit/s for HD).",
        "Switch from Wi-Fi to 5 GHz or Ethernet and reduce playback quality.",
        "Clear the app cache and restart the device.",
        "Test the source in another player to rule out provider issues.",
      ],
      note: "StreamingHub can optimise playback, not the quality of the source. If a channel keeps failing, contact your provider.",
    },
  },
  connection: {
    de: {
      intro:
        "Eine stabile Verbindung ist die wichtigste Voraussetzung für flüssige Wiedergabe. Diese Prüfungen helfen bei der Eingrenzung.",
      steps: [
        "Teste die Verbindung mit einem Speedtest direkt auf dem betroffenen Gerät.",
        "Prüfe, ob eine Firewall, ein Pi-hole oder ein VPN den Datenverkehr blockiert.",
        "Setze DNS testweise auf einen öffentlichen Resolver und starte die App neu.",
        "Vergleiche das Verhalten mit einem zweiten Gerät im selben Netzwerk.",
      ],
      note: "Die in Entwicklung befindliche VPN-/Proxy-Funktion ist noch nicht aktiv. Sie kann daher derzeit nicht zur Fehlerbehebung verwendet werden.",
    },
    en: {
      intro:
        "A stable connection is the key requirement for smooth playback. These checks help narrow down the cause.",
      steps: [
        "Run a speed test directly on the affected device.",
        "Check whether a firewall, Pi-hole or VPN is blocking traffic.",
        "Try a public DNS resolver and restart the app.",
        "Compare behaviour with a second device on the same network.",
      ],
      note: "The VPN/proxy feature under development is not active yet and cannot be used for troubleshooting at this time.",
    },
  },
  account: {
    de: {
      intro:
        "Dein Konto verwaltet Geräte, Abonnement und Support. Die reine Wiedergabe in der App funktioniert auch ohne Konto.",
      steps: [
        "E-Mail-Adresse und Passwort änderst du im Dashboard unter Einstellungen.",
        "Bestätige deine E-Mail-Adresse, um Benachrichtigungen zu erhalten.",
        "Einen Datenexport oder die Kontolöschung beantragst du ebenfalls dort.",
        "Bei Problemen mit dem Zugang nutze „Passwort vergessen“ oder den Support.",
      ],
      note: "Aus Sicherheitsgründen zeigen wir nicht an, ob eine E-Mail-Adresse registriert ist. Kontolöschungen werden protokolliert.",
    },
    en: {
      intro:
        "Your account manages devices, subscription and support. Playback in the app works without an account.",
      steps: [
        "Change email address and password in the dashboard under Settings.",
        "Confirm your email address to receive notifications.",
        "You can request a data export or account deletion there as well.",
        "If you cannot sign in, use “Forgot password” or contact support.",
      ],
      note: "For security reasons we do not reveal whether an email address is registered. Account deletions are logged.",
    },
  },
  subscription: {
    de: {
      intro:
        "Abonnements werden je nach Vertriebsweg unterschiedlich verwaltet. Prüfe zuerst den Kanal, der in deinem Dashboard angezeigt wird.",
      steps: [
        "Öffne im Dashboard den Bereich „Abonnement“.",
        "Bei Kanal „Web“ kannst du dort kündigen; die Kündigung gilt zum Periodenende.",
        "Bei Kanal „Amazon Appstore“ erfolgt die Kündigung in deinem Amazon-Konto.",
        "Rechnungen und Zahlungsstatus erhältst du von deinem jeweiligen Anbieter.",
      ],
      note: "Zahlungen werden ausschließlich über Stripe abgewickelt. Der Status wird erst nach serverseitiger Bestätigung aktiv.",
    },
    en: {
      intro:
        "Subscriptions are managed differently depending on the sales channel. Check the channel shown in your dashboard first.",
      steps: [
        "Open the “Subscription” section in your dashboard.",
        "For the “web” channel you can cancel there; cancellation applies at the period end.",
        "For the “Amazon Appstore” channel, cancel in your Amazon account.",
        "Invoices and payment status come from your respective provider.",
      ],
      note: "Payments are processed exclusively via Stripe. The status becomes active only after server-side confirmation.",
    },
  },
};

export function getHelpArticle(key: HelpTopicKey, locale: Locale) {
  return helpArticles[key][locale === "de" ? "de" : "en"];
}
