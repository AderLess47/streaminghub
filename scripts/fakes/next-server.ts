/** Minimaler Ersatz für `next/server` in headless Routentests. */
export const NextResponse = {
  json(data: unknown, init?: ResponseInit): Response {
    return new Response(JSON.stringify(data), {
      status: init?.status ?? 200,
      headers: { "content-type": "application/json", "cache-control": "no-store", ...init?.headers },
    });
  },
};
