/** `next/navigation` für Server-Action-Tests: redirect wirft wie in Next.js. */
export class RedirectError extends Error {
  digest: string;

  constructor(url: string) {
    super(`NEXT_REDIRECT: ${url}`);
    this.name = "RedirectError";
    this.digest = `NEXT_REDIRECT;replace;${url};307;`;
  }
}

export function redirect(url: string): never {
  throw new RedirectError(url);
}

export function notFound(): never {
  throw new Error("NEXT_NOT_FOUND");
}
