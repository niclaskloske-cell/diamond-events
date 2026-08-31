import { describe, expect, it } from "vitest";
import {
  assertSameTenant,
  can,
  ForbiddenError,
  isRole,
  PERMISSIONS,
  permissionsForRole,
  requirePermission,
  ROLES,
  type ActingUser,
  type Role,
} from "@/domain/auth/permissions";

function user(role: Role, overrides: Partial<ActingUser> = {}): ActingUser {
  return { id: "u1", role, active: true, tenantId: "squishova", ...overrides };
}

describe("Rollen und Rechte", () => {
  it("gibt ADMIN saemtliche Rechte", () => {
    expect(permissionsForRole("ADMIN")).toEqual(PERMISSIONS);
  });

  it("erlaubt dem PACKER den operativen Ablauf", () => {
    const packer = user("PACKER");
    for (const recht of [
      "auftrag.picken",
      "auftrag.packen",
      "auftrag.abschliessen",
      "material.verbrauch_erfassen",
      "versand.label_erstellen",
    ] as const) {
      expect(can(packer, recht), recht).toBe(true);
    }
  });

  it("verwehrt dem PACKER Stammdaten, Benutzer und Bestandskorrekturen", () => {
    const packer = user("PACKER");
    for (const recht of [
      "benutzer.verwalten",
      "material.verwalten",
      "produkt.verwalten",
      "lagerplatz.verwalten",
      "bestand.korrigieren",
      "shop.verwalten",
    ] as const) {
      expect(can(packer, recht), recht).toBe(false);
    }
  });

  it("erlaubt das manuelle Abhaken ohne Scan nur dem ADMIN", () => {
    const erlaubt = ROLES.filter((r) => can(user(r), "auftrag.manuell_abhaken"));
    expect(erlaubt).toEqual(["ADMIN"]);
  });

  it("laesst den VIEWER ausschliesslich lesen", () => {
    const viewer = user("VIEWER");
    for (const recht of PERMISSIONS) {
      expect(can(viewer, recht), recht).toBe(recht.endsWith(".lesen"));
    }
  });

  it("sperrt einen deaktivierten Benutzer vollstaendig aus, auch als ADMIN", () => {
    const gesperrt = user("ADMIN", { active: false });
    for (const recht of PERMISSIONS) {
      expect(can(gesperrt, recht), recht).toBe(false);
    }
  });

  it("gibt jeder Rolle mindestens Leserechte auf Auftraege", () => {
    for (const role of ROLES) {
      expect(can(user(role), "auftrag.lesen"), role).toBe(true);
    }
  });
});

describe("requirePermission", () => {
  it("laesst erlaubte Aktionen durch", () => {
    expect(() => requirePermission(user("PACKER"), "auftrag.picken")).not.toThrow();
  });

  it("wirft ForbiddenError mit Status 403 und deutscher Meldung", () => {
    try {
      requirePermission(user("VIEWER"), "auftrag.picken");
      expect.unreachable("haette werfen muessen");
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenError);
      expect((error as ForbiddenError).statusCode).toBe(403);
      expect((error as ForbiddenError).message).toMatch(/Keine Berechtigung/);
    }
  });
});

describe("Mandantenschranke", () => {
  it("laesst den eigenen Mandanten durch", () => {
    expect(() => assertSameTenant(user("ADMIN"), "squishova")).not.toThrow();
  });

  it("blockiert einen fremden Mandanten auch fuer den ADMIN", () => {
    expect(() => assertSameTenant(user("ADMIN"), "anderer-shop")).toThrow(
      /fremden Mandanten/,
    );
  });
});

describe("isRole", () => {
  it("erkennt gueltige Rollen", () => {
    expect(ROLES.every(isRole)).toBe(true);
  });

  it("weist alles andere ab", () => {
    for (const wert of ["admin", "SUPERUSER", "", null, undefined, 42, {}]) {
      expect(isRole(wert)).toBe(false);
    }
  });
});
