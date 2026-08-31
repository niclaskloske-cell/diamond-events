import { describe, expect, it } from "vitest";
import {
  canTransition,
  InvalidTransitionError,
  isTerminal,
  ORDER_STATUSES,
  transition,
} from "@/domain/orders/stateMachine";

describe("Auftrags-Statusmaschine", () => {
  it("laesst den regulaeren Weg bis zum Abschluss zu", () => {
    const weg = [
      "NEU",
      "PICKING",
      "GEPICKT",
      "PACKEN",
      "GEPACKT",
      "LABEL_ERSTELLT",
      "VERSANDBEREIT",
      "ABGESCHLOSSEN",
    ] as const;

    weg.forEach((von, i) => {
      const nach = weg[i + 1];
      if (!nach) return;
      expect(transition(von, nach)).toBe(nach);
    });
  });

  it("erreicht VERSANDBEREIT ausschliesslich ueber LABEL_ERSTELLT", () => {
    const vorgaenger = ORDER_STATUSES.filter((s) =>
      canTransition(s, "VERSANDBEREIT"),
    );
    expect(vorgaenger).toEqual(["LABEL_ERSTELLT"]);
  });

  it("verbietet den Sprung von NEU direkt zu VERSANDBEREIT", () => {
    expect(canTransition("NEU", "VERSANDBEREIT")).toBe(false);
    expect(() => transition("NEU", "VERSANDBEREIT")).toThrow(
      InvalidTransitionError,
    );
  });

  it("nennt im Fehlertext die moeglichen Alternativen", () => {
    expect(() => transition("NEU", "ABGESCHLOSSEN")).toThrow(/PICKING/);
  });

  it("behandelt ABGESCHLOSSEN und STORNIERT als Endzustaende", () => {
    expect(isTerminal("ABGESCHLOSSEN")).toBe(true);
    expect(isTerminal("STORNIERT")).toBe(true);
    expect(isTerminal("FEHLER")).toBe(false);
  });

  it("erlaubt aus FEHLER die Wiederholung frueherer Schritte", () => {
    expect(canTransition("FEHLER", "PACKEN")).toBe(true);
    // Aber kein Ueberspringen in den Versand hinein.
    expect(canTransition("FEHLER", "VERSANDBEREIT")).toBe(false);
    expect(canTransition("FEHLER", "ABGESCHLOSSEN")).toBe(false);
  });

  it("erlaubt aus jedem aktiven Status den Wechsel nach FEHLER", () => {
    const aktiv = ORDER_STATUSES.filter((s) => !isTerminal(s) && s !== "FEHLER");
    for (const status of aktiv) {
      expect(canTransition(status, "FEHLER")).toBe(true);
    }
  });
});
