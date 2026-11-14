/** `next/headers` für Server-Action-Tests: ein Session-Token aus dem Test. */
export const sessionToken = { value: null as string | null };

export async function cookies() {
  return {
    get(name: string) {
      if (name === "sh_session" && sessionToken.value) {
        return { name, value: sessionToken.value };
      }
      return undefined;
    },
    set() {},
    delete() {},
  };
}

export async function headers() {
  return new Headers();
}
