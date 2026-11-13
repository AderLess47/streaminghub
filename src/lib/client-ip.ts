/**
 * Ermittelt die Adresse des Clients für Rate-Limits.
 *
 * `X-Forwarded-For` ist eine Liste: Proxys hängen die Adresse des direkten
 * Gegenübers an. Der erste Eintrag stammt vom Client selbst und ist damit frei
 * wählbar – wer ihn auswertet, kann jedes IP-Limit umgehen. Verlässlich ist nur
 * der letzte Eintrag, den der eigene Reverse Proxy angehängt hat
 * (`docs/DEPLOYMENT.md`: genau ein Proxy vor der App).
 *
 * Ohne Header bleibt `unknown`: Dann teilen sich alle Aufrufer einen Eimer,
 * statt dass ein fehlender Proxy die Limits wirkungslos macht.
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded
      .split(",")
      .map((hop) => hop.trim())
      .filter(Boolean);
    if (hops.length > 0) return hops[hops.length - 1];
  }
  return "unknown";
}
