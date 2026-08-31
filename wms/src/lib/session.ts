import { createHmac, timingSafeEqual } from "node:crypto";
import { isRole, type Role } from "@/domain/auth/permissions";

/**
 * Signierte, zustandslose Session-Cookies.
 *
 * Warum selbst gebaut statt einer Session-Bibliothek: der Inhalt ist winzig
 * (Benutzer-ID, Mandant, Rolle, Ablauf) und wird ausschliesslich signiert,
 * nicht verschluesselt. Das kommt ohne Session-Speicher aus — wichtig, weil
 * mehrere Scanner gleichzeitig arbeiten und ein Dateispeicher dabei zum
 * Engpass wird. Die Signatur nutzt HMAC-SHA256 aus der Standardbibliothek.
 *
 * Achtung: Der Inhalt ist lesbar, nur nicht faelschbar. Deshalb gehoert dort
 * nichts Vertrauliches hinein.
 */

export { SESSION_COOKIE } from "@/lib/sessionCookie";

const DEFAULT_TTL_SECONDS = 12 * 60 * 60; // Eine lange Lagerschicht.

export interface SessionPayload {
  userId: string;
  tenantId: string;
  role: Role;
  /** Ablaufzeitpunkt als Unix-Sekunden. */
  exp: number;
}

function sign(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

/** Erzeugt den Cookie-Wert: "<base64url(payload)>.<signatur>". */
export function createSessionToken(
  session: Omit<SessionPayload, "exp">,
  secret: string,
  options: { ttlSeconds?: number; now?: Date } = {},
): string {
  const now = options.now ?? new Date();
  const ttl = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const payload: SessionPayload = {
    ...session,
    exp: Math.floor(now.getTime() / 1000) + ttl,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded, secret)}`;
}

/**
 * Prueft Signatur und Ablauf. Gibt bei jedem Problem null zurueck statt zu
 * werfen: ein manipuliertes oder abgelaufenes Cookie ist kein Serverfehler,
 * sondern fuehrt zur Anmeldeseite.
 */
export function verifySessionToken(
  token: string | undefined | null,
  secret: string,
  now: Date = new Date(),
): SessionPayload | null {
  if (!token) return null;

  const separator = token.lastIndexOf(".");
  if (separator <= 0) return null;

  const encoded = token.slice(0, separator);
  const signature = token.slice(separator + 1);

  const expected = Buffer.from(sign(encoded, secret));
  const received = Buffer.from(signature);
  // Laengenvergleich vorab, weil timingSafeEqual bei ungleicher Laenge wirft.
  if (expected.length !== received.length) return null;
  if (!timingSafeEqual(expected, received)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (!isSessionPayload(parsed)) return null;
  if (parsed.exp <= Math.floor(now.getTime() / 1000)) return null;

  return parsed;
}

function isSessionPayload(value: unknown): value is SessionPayload {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.userId === "string" &&
    v.userId.length > 0 &&
    typeof v.tenantId === "string" &&
    v.tenantId.length > 0 &&
    typeof v.exp === "number" &&
    Number.isFinite(v.exp) &&
    isRole(v.role)
  );
}

/** Cookie-Optionen. httpOnly und sameSite schuetzen gegen XSS und CSRF. */
export function sessionCookieOptions(isProduction: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isProduction,
    path: "/",
    maxAge: DEFAULT_TTL_SECONDS,
  };
}
