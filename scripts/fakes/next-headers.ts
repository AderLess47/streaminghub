/** `next/headers` für Server-Action- und Routen-Tests. */

/** Session-Token aus dem Test; `sh_session` liest weiterhin hier. */
export const sessionToken = { value: null as string | null };

/** Letztes von einer Route gesetztes Session-Cookie (Token und Optionen). */
export const lastSetSession = {
  value: null as string | null,
  options: null as Record<string, unknown> | null,
};

/**
 * Alle übrigen Cookies (etwa `sh_locale`). Der Speicher liegt auf `globalThis`,
 * damit Route und Test dieselbe Kopie sehen, auch wenn sie dieses Modul über
 * verschiedene Pfade laden.
 */
const store = ((globalThis as { __shFakeCookies?: Map<string, string> }).__shFakeCookies ??= new Map());

export function __resetCookies(): void {
  store.clear();
  sessionToken.value = null;
  lastSetSession.value = null;
  lastSetSession.options = null;
}

export function __getCookie(name: string): string | undefined {
  if (name === "sh_session" && sessionToken.value) return sessionToken.value;
  return store.get(name);
}

export async function cookies() {
  return {
    get(name: string) {
      if (name === "sh_session" && sessionToken.value) {
        return { name, value: sessionToken.value };
      }
      const value = store.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set(name: string, value: string, options?: Record<string, unknown>) {
      // Das Session-Cookie bleibt bewusst aus dem allgemeinen Speicher: Ob ein
      // Test angemeldet ist, entscheidet allein `sessionToken`. Sonst würde
      // eine Registrierung im selben Test als offene Sitzung weiterwirken.
      if (name === "sh_session") {
        lastSetSession.value = value;
        lastSetSession.options = options ?? null;
        return;
      }
      store.set(name, value);
    },
    delete(name: string) {
      if (name === "sh_session") {
        sessionToken.value = null;
        lastSetSession.value = null;
        return;
      }
      store.delete(name);
    },
  };
}

export async function headers() {
  return new Headers();
}
