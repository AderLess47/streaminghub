/** Minimaler Ersatz für `next/server` in headless Routentests. */
export const NextResponse = {
  redirect(url: string | URL, status = 307): Response {
    return new Response(null, {
      status,
      headers: { location: url.toString(), "cache-control": "no-store" },
    });
  },
  json(data: unknown, init?: ResponseInit): Response {
    return new Response(JSON.stringify(data), {
      status: init?.status ?? 200,
      headers: { "content-type": "application/json", "cache-control": "no-store", ...init?.headers },
    });
  },
};
