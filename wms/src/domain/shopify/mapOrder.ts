import { z } from "zod";

/**
 * Uebersetzt eine Shopify-Bestellung in die Form, die das WMS speichert.
 *
 * Reine Funktion ohne Datenbank: die Zuordnung ist die fehleranfaelligste
 * Stelle der ganzen Integration (Shopify liefert IDs mal als Zahl, mal als
 * String, Adressen fehlen bei digitalen Produkten) und muss deshalb ohne
 * laufende Datenbank pruefbar sein.
 *
 * Das Schema ist bewusst nachsichtig: unbekannte Felder werden ignoriert,
 * damit eine Erweiterung der Shopify-API keine Bestellung blockiert. Streng
 * ist es nur bei dem, was das Lager wirklich braucht.
 */

/** Shopify liefert IDs je nach Endpunkt als Zahl oder String. */
const shopifyId = z.union([z.string(), z.number()]).transform(String);

const lineItemSchema = z.object({
  id: shopifyId,
  sku: z.string().nullish(),
  title: z.string(),
  variant_title: z.string().nullish(),
  quantity: z.number().int().nonnegative(),
  variant_id: shopifyId.nullish(),
  product_id: shopifyId.nullish(),
  /// Bei Vorbestellungen und digitalen Artikeln nicht immer vorhanden.
  requires_shipping: z.boolean().nullish(),
});

const addressSchema = z
  .object({
    name: z.string().nullish(),
    first_name: z.string().nullish(),
    last_name: z.string().nullish(),
    company: z.string().nullish(),
    address1: z.string().nullish(),
    address2: z.string().nullish(),
    zip: z.string().nullish(),
    city: z.string().nullish(),
    province: z.string().nullish(),
    country_code: z.string().nullish(),
    phone: z.string().nullish(),
  })
  .nullish();

export const shopifyOrderSchema = z.object({
  id: shopifyId,
  name: z.string().optional(),
  order_number: z.union([z.string(), z.number()]).optional(),
  created_at: z.string(),
  cancelled_at: z.string().nullish(),
  customer: z
    .object({
      id: shopifyId.nullish(),
      email: z.string().nullish(),
      first_name: z.string().nullish(),
      last_name: z.string().nullish(),
    })
    .nullish(),
  email: z.string().nullish(),
  shipping_address: addressSchema,
  line_items: z.array(lineItemSchema).default([]),
});

export type ShopifyOrderPayload = z.infer<typeof shopifyOrderSchema>;

export interface MappedOrderItem {
  shopifyLineItemId: string;
  shopifyVariantId: string | null;
  sku: string;
  name: string;
  quantityOrdered: number;
}

export interface MappedOrder {
  shopifyOrderId: string;
  orderNumber: string;
  placedAt: Date;
  cancelled: boolean;
  customer: {
    shopifyCustomerId: string | null;
    email: string | null;
    name: string | null;
  };
  shippingAddress: Record<string, string> | null;
  items: MappedOrderItem[];
  /** Hinweise fuer das Lager, die keine Bestellung blockieren sollen. */
  warnungen: string[];
}

export class ShopifyMappingError extends Error {
  constructor(message: string, readonly issues?: unknown) {
    super(message);
    this.name = "ShopifyMappingError";
  }
}

/**
 * Wandelt die Rohdaten um. Wirft nur, wenn die Bestellung fuer das Lager
 * unbrauchbar waere — alles andere wird als Warnung mitgegeben, damit ein
 * Sonderfall nicht den ganzen Auftrag verschluckt.
 */
export function mapShopifyOrder(payload: unknown): MappedOrder {
  const parsed = shopifyOrderSchema.safeParse(payload);
  if (!parsed.success) {
    throw new ShopifyMappingError(
      "Bestellung von Shopify konnte nicht gelesen werden.",
      parsed.error.issues,
    );
  }

  const order = parsed.data;
  const warnungen: string[] = [];

  const placedAt = new Date(order.created_at);
  if (Number.isNaN(placedAt.getTime())) {
    throw new ShopifyMappingError(
      `Bestelldatum "${order.created_at}" ist kein gueltiges Datum.`,
    );
  }

  // Nur versandpflichtige Positionen mit Menge > 0 muessen gepickt werden.
  const items: MappedOrderItem[] = [];
  for (const line of order.line_items) {
    if (line.quantity <= 0) continue;
    if (line.requires_shipping === false) continue;

    const sku = line.sku?.trim() ?? "";
    if (!sku) {
      // Ohne SKU laesst sich nicht scannen — das Lager muss es sehen, aber die
      // uebrigen Positionen sollen trotzdem pickbar sein.
      warnungen.push(`Position "${line.title}" hat keine SKU und kann nicht gescannt werden.`);
    }

    items.push({
      shopifyLineItemId: line.id,
      shopifyVariantId: line.variant_id ?? null,
      sku,
      name: [line.title, line.variant_title].filter(Boolean).join(" — "),
      quantityOrdered: line.quantity,
    });
  }

  if (items.length === 0) {
    warnungen.push("Bestellung enthält keine versandpflichtigen Positionen.");
  }

  if (!order.shipping_address) {
    warnungen.push("Keine Lieferadresse hinterlegt — Versandlabel nicht möglich.");
  }

  return {
    shopifyOrderId: order.id,
    orderNumber: orderNumber(order),
    placedAt,
    cancelled: Boolean(order.cancelled_at),
    customer: {
      shopifyCustomerId: order.customer?.id ?? null,
      email: order.customer?.email ?? order.email ?? null,
      name: kundenName(order),
    },
    shippingAddress: adresse(order.shipping_address),
    items,
    warnungen,
  };
}

/** "#1047" bevorzugt, sonst aus order_number, sonst die rohe ID. */
function orderNumber(order: ShopifyOrderPayload): string {
  if (order.name?.trim()) return order.name.trim();
  if (order.order_number !== undefined) return `#${order.order_number}`;
  return order.id;
}

function kundenName(order: ShopifyOrderPayload): string | null {
  const ausKunde = [order.customer?.first_name, order.customer?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (ausKunde) return ausKunde;

  const adresse = order.shipping_address;
  const ausAdresse =
    adresse?.name?.trim() ||
    [adresse?.first_name, adresse?.last_name].filter(Boolean).join(" ").trim();
  return ausAdresse || null;
}

/** Adresse als flaches Objekt ohne leere Felder — so bleibt der Snapshot lesbar. */
function adresse(
  quelle: ShopifyOrderPayload["shipping_address"],
): Record<string, string> | null {
  if (!quelle) return null;

  const eintraege = Object.entries(quelle).flatMap(([schluessel, wert]) =>
    typeof wert === "string" && wert.trim() ? [[schluessel, wert.trim()] as const] : [],
  );

  return eintraege.length > 0 ? Object.fromEntries(eintraege) : null;
}
