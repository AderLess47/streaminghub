import { NextResponse, type NextRequest } from "next/server";

/**
 * Reicht den Pfad an die Anwendung weiter, damit das Root-Layout den
 * Wartungsmodus auf öffentliche Seiten beschränken kann, ohne Admin, Status
 * oder API zu blockieren. Bewusst ohne Datenbankzugriff: Die Middleware bleibt
 * damit Edge-kompatibel und kostet nur einen Header.
 */
export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-pathname", request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:png|jpe?g|gif|svg|webp|ico|apk|txt|xml)$).*)",
  ],
};
