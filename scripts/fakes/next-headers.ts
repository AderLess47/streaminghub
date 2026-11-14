/** `next/headers` für Server-Action-Tests: ein Session-Token aus dem Test. */
export const sessionToken = { value: null as string | null };
/** Letztes von einer Route gesetztes Session-Cookie (Token). */
export const lastSetSession = { value: null as string | null };

export async function cookies() {
  return {
    get(name: string) {
      if (name === "sh_session" && sessionToken.value) {
        return { name, value: sessionToken.value };
      }
      return undefined;
    },
    set(name: string, value: string) {
      if (name === "sh_session") lastSetSession.value = value;
    },
    delete() {},
  };
}

export async function headers() {
  return new Headers();
}
