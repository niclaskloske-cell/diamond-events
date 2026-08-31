import { describe, expect, it } from "vitest";
import { isPushConfigured, parseEnv } from "@/lib/env";

const gueltig = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  AUTH_SECRET: "x".repeat(32),
};

describe("Umgebungsvariablen", () => {
  it("akzeptiert eine vollstaendige Konfiguration", () => {
    const env = parseEnv(gueltig);
    expect(env.NODE_ENV).toBe("development");
    expect(env.LOG_LEVEL).toBe("info");
  });

  it("bricht bei fehlender DATABASE_URL mit klarer Meldung ab", () => {
    expect(() => parseEnv({ AUTH_SECRET: "x".repeat(32) })).toThrow(
      /DATABASE_URL/,
    );
  });

  it("weist ein zu kurzes AUTH_SECRET ab", () => {
    expect(() => parseEnv({ ...gueltig, AUTH_SECRET: "kurz" })).toThrow(
      /AUTH_SECRET/,
    );
  });

  it("verweist in der Fehlermeldung auf .env.example", () => {
    expect(() => parseEnv({})).toThrow(/\.env\.example/);
  });

  it("erkennt Push nur bei vollstaendigem VAPID-Schluesselpaar als aktiv", () => {
    expect(isPushConfigured(parseEnv(gueltig))).toBe(false);
    expect(
      isPushConfigured(parseEnv({ ...gueltig, VAPID_PUBLIC_KEY: "a" })),
    ).toBe(false);
    expect(
      isPushConfigured(
        parseEnv({ ...gueltig, VAPID_PUBLIC_KEY: "a", VAPID_PRIVATE_KEY: "b" }),
      ),
    ).toBe(true);
  });
});
