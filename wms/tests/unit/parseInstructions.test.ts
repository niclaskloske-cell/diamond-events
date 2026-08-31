import { describe, expect, it } from "vitest";
import {
  allRequiredChecked,
  parsePackInstructions,
} from "@/domain/packing/parseInstructions";

describe("Packanweisungen aus dem Shopify-Metafeld", () => {
  it("liefert eine leere Liste, wenn nichts hinterlegt ist", () => {
    expect(parsePackInstructions(null)).toEqual([]);
    expect(parsePackInstructions("")).toEqual([]);
    expect(parsePackInstructions("   ")).toEqual([]);
  });

  it("zerlegt den Fliesstext aus dem Beispiel in Einzelpunkte", () => {
    const punkte = parsePackInstructions(
      "Dankeskarte + Regenbogenschlaengchen nicht vergessen.",
    );
    expect(punkte.map((p) => p.text)).toEqual([
      "Dankeskarte",
      "Regenbogenschlaengchen nicht vergessen",
    ]);
  });

  it("zerlegt eine Liste mit Bindestrichen", () => {
    const punkte = parsePackInstructions(
      "- Dankeskarte\n- Regenbogenschlaengchen\n- Squishova-Sticker",
    );
    expect(punkte.map((p) => p.text)).toEqual([
      "Dankeskarte",
      "Regenbogenschlaengchen",
      "Squishova-Sticker",
    ]);
  });

  it("entfernt auch nummerierte Aufzaehlungszeichen", () => {
    expect(parsePackInstructions("1. Karte\n2) Sticker").map((p) => p.text)).toEqual([
      "Karte",
      "Sticker",
    ]);
  });

  it("laesst ein 'und' innerhalb einer bereits gegliederten Liste stehen", () => {
    const punkte = parsePackInstructions("- Karte und Sticker\n- Packband");
    expect(punkte.map((p) => p.text)).toEqual(["Karte und Sticker", "Packband"]);
  });

  it("vergibt fortlaufende Positionen", () => {
    expect(parsePackInstructions("A;B;C").map((p) => p.position)).toEqual([0, 1, 2]);
  });

  it("markiert Punkte als Pflicht, sofern nicht anders gekennzeichnet", () => {
    expect(parsePackInstructions("Dankeskarte")[0]?.required).toBe(true);
  });

  it("erkennt (optional) und entfernt den Marker aus dem Text", () => {
    const punkte = parsePackInstructions("- Dankeskarte\n- Sticker (optional)");
    expect(punkte[1]).toMatchObject({ text: "Sticker", required: false });
    expect(punkte[0]?.required).toBe(true);
  });

  it("verwirft Punkte, die nach dem Bereinigen leer waeren", () => {
    expect(parsePackInstructions("- Karte\n-\n- Sticker")).toHaveLength(2);
  });
});

describe("Freigabe zum Packen", () => {
  const jetzt = new Date();

  it("blockiert, solange ein Pflichtpunkt offen ist", () => {
    expect(
      allRequiredChecked([
        { required: true, checkedAt: jetzt },
        { required: true, checkedAt: null },
      ]),
    ).toBe(false);
  });

  it("gibt frei, wenn alle Pflichtpunkte abgehakt sind", () => {
    expect(
      allRequiredChecked([
        { required: true, checkedAt: jetzt },
        { required: false, checkedAt: null },
      ]),
    ).toBe(true);
  });

  it("gibt frei, wenn es keine Anweisungen gibt", () => {
    expect(allRequiredChecked([])).toBe(true);
  });
});
