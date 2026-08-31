import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { childLogger } from "@/lib/logger";

const log = childLogger("shopify-webhook");

export type IngestErgebnis =
  | { status: "angenommen"; eventId: string }
  | { status: "duplikat"; eventId: string };

/**
 * Nimmt einen Webhook entgegen und legt ihn zur Verarbeitung ab.
 *
 * Idempotenz: Shopify liefert Webhooks bei Timeouts mehrfach aus. Der UNIQUE
 * Index auf shopifyEventId ist der Duplikatschutz — der zweite Insert scheitert
 * am Index und wird als Duplikat gemeldet, statt die Bestellung ein zweites Mal
 * zu verarbeiten. Bewusst ueber den Index und nicht ueber ein vorheriges SELECT:
 * zwei gleichzeitig eintreffende Zustellungen wuerden beide "noch nicht
 * vorhanden" lesen und beide einfuegen.
 *
 * Die eigentliche Verarbeitung passiert getrennt davon. So kann der Endpunkt
 * sofort mit 200 antworten und Shopify stellt nicht erneut zu.
 */
export async function ingestWebhook(input: {
  shopifyEventId: string;
  shopDomain: string;
  topic: string;
  payload: unknown;
}): Promise<IngestErgebnis> {
  try {
    await db.webhookEvent.create({
      data: {
        shopifyEventId: input.shopifyEventId,
        shopDomain: input.shopDomain,
        topic: input.topic,
        payload: input.payload as Prisma.InputJsonValue,
      },
    });

    log.info(
      { eventId: input.shopifyEventId, topic: input.topic },
      "Webhook angenommen",
    );
    return { status: "angenommen", eventId: input.shopifyEventId };
  } catch (error) {
    if (istEindeutigkeitsVerletzung(error)) {
      log.info(
        { eventId: input.shopifyEventId, topic: input.topic },
        "Webhook-Duplikat verworfen",
      );
      return { status: "duplikat", eventId: input.shopifyEventId };
    }
    throw error;
  }
}

/** Prisma-Fehlercode P2002 = Verletzung einer Eindeutigkeitsbedingung. */
export function istEindeutigkeitsVerletzung(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
  );
}
