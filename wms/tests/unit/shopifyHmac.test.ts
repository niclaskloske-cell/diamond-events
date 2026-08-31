import { describe, expect, it } from "vitest";
import { signShopifyPayload, verifyShopifyHmac } from "@/services/shopify/hmac";

const SECRET = "shpss_geheim";
const BODY = JSON.stringify({ id: 1047, name: "#1047" });

describe("Shopify-Webhook-Signatur", () => {
  it("akzeptiert eine korrekt signierte Nutzlast", () => {
    const signatur = signShopifyPayload(BODY, SECRET);
    expect(verifyShopifyHmac(BODY, signatur, SECRET)).toBe(true);
  });

  it("lehnt eine veraenderte Nutzlast ab", () => {
    const signatur = signShopifyPayload(BODY, SECRET);
    const manipuliert = JSON.stringify({ id: 1047, name: "#9999" });
    expect(verifyShopifyHmac(manipuliert, signatur, SECRET)).toBe(false);
  });

  it("lehnt eine Signatur mit falschem Secret ab", () => {
    const signatur = signShopifyPayload(BODY, "anderes-secret");
    expect(verifyShopifyHmac(BODY, signatur, SECRET)).toBe(false);
  });

  it("lehnt fehlende Signatur und fehlendes Secret ab", () => {
    const signatur = signShopifyPayload(BODY, SECRET);
    expect(verifyShopifyHmac(BODY, null, SECRET)).toBe(false);
    expect(verifyShopifyHmac(BODY, undefined, SECRET)).toBe(false);
    expect(verifyShopifyHmac(BODY, "", SECRET)).toBe(false);
    expect(verifyShopifyHmac(BODY, signatur, "")).toBe(false);
  });

  it("lehnt unsinnige Signaturen ab, ohne zu werfen", () => {
    for (const wert of ["unsinn", "!!!", "a".repeat(200)]) {
      expect(verifyShopifyHmac(BODY, wert, SECRET), wert).toBe(false);
    }
  });

  it("arbeitet auf Buffer und String gleich", () => {
    const signatur = signShopifyPayload(BODY, SECRET);
    expect(verifyShopifyHmac(Buffer.from(BODY, "utf8"), signatur, SECRET)).toBe(true);
  });

  it("unterscheidet Nutzlasten, die sich nur in Leerzeichen unterscheiden", () => {
    // Belegt, warum der rohe Body geprueft werden muss und nicht neu
    // serialisiertes JSON.
    const signatur = signShopifyPayload(BODY, SECRET);
    const neuSerialisiert = JSON.stringify(JSON.parse(BODY), null, 2);
    expect(verifyShopifyHmac(neuSerialisiert, signatur, SECRET)).toBe(false);
  });
});
