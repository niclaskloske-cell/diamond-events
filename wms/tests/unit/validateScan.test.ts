import { describe, expect, it } from "vitest";
import {
  nextOpenItem,
  pickProgress,
  validateScan,
  type ScannableItem,
} from "@/domain/picking/validateScan";

function item(overrides: Partial<ScannableItem> = {}): ScannableItem {
  return {
    id: "item-1",
    sku: "SQ-ERDBEER-BUTTER",
    barcode: "4260123456789",
    name: "Erdbeer Butter Squishy",
    quantityOrdered: 2,
    quantityPicked: 0,
    ...overrides,
  };
}

describe("Scan-Pruefung beim Picken", () => {
  it("akzeptiert die SKU und zaehlt auf 1/2", () => {
    const result = validateScan(item(), "SQ-ERDBEER-BUTTER");
    expect(result).toMatchObject({
      accepted: true,
      quantityPicked: 1,
      quantityOrdered: 2,
      itemComplete: false,
    });
  });

  it("meldet die Position beim zweiten Scan als vollstaendig (2/2)", () => {
    const result = validateScan(item({ quantityPicked: 1 }), "SQ-ERDBEER-BUTTER");
    expect(result).toMatchObject({ accepted: true, quantityPicked: 2, itemComplete: true });
  });

  it("akzeptiert auch den Barcode", () => {
    expect(validateScan(item(), "4260123456789").accepted).toBe(true);
  });

  it("ignoriert Gross-/Kleinschreibung und Leerzeichen vom Scanner", () => {
    expect(validateScan(item(), "  sq-erdbeer-butter \n").accepted).toBe(true);
  });

  it("lehnt einen falschen Artikel mit dem erwarteten Namen ab", () => {
    const result = validateScan(item(), "SQ-KLICKY-LED");
    expect(result).toEqual({
      accepted: false,
      reason: "FALSCHER_ARTIKEL",
      message: "Falscher Artikel. Erwartet wird: Erdbeer Butter Squishy",
    });
  });

  it("lehnt einen weiteren Scan ab, wenn die Menge erreicht ist", () => {
    const result = validateScan(item({ quantityPicked: 2 }), "SQ-ERDBEER-BUTTER");
    expect(result).toMatchObject({ accepted: false, reason: "MENGE_ERREICHT" });
  });

  it("lehnt einen leeren Code ab", () => {
    expect(validateScan(item(), "   ")).toMatchObject({
      accepted: false,
      reason: "LEERER_CODE",
    });
  });

  it("trifft nicht auf den Barcode, wenn keiner hinterlegt ist", () => {
    const result = validateScan(item({ barcode: null }), "4260123456789");
    expect(result).toMatchObject({ accepted: false, reason: "FALSCHER_ARTIKEL" });
  });
});

describe("Pick-Fortschritt", () => {
  const positionen = [
    item({ id: "a", quantityOrdered: 2, quantityPicked: 2 }),
    item({ id: "b", sku: "SQ-KLICKY-LED", quantityOrdered: 1, quantityPicked: 0 }),
  ];

  it("summiert ueber alle Positionen", () => {
    expect(pickProgress(positionen)).toEqual({
      totalOrdered: 3,
      totalPicked: 2,
      complete: false,
    });
  });

  it("ist erst vollstaendig, wenn jede Position erledigt ist", () => {
    const fertig = positionen.map((p) => ({ ...p, quantityPicked: p.quantityOrdered }));
    expect(pickProgress(fertig).complete).toBe(true);
  });

  it("gilt bei einem leeren Auftrag nicht als vollstaendig", () => {
    expect(pickProgress([]).complete).toBe(false);
  });

  it("liefert die naechste offene Position in Pick-Reihenfolge", () => {
    expect(nextOpenItem(positionen)?.id).toBe("b");
  });

  it("liefert undefined, wenn nichts mehr offen ist", () => {
    const fertig = positionen.map((p) => ({ ...p, quantityPicked: p.quantityOrdered }));
    expect(nextOpenItem(fertig)).toBeUndefined();
  });
});
