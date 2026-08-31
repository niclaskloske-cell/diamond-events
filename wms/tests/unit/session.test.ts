import { describe, expect, it } from "vitest";
import {
  createSessionToken,
  sessionCookieOptions,
  verifySessionToken,
} from "@/lib/session";

const SECRET = "s".repeat(32);
const ANDERES_SECRET = "a".repeat(32);

const sitzung = {
  userId: "u1",
  tenantId: "squishova",
  role: "PACKER" as const,
};

describe("Session-Token", () => {
  it("liest eine frisch erzeugte Sitzung wieder aus", () => {
    const token = createSessionToken(sitzung, SECRET);
    expect(verifySessionToken(token, SECRET)).toMatchObject(sitzung);
  });

  it("lehnt ein mit anderem Secret signiertes Token ab", () => {
    const token = createSessionToken(sitzung, ANDERES_SECRET);
    expect(verifySessionToken(token, SECRET)).toBeNull();
  });

  it("lehnt eine manipulierte Nutzlast ab", () => {
    const token = createSessionToken(sitzung, SECRET);
    const [, signatur] = token.split(".");
    const gefaelscht = Buffer.from(
      JSON.stringify({ ...sitzung, role: "ADMIN", exp: 9_999_999_999 }),
    ).toString("base64url");

    expect(verifySessionToken(`${gefaelscht}.${signatur}`, SECRET)).toBeNull();
  });

  it("lehnt ein abgelaufenes Token ab", () => {
    const jetzt = new Date("2026-08-31T08:00:00Z");
    const token = createSessionToken(sitzung, SECRET, {
      ttlSeconds: 60,
      now: jetzt,
    });

    const kurzDavor = new Date(jetzt.getTime() + 59_000);
    const danach = new Date(jetzt.getTime() + 61_000);

    expect(verifySessionToken(token, SECRET, kurzDavor)).not.toBeNull();
    expect(verifySessionToken(token, SECRET, danach)).toBeNull();
  });

  it("lehnt fehlende und unsinnige Werte ab, ohne zu werfen", () => {
    for (const wert of [undefined, null, "", ".", "unsinn", "a.b", "....."]) {
      expect(verifySessionToken(wert, SECRET)).toBeNull();
    }
  });

  it("lehnt ein korrekt signiertes Token mit unbekannter Rolle ab", () => {
    // Signatur ist gueltig, aber der Inhalt passt nicht zum Rollenmodell.
    const encoded = Buffer.from(
      JSON.stringify({ ...sitzung, role: "SUPERUSER", exp: 9_999_999_999 }),
    ).toString("base64url");
    const token = `${encoded}.${createSessionToken(sitzung, SECRET).split(".")[1]}`;
    expect(verifySessionToken(token, SECRET)).toBeNull();
  });

  it("lehnt ein Token ohne Benutzer-ID ab", () => {
    const kaputt = { tenantId: "squishova", role: "ADMIN", exp: 9_999_999_999 };
    const encoded = Buffer.from(JSON.stringify(kaputt)).toString("base64url");
    // Mit gueltiger Signatur versehen, damit wirklich die Inhaltspruefung greift.
    const token = createSessionToken(sitzung, SECRET);
    expect(verifySessionToken(`${encoded}.${token.split(".")[1]}`, SECRET)).toBeNull();
  });
});

describe("Cookie-Optionen", () => {
  it("ist httpOnly und sameSite=lax", () => {
    const optionen = sessionCookieOptions(false);
    expect(optionen.httpOnly).toBe(true);
    expect(optionen.sameSite).toBe("lax");
  });

  it("setzt secure nur in Produktion", () => {
    expect(sessionCookieOptions(true).secure).toBe(true);
    expect(sessionCookieOptions(false).secure).toBe(false);
  });
});
