import { z } from "zod";

/**
 * Server-seitige Umgebungsvariablen, einmalig beim Start validiert.
 *
 * Absicht: Ein fehlendes Secret soll das Deployment sofort und mit klarer
 * Meldung stoppen — nicht erst Stunden spaeter mitten im Packvorgang.
 * Deshalb wird hier bewusst geworfen und nicht auf Defaults ausgewichen.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().url("DATABASE_URL muss eine gueltige URL sein"),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET muss mindestens 32 Zeichen haben"),

  // Optional, solange die jeweilige Integration noch nicht aktiv ist.
  SHOPIFY_API_SECRET: z.string().optional(),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),

  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validiert ein beliebiges Objekt gegen das Schema. Ausgelagert, damit die
 * Regel in Tests ohne echte Prozess-Umgebung geprueft werden kann.
 */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Ungueltige Umgebungsvariablen:\n${details}\n\n` +
        "Bitte .env anhand von .env.example vervollstaendigen.",
    );
  }

  return result.data;
}

let cached: Env | undefined;

/** Validierte Umgebung. Ergebnis wird nach dem ersten Aufruf gecached. */
export function env(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}

/**
 * Push ist nur nutzbar, wenn beide VAPID-Schluessel gesetzt sind.
 * Wird an mehreren Stellen geprueft, deshalb hier zentral.
 */
export function isPushConfigured(e: Env): boolean {
  return Boolean(e.VAPID_PUBLIC_KEY && e.VAPID_PRIVATE_KEY);
}
