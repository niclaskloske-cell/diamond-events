import pino from "pino";

/**
 * Strukturiertes Logging. Anforderung: keine stillen Fehler — jeder API-Fehler
 * wird geloggt, bevor er dem Benutzer angezeigt wird.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { app: "squishova-wms" },
  redact: {
    // Niemals Secrets in die Logs schreiben.
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      'req.headers["x-shopify-hmac-sha256"]',
      "accessToken",
      "password",
      "passwordHash",
    ],
    censor: "[entfernt]",
  },
});

/** Logger mit festem Kontext, z. B. childLogger("shopify-webhook"). */
export function childLogger(scope: string, extra: Record<string, unknown> = {}) {
  return logger.child({ scope, ...extra });
}
