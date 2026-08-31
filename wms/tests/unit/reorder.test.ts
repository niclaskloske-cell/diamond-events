import { describe, expect, it } from "vitest";
import {
  assessMaterial,
  averageDailyUsage,
  daysOfStock,
  materialsNeedingAttention,
  type MaterialForReorder,
} from "@/domain/stock/reorder";

function material(o: Partial<MaterialForReorder> = {}): MaterialForReorder {
  return {
    id: "holo-m",
    name: "Hologramm-Versandtasche M",
    stock: 24,
    minStock: 30,
    dailyUsage: 8,
    leadTimeDays: 5,
    defaultOrderQty: 500,
    ...o,
  };
}

describe("Verbrauchsberechnung", () => {
  it("mittelt den Verbrauch ueber den Zeitraum", () => {
    expect(averageDailyUsage([10, 10, 4], 3)).toBeCloseTo(8);
  });

  it("rechnet mit Betraegen, egal ob Deltas negativ geliefert werden", () => {
    expect(averageDailyUsage([-10, -10, -4], 3)).toBeCloseTo(8);
  });

  it("gibt 0 zurueck, statt durch null zu teilen", () => {
    expect(averageDailyUsage([5], 0)).toBe(0);
  });

  it("berechnet die Reichweite abgerundet in ganzen Tagen", () => {
    expect(daysOfStock(24, 8)).toBe(3);
    expect(daysOfStock(25, 8)).toBe(3);
  });

  it("liefert null, wenn nichts verbraucht wird", () => {
    expect(daysOfStock(24, 0)).toBeNull();
  });
});

describe("Nachbestellbewertung", () => {
  it("erkennt das Beispiel aus der Anforderung als nachbestellpflichtig", () => {
    // Bestand 24, Verbrauch 8/Tag, Lieferzeit 5 Tage, Sicherheitsbestand 10
    const a = assessMaterial(material({ minStock: 10 }));
    expect(a.reorderNeeded).toBe(true);
    expect(a.daysRemaining).toBe(3);
  });

  it("stuft unter dem Mindestbestand als KRITISCH ein", () => {
    expect(assessMaterial(material()).level).toBe("KRITISCH");
  });

  it("stuft ueber dem Mindestbestand, aber innerhalb der Lieferzeit als NIEDRIG ein", () => {
    const a = assessMaterial(material({ stock: 40, minStock: 30 }));
    expect(a.level).toBe("NIEDRIG");
    expect(a.reorderNeeded).toBe(true);
  });

  it("meldet ausreichenden Bestand als OK ohne Bestellvorschlag", () => {
    const a = assessMaterial(material({ stock: 500, minStock: 30 }));
    expect(a.level).toBe("OK");
    expect(a.reorderNeeded).toBe(false);
    expect(a.recommendedOrderQty).toBe(0);
  });

  it("schlaegt mindestens die Standard-Bestellmenge vor", () => {
    expect(assessMaterial(material()).recommendedOrderQty).toBe(500);
  });

  it("rundet bei grosser Luecke auf ein Vielfaches der Bestellmenge auf", () => {
    // Meldebestand = 50*10 + 100 = 600, Bestand 0 -> Luecke 600 -> 2 x 500
    const a = assessMaterial(
      material({ stock: 0, minStock: 100, dailyUsage: 50, leadTimeDays: 10 }),
    );
    expect(a.recommendedOrderQty).toBe(1000);
  });

  it("kommt ohne hinterlegte Standard-Bestellmenge aus", () => {
    const a = assessMaterial(material({ defaultOrderQty: null }));
    expect(a.recommendedOrderQty).toBeGreaterThan(0);
  });

  it("behandelt fehlende Lieferzeit als 0 Tage", () => {
    const a = assessMaterial(material({ stock: 40, minStock: 30, leadTimeDays: null }));
    expect(a.reorderNeeded).toBe(false);
  });
});

describe("Warnliste", () => {
  it("blendet unauffaellige Materialien aus und sortiert kritischste zuerst", () => {
    const liste = materialsNeedingAttention([
      material({ id: "ok", stock: 5000, minStock: 30 }),
      material({ id: "niedrig", stock: 40, minStock: 30 }),
      material({ id: "kritisch", stock: 5, minStock: 30 }),
    ]);
    expect(liste.map((a) => a.materialId)).toEqual(["kritisch", "niedrig"]);
  });
});
