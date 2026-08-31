import { describe, expect, it } from "vitest";
import { safeRedirectTarget } from "@/domain/auth/safeRedirect";

describe("Weiterleitungsziel nach der Anmeldung", () => {
  it("laesst seiteninterne Pfade durch", () => {
    expect(safeRedirectTarget("/auftraege")).toBe("/auftraege");
    expect(safeRedirectTarget("/scan/abc123?x=1")).toBe("/scan/abc123?x=1");
  });

  it("faellt ohne Angabe auf die Startseite zurueck", () => {
    for (const wert of [undefined, null, ""]) {
      expect(safeRedirectTarget(wert)).toBe("/");
    }
  });

  it("blockiert absolute URLs auf fremde Hosts", () => {
    for (const wert of [
      "https://boese.example/anmelden",
      "http://boese.example",
      "//boese.example",
      "/\\boese.example",
    ]) {
      expect(safeRedirectTarget(wert), wert).toBe("/");
    }
  });

  it("blockiert javascript: und Datenadressen", () => {
    expect(safeRedirectTarget("javascript:alert(1)")).toBe("/");
    expect(safeRedirectTarget("data:text/html,<script>")).toBe("/");
  });

  it("blockiert Ziele mit Steuerzeichen oder Leerzeichen", () => {
    expect(safeRedirectTarget("/auftraege\nSet-Cookie: x=1")).toBe("/");
    expect(safeRedirectTarget("/auf traege")).toBe("/");
    expect(safeRedirectTarget("/")).toBe("/");
  });

  it("nutzt den angegebenen Ersatzpfad", () => {
    expect(safeRedirectTarget("https://boese.example", "/scan")).toBe("/scan");
  });
});
