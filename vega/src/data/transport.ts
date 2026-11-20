/**
 * Transport-Hinweis für Quellen, die unverschlüsselt übertragen werden.
 *
 * IPTV-Anbieter liefern Playlists und Streams häufig nur über HTTP. Das lässt
 * sich nicht verbieten, ohne viele Anbieter auszusperren – aber die App soll es
 * sichtbar machen, statt stillschweigend Klartext abzuspielen. Die App-eigene
 * API ist davon nicht betroffen, die läuft ausschließlich über HTTPS.
 */
export function insecureTransportHint(url: string | null | undefined): string | null {
  const value = url?.trim();
  if (!value) return null;
  try {
    return new URL(value).protocol === "http:"
      ? "Unverschlüsselt (HTTP): Diese Quelle kann unterwegs mitgelesen werden."
      : null;
  } catch {
    return null;
  }
}
