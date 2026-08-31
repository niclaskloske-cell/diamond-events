import { describe, expect, it, vi } from "vitest";
import {
  ShopifyApiError,
  shopifyGraphQL,
  SHOPIFY_API_VERSION,
} from "@/services/shopify/client";

const CREDENTIALS = { domain: "squishova.myshopify.com", accessToken: "shpat_test" };

function antwort(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
}

describe("Shopify Admin API Client", () => {
  it("liefert die Daten einer erfolgreichen Abfrage", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(antwort({ data: { shop: { name: "Squishova" } } }));

    const daten = await shopifyGraphQL<{ shop: { name: string } }>(
      CREDENTIALS,
      "{ shop { name } }",
      {},
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );

    expect(daten.shop.name).toBe("Squishova");
  });

  it("sendet Token und feste API-Version", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(antwort({ data: {} }));

    await shopifyGraphQL(CREDENTIALS, "{}", {}, { fetchImpl: fetchImpl as unknown as typeof fetch });

    const aufruf = fetchImpl.mock.calls[0];
    expect(aufruf).toBeDefined();
    const [url, init] = aufruf!;
    expect(url).toContain(`/admin/api/${SHOPIFY_API_VERSION}/graphql.json`);
    expect(init.headers["X-Shopify-Access-Token"]).toBe("shpat_test");
  });

  it("wiederholt bei 429 und liefert danach das Ergebnis", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(antwort({}, { status: 429, headers: { "Retry-After": "0" } }))
      .mockResolvedValueOnce(antwort({ data: { ok: true } }));

    const daten = await shopifyGraphQL<{ ok: boolean }>(
      CREDENTIALS,
      "{}",
      {},
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );

    expect(daten.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("wiederholt bei 5xx", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(antwort({}, { status: 503 }))
      .mockResolvedValueOnce(antwort({ data: { ok: true } }));

    await shopifyGraphQL(CREDENTIALS, "{}", {}, { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("wiederholt bei Netzwerkfehlern", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce(antwort({ data: { ok: true } }));

    await shopifyGraphQL(CREDENTIALS, "{}", {}, { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("wiederholt NICHT bei 401 und nennt die Zugangsdaten", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(antwort({}, { status: 401 }));

    await expect(
      shopifyGraphQL(CREDENTIALS, "{}", {}, { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow(/Zugangsdaten/);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("meldet GraphQL-Fehler im Klartext, ohne zu wiederholen", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(antwort({ errors: [{ message: "Field 'foo' doesn't exist" }] }));

    await expect(
      shopifyGraphQL(CREDENTIALS, "{}", {}, { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow(/Field 'foo'/);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("gibt nach der letzten Wiederholung auf und wirft den letzten Fehler", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(antwort({}, { status: 503 }));

    await expect(
      shopifyGraphQL(
        CREDENTIALS,
        "{}",
        {},
        { fetchImpl: fetchImpl as unknown as typeof fetch, maxVersuche: 2 },
      ),
    ).rejects.toBeInstanceOf(ShopifyApiError);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("wirft, wenn Shopify weder Daten noch Fehler liefert", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(antwort({}));

    await expect(
      shopifyGraphQL(CREDENTIALS, "{}", {}, { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow(/keine Daten/);
  });
});
