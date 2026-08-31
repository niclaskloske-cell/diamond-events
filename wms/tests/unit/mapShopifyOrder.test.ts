import { describe, expect, it } from "vitest";
import { mapShopifyOrder, ShopifyMappingError } from "@/domain/shopify/mapOrder";

/** Bestellung #1047 aus der Anforderung, im Format der Shopify-REST-API. */
function bestellung(ueberschreibungen: Record<string, unknown> = {}) {
  return {
    id: 5123456789,
    name: "#1047",
    order_number: 1047,
    created_at: "2026-08-29T09:12:00+02:00",
    customer: { id: 77, email: "kundin@example.de", first_name: "Mia", last_name: "Berg" },
    shipping_address: {
      name: "Mia Berg",
      address1: "Hauptstr. 1",
      address2: "",
      zip: "10115",
      city: "Berlin",
      country_code: "DE",
    },
    line_items: [
      {
        id: 111,
        sku: "SQ-ERDBEER-BUTTER",
        title: "Erdbeer Butter Squishy",
        quantity: 2,
        variant_id: 999,
        product_id: 888,
      },
      { id: 222, sku: "SQ-KLICKY-LED", title: "Klicky LED", quantity: 1, variant_id: 998 },
    ],
    ...ueberschreibungen,
  };
}

describe("Shopify-Bestellung uebersetzen", () => {
  it("uebernimmt Nummer, Datum und Positionen", () => {
    const auftrag = mapShopifyOrder(bestellung());

    expect(auftrag.shopifyOrderId).toBe("5123456789");
    expect(auftrag.orderNumber).toBe("#1047");
    expect(auftrag.placedAt.toISOString()).toBe("2026-08-29T07:12:00.000Z");
    expect(auftrag.items).toHaveLength(2);
    expect(auftrag.items[0]).toMatchObject({
      shopifyLineItemId: "111",
      sku: "SQ-ERDBEER-BUTTER",
      quantityOrdered: 2,
    });
    expect(auftrag.warnungen).toEqual([]);
  });

  it("wandelt Zahlen-IDs in Strings, damit sie stabil vergleichbar sind", () => {
    const auftrag = mapShopifyOrder(bestellung());
    expect(auftrag.shopifyOrderId).toBeTypeOf("string");
    expect(auftrag.items[0]?.shopifyVariantId).toBe("999");
  });

  it("haengt den Variantennamen an den Titel", () => {
    const auftrag = mapShopifyOrder(
      bestellung({
        line_items: [
          { id: 1, sku: "A", title: "Squishy", variant_title: "Groß", quantity: 1 },
        ],
      }),
    );
    expect(auftrag.items[0]?.name).toBe("Squishy — Groß");
  });

  it("faellt bei fehlendem name auf order_number zurueck", () => {
    const auftrag = mapShopifyOrder(bestellung({ name: undefined }));
    expect(auftrag.orderNumber).toBe("#1047");
  });

  it("faellt ohne jede Nummer auf die Shopify-ID zurueck", () => {
    const auftrag = mapShopifyOrder(
      bestellung({ name: undefined, order_number: undefined }),
    );
    expect(auftrag.orderNumber).toBe("5123456789");
  });

  it("ueberspringt Positionen mit Menge 0", () => {
    const auftrag = mapShopifyOrder(
      bestellung({
        line_items: [
          { id: 1, sku: "A", title: "Storniert", quantity: 0 },
          { id: 2, sku: "B", title: "Bleibt", quantity: 1 },
        ],
      }),
    );
    expect(auftrag.items.map((i) => i.sku)).toEqual(["B"]);
  });

  it("ueberspringt Positionen ohne Versandpflicht", () => {
    const auftrag = mapShopifyOrder(
      bestellung({
        line_items: [
          { id: 1, sku: "GUTSCHEIN", title: "Digital", quantity: 1, requires_shipping: false },
          { id: 2, sku: "B", title: "Bleibt", quantity: 1 },
        ],
      }),
    );
    expect(auftrag.items.map((i) => i.sku)).toEqual(["B"]);
  });

  it("warnt bei fehlender SKU, blockiert die Bestellung aber nicht", () => {
    const auftrag = mapShopifyOrder(
      bestellung({
        line_items: [
          { id: 1, sku: null, title: "Ohne SKU", quantity: 1 },
          { id: 2, sku: "B", title: "Mit SKU", quantity: 1 },
        ],
      }),
    );
    expect(auftrag.items).toHaveLength(2);
    expect(auftrag.warnungen.join(" ")).toMatch(/Ohne SKU/);
  });

  it("warnt, wenn keine versandpflichtige Position uebrig bleibt", () => {
    const auftrag = mapShopifyOrder(bestellung({ line_items: [] }));
    expect(auftrag.warnungen.join(" ")).toMatch(/keine versandpflichtigen/);
  });

  it("warnt bei fehlender Lieferadresse", () => {
    const auftrag = mapShopifyOrder(bestellung({ shipping_address: null }));
    expect(auftrag.shippingAddress).toBeNull();
    expect(auftrag.warnungen.join(" ")).toMatch(/Keine Lieferadresse/);
  });

  it("entfernt leere Adressfelder aus dem Snapshot", () => {
    const auftrag = mapShopifyOrder(bestellung());
    expect(auftrag.shippingAddress).not.toHaveProperty("address2");
    expect(auftrag.shippingAddress).toMatchObject({ city: "Berlin", zip: "10115" });
  });

  it("erkennt eine stornierte Bestellung", () => {
    const auftrag = mapShopifyOrder(
      bestellung({ cancelled_at: "2026-08-30T10:00:00Z" }),
    );
    expect(auftrag.cancelled).toBe(true);
    expect(mapShopifyOrder(bestellung()).cancelled).toBe(false);
  });

  it("nimmt den Kundennamen notfalls aus der Lieferadresse", () => {
    const auftrag = mapShopifyOrder(bestellung({ customer: null }));
    expect(auftrag.customer.name).toBe("Mia Berg");
    expect(auftrag.customer.email).toBeNull();
  });

  it("ignoriert unbekannte Felder, damit API-Erweiterungen nichts blockieren", () => {
    const auftrag = mapShopifyOrder(
      bestellung({ neues_feld_von_shopify: { irgendwas: true } }),
    );
    expect(auftrag.items).toHaveLength(2);
  });

  it("wirft bei unlesbarer Nutzlast mit deutscher Meldung", () => {
    for (const wert of [null, "text", {}, { id: 1 }]) {
      expect(() => mapShopifyOrder(wert)).toThrow(ShopifyMappingError);
    }
    expect(() => mapShopifyOrder({})).toThrow(/konnte nicht gelesen werden/);
  });

  it("wirft bei ungueltigem Bestelldatum", () => {
    expect(() => mapShopifyOrder(bestellung({ created_at: "kein-datum" }))).toThrow(
      /kein gueltiges Datum/,
    );
  });
});
