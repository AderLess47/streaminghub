/**
 * Übersetzt technische Player- und DRM-Fehler in Sätze, die auf dem Fernseher
 * weiterhelfen.
 *
 * Shaka meldet Fehler wie `Shaka Error DRM.LICENSE_REQUEST_FAILED (6007)` oder
 * `DRM.FAILED_TO_CREATE_CDM`. Auf einem Fernseher ohne Konsole ist das keine
 * Information, sondern nur ein schwarzes Bild. Die Meldung nennt deshalb die
 * wahrscheinliche Ursache und immer den Weg zurück – die vollständige
 * Fehlermeldung bleibt im Geräte-Log.
 */

export type PlaybackErrorContext = {
  /** Der Sender trägt DRM-Angaben aus der Playlist. */
  drm?: boolean;
  /** Secure Buffers sind für diesen Start aktiviert. */
  secureBuffers?: boolean;
};

const BACK_HINT = "Mit „Zurück“ geht es zur Senderliste.";

function withBack(message: string): string {
  return `${message} ${BACK_HINT}`;
}

function textOf(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message ?? "");
  }
  return "";
}

export function describePlaybackError(
  error: unknown,
  context: PlaybackErrorContext = {},
): string {
  const text = textOf(error).toLowerCase();

  if (/failed_to_create_cdm|no.*cdm|cdm.*not|widevine.*not.*support/.test(text)) {
    return withBack(
      context.secureBuffers
        ? "Dieses Gerät kann den geschützten Pfad nicht öffnen. Schalte „Secure Buffers“ in den Einstellungen aus und starte den Sender erneut."
        : "Dieses Gerät kann den geschützten Pfad nicht öffnen.",
    );
  }

  if (/no_license_server|license.*not configured|drm_license_uri/.test(text)) {
    return withBack(
      "Für diesen verschlüsselten Sender fehlt eine Lizenzadresse in der Playlist. Ohne sie kann die App keinen Schlüssel holen.",
    );
  }

  if (
    /license_request_failed|license_rejected|invalid_license|expired_license|malformed_license|forbidden|60\d\d/.test(
      text,
    )
  ) {
    return withBack(
      "Der Lizenzserver hat die Wiedergabe abgelehnt. Häufigste Ursachen: abgelaufene oder falsche Lizenzangaben in der Playlist, ein Token im Header, das nicht mehr gilt, oder ein Anbieter, der dieses Gerät nicht zulässt.",
    );
  }

  if (/unsupported_key_system|key system.*not supported|no supported key/.test(text)) {
    return withBack(
      "Dieses Gerät unterstützt das DRM-System des Senders nicht. Vega spielt Widevine und PlayReady.",
    );
  }

  if (/network|timeout|failed to fetch|econn|enotfound|http \d\d\d/.test(text)) {
    return withBack(
      "Der Sender oder sein Lizenzserver war nicht erreichbar. Prüfe die Verbindung und versuche es erneut.",
    );
  }

  if (context.drm) {
    return withBack(
      "Die verschlüsselte Wiedergabe ist gescheitert. Prüfe die DRM-Angaben des Senders oder versuche es später erneut.",
    );
  }

  return withBack("Die Quelle konnte nicht wiedergegeben werden.");
}
