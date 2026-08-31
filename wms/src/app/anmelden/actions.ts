"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { childLogger } from "@/lib/logger";
import { login } from "@/services/auth/authService";
import { endSession, startSession } from "@/lib/auth";
import { safeRedirectTarget } from "@/domain/auth/safeRedirect";

const log = childLogger("anmelden");

const schema = z.object({
  email: z.string().min(1, "Bitte E-Mail eingeben"),
  passwort: z.string().min(1, "Bitte Passwort eingeben"),
  weiter: z.string().optional(),
});

export interface AnmeldeStatus {
  fehler?: string;
}

/**
 * Anmeldung als Server Action.
 *
 * Gibt Fehler als Zustand zurueck statt zu werfen — die Maske soll die Meldung
 * anzeigen, nicht eine Fehlerseite.
 */
export async function anmelden(
  _bisher: AnmeldeStatus,
  formData: FormData,
): Promise<AnmeldeStatus> {
  const eingabe = schema.safeParse({
    email: formData.get("email"),
    passwort: formData.get("passwort"),
    weiter: formData.get("weiter") ?? undefined,
  });

  if (!eingabe.success) {
    return { fehler: eingabe.error.issues[0]?.message ?? "Eingabe unvollständig" };
  }

  let ziel: string;
  try {
    const ergebnis = await login(eingabe.data.email, eingabe.data.passwort);
    if (!ergebnis.ok || !ergebnis.user) {
      return { fehler: ergebnis.message ?? "Anmeldung fehlgeschlagen" };
    }

    await startSession(ergebnis.user);
    ziel = safeRedirectTarget(eingabe.data.weiter);
  } catch (error) {
    // Keine stillen Fehler: erst protokollieren, dann verstaendlich melden.
    log.error({ err: error }, "Anmeldung fehlgeschlagen");
    return {
      fehler:
        "Anmeldung derzeit nicht möglich. Bitte erneut versuchen oder einen Admin informieren.",
    };
  }

  // redirect() wirft intern — deshalb ausserhalb des try-Blocks.
  redirect(ziel);
}

export async function abmelden(): Promise<void> {
  await endSession();
  redirect("/anmelden");
}
