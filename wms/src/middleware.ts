import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/sessionCookie";

/**
 * Grobfilter fuer nicht angemeldete Aufrufe.
 *
 * Bewusst nur eine Pruefung auf Vorhandensein des Cookies: die Middleware
 * laeuft in der Edge-Runtime, in der node:crypto und damit die Signaturpruefung
 * nicht zur Verfuegung stehen. Die echte Pruefung passiert serverseitig in
 * requireUser(); diese Middleware erspart lediglich den unnoetigen Rendervorgang
 * und ist ausdruecklich keine Sicherheitsgrenze.
 */
const OEFFENTLICH = ["/anmelden", "/api/health"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (OEFFENTLICH.some((pfad) => pathname.startsWith(pfad))) {
    return NextResponse.next();
  }

  if (!request.cookies.has(SESSION_COOKIE)) {
    const ziel = new URL("/anmelden", request.url);
    ziel.searchParams.set("weiter", pathname);
    return NextResponse.redirect(ziel);
  }

  return NextResponse.next();
}

export const config = {
  // Statische Dateien und Webhook-Endpunkte bleiben aussen vor — Shopify
  // schickt keine Cookies mit.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/webhooks).*)"],
};
