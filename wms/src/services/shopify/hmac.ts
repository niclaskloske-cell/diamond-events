import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Pruefung der Shopify-Webhook-Signatur.
 *
 * Shopify signiert jeden Webhook mit dem Shared Secret der App und legt das
 * Ergebnis base64-kodiert in den Header X-Shopify-Hmac-Sha256. Ohne diese
 * Pruefung koennte jeder mit Kenntnis der Endpunkt-URL Bestellungen ins WMS
 * schieben.
 *
 * Wichtig: Die Signatur wird ueber den **rohen** Request-Body gebildet. Ein
 * bereits geparster und wieder serialisierter JSON-Text ergibt eine andere
 * Signatur (Schluesselreihenfolge, Leerzeichen). Der Aufrufer muss deshalb
 * request.text() verwenden, nicht request.json().
 */
export function verifyShopifyHmac(
  rawBody: string | Buffer,
  headerSignature: string | null | undefined,
  secret: string,
): boolean {
  if (!headerSignature || !secret) return false;

  const expected = createHmac("sha256", secret)
    .update(typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody)
    .digest();

  let received: Buffer;
  try {
    received = Buffer.from(headerSignature, "base64");
  } catch {
    return false;
  }

  // Laengenvergleich vorab: timingSafeEqual wirft bei ungleicher Laenge.
  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
}

/** Erzeugt eine Signatur — fuer Tests und lokale Webhook-Simulation. */
export function signShopifyPayload(
  rawBody: string | Buffer,
  secret: string,
): string {
  return createHmac("sha256", secret).update(rawBody).digest("base64");
}
