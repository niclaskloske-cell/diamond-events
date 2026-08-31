import { db } from "@/lib/db";
import { childLogger } from "@/lib/logger";
import { verifyPassword } from "@/lib/password";
import type { ActingUser, Role } from "@/domain/auth/permissions";

const log = childLogger("auth");

export interface LoginResult {
  ok: boolean;
  user?: ActingUser;
  /** Fertige Meldung fuer die Anmeldemaske. */
  message?: string;
}

/**
 * Prueft Anmeldedaten gegen die Datenbank.
 *
 * Die Meldung ist bei unbekannter E-Mail und falschem Passwort absichtlich
 * identisch: sonst laesst sich ueber die Anmeldemaske herausfinden, welche
 * Adressen im System existieren. Ein deaktiviertes Konto bekommt dagegen eine
 * eigene Meldung — dort hilft der Hinweis dem Mitarbeiter, und die Adresse ist
 * ohnehin bereits bekannt.
 */
export async function login(
  email: string,
  password: string,
): Promise<LoginResult> {
  const normalizedEmail = email.trim().toLowerCase();
  const abgelehnt: LoginResult = {
    ok: false,
    message: "E-Mail oder Passwort ist falsch.",
  };

  if (!normalizedEmail || !password) return abgelehnt;

  const user = await db.user.findUnique({ where: { email: normalizedEmail } });

  if (!user) {
    // Trotzdem einen Hash pruefen, damit die Antwortzeit nicht verraet, ob die
    // Adresse existiert.
    await verifyPassword(password, "scrypt$00$00");
    log.info({ email: normalizedEmail }, "Anmeldung mit unbekannter E-Mail");
    return abgelehnt;
  }

  if (!(await verifyPassword(password, user.passwordHash))) {
    log.info({ userId: user.id }, "Anmeldung mit falschem Passwort");
    return abgelehnt;
  }

  if (!user.active) {
    log.warn({ userId: user.id }, "Anmeldung eines deaktivierten Kontos");
    return {
      ok: false,
      message: "Dieses Konto ist deaktiviert. Bitte an einen Admin wenden.",
    };
  }

  log.info({ userId: user.id, role: user.role }, "Anmeldung erfolgreich");
  return {
    ok: true,
    user: {
      id: user.id,
      role: user.role as Role,
      active: user.active,
      tenantId: user.tenantId,
    },
  };
}

/**
 * Laedt den Benutzer zu einer Sitzung frisch aus der Datenbank.
 *
 * Bewusst kein Vertrauen auf die Rolle im Cookie: wird ein Konto deaktiviert
 * oder herabgestuft, greift das damit sofort und nicht erst, wenn das Cookie
 * ablaeuft.
 */
export async function loadActingUser(
  userId: string,
): Promise<ActingUser | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, active: true, tenantId: true },
  });

  if (!user || !user.active) return null;
  return { ...user, role: user.role as Role };
}
