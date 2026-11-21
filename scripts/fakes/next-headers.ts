/** `next/headers` für Server-Action-Tests: ein Session-Token aus dem Test. */
export const sessionToken = { value: null as string | null };
/** Letztes von einer Route gesetztes Session-Cookie (Token und Optionen). */
export const lastSetSession = {
  value: null as string | null,
  options: null as Record<string, unknown> | null,
};

export async function cookies() {
  return {
    get(name: string) {
      if (name === "sh_session" && sessionToken.value) {
        return { name, value: sessionToken.value };
      }
      return undefined;
    },
    set(name: string, value: string, options?: Record<string, unknown>) {
      if (name === "sh_session") {
        lastSetSession.value = value;
        lastSetSession.options = options ?? null;
      }
    },
    delete() {},
  };
}

export async function headers() {
  return new Headers();
}
