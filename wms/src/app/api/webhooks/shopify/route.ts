import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { childLogger } from "@/lib/logger";
import { verifyShopifyHmac } from "@/services/shopify/hmac";
import { ingestWebhook } from "@/services/shopify/webhookIngest";

const log = childLogger("shopify-webhook-route");

/**
 * Empfaengt Shopify-Webhooks.
 *
 * Ablauf bewusst in dieser Reihenfolge:
 *  1. Rohen Body lesen — die Signatur wird ueber die unveraenderten Bytes
 *     gebildet, geparstes und neu serialisiertes JSON ergaebe eine andere.
 *  2. HMAC pruefen, bevor irgendetwas anderes passiert.
 *  3. Ereignis ablegen (Duplikatschutz ueber den UNIQUE-Index) und sofort mit
 *     200 antworten. Die Verarbeitung laeuft getrennt, damit Shopify nicht in
 *     einen Timeout laeuft und erneut zustellt.
 *
 * Diese Route ist in der Middleware vom Anmeldezwang ausgenommen: Shopify
 * schickt keine Cookies. Die Signatur ist hier die Authentifizierung.
 */
export async function POST(request: NextRequest) {
  const shopDomain = request.headers.get("x-shopify-shop-domain");
  const topic = request.headers.get("x-shopify-topic");
  const eventId = request.headers.get("x-shopify-event-id");
  const signatur = request.headers.get("x-shopify-hmac-sha256");

  if (!shopDomain || !topic || !eventId) {
    log.warn({ shopDomain, topic, eventId }, "Webhook ohne Pflichtheader");
    return NextResponse.json(
      { fehler: "Erforderliche Shopify-Header fehlen." },
      { status: 400 },
    );
  }

  const rawBody = await request.text();

  const shop = await db.shop.findUnique({ where: { domain: shopDomain } });
  if (!shop?.webhookSecret) {
    // Kein "404 unbekannter Shop": das wuerde verraten, welche Domains
    // eingerichtet sind. Nach aussen ist es schlicht eine falsche Signatur.
    log.warn({ shopDomain }, "Webhook für unbekannten oder unkonfigurierten Shop");
    return NextResponse.json({ fehler: "Signatur ungültig." }, { status: 401 });
  }

  if (!verifyShopifyHmac(rawBody, signatur, shop.webhookSecret)) {
    log.warn({ shopDomain, topic, eventId }, "Webhook mit ungültiger Signatur");
    return NextResponse.json({ fehler: "Signatur ungültig." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    log.warn({ eventId, topic }, "Webhook mit unlesbarem JSON");
    return NextResponse.json({ fehler: "Nutzlast ist kein gültiges JSON." }, { status: 400 });
  }

  try {
    const ergebnis = await ingestWebhook({
      shopifyEventId: eventId,
      shopDomain,
      topic,
      payload,
    });
    return NextResponse.json(ergebnis, { status: 200 });
  } catch (error) {
    // Keine stillen Fehler: protokollieren und mit 500 antworten, damit
    // Shopify erneut zustellt — der Duplikatschutz faengt eine Doppelung ab.
    log.error({ err: error, eventId, topic }, "Webhook konnte nicht abgelegt werden");
    return NextResponse.json(
      { fehler: "Webhook konnte nicht verarbeitet werden." },
      { status: 500 },
    );
  }
}
