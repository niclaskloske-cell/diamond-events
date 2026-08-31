import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  ForbiddenError,
  requirePermission,
  type ActingUser,
  type Permission,
} from "@/domain/auth/permissions";
import { loadActingUser } from "@/services/auth/authService";
import { env } from "@/lib/env";
import {
  SESSION_COOKIE,
  createSessionToken,
  sessionCookieOptions,
  verifySessionToken,
} from "@/lib/session";

/**
 * Server-seitige Auth-Helfer fuer Seiten und Server Actions.
 * Die reine Logik liegt in domain/auth und lib/session — hier wird sie nur
 * mit Cookies und Datenbank verbunden.
 */

/** Angemeldeter Benutzer oder null. Prueft Cookie und Kontostatus. */
export async function getCurrentUser(): Promise<ActingUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = verifySessionToken(token, env().AUTH_SECRET);
  if (!session) return null;

  // Frisch aus der Datenbank: eine zwischenzeitliche Sperre wirkt sofort.
  return loadActingUser(session.userId);
}

/** Erzwingt eine Anmeldung. Leitet sonst zur Anmeldemaske. */
export async function requireUser(): Promise<ActingUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/anmelden");
  return user;
}

/**
 * Erzwingt Anmeldung und ein bestimmtes Recht.
 * Wirft ForbiddenError, damit der Aufrufer eine verstaendliche Meldung zeigen
 * kann, statt still nichts zu tun.
 */
export async function requireUserWith(
  permission: Permission,
): Promise<ActingUser> {
  const user = await requireUser();
  requirePermission(user, permission);
  return user;
}

export async function startSession(user: ActingUser): Promise<void> {
  const token = createSessionToken(
    { userId: user.id, tenantId: user.tenantId, role: user.role },
    env().AUTH_SECRET,
  );
  (await cookies()).set(
    SESSION_COOKIE,
    token,
    sessionCookieOptions(env().NODE_ENV === "production"),
  );
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

export { ForbiddenError };
