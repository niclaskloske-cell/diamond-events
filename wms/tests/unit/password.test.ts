import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/password";

describe("Passwort-Hashing", () => {
  it("bestaetigt das richtige Passwort", async () => {
    const hash = await hashPassword("geheim1234");
    expect(await verifyPassword("geheim1234", hash)).toBe(true);
  });

  it("lehnt ein falsches Passwort ab", async () => {
    const hash = await hashPassword("geheim1234");
    expect(await verifyPassword("geheim1235", hash)).toBe(false);
  });

  it("erzeugt fuer dasselbe Passwort unterschiedliche Hashes (Salt)", async () => {
    expect(await hashPassword("geheim1234")).not.toBe(
      await hashPassword("geheim1234"),
    );
  });

  it("weist zu kurze Passwoerter ab", async () => {
    await expect(hashPassword("kurz")).rejects.toThrow(/mindestens 8/);
  });

  it("wirft nicht bei kaputt gespeicherten Hashes, sondern gibt false zurueck", async () => {
    for (const kaputt of ["", "unsinn", "bcrypt$a$b", "scrypt$zz$zz"]) {
      expect(await verifyPassword("geheim1234", kaputt)).toBe(false);
    }
  });
});
