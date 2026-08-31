/**
 * Rollen und Rechte.
 *
 * Bewusst als Whitelist je Rolle statt als Verbotsliste: eine neue Faehigkeit
 * ist dadurch standardmaessig fuer niemanden freigeschaltet, bis sie hier
 * eingetragen wird. Ein vergessener Eintrag sperrt aus — das ist die sichere
 * Richtung.
 *
 * Reine Logik ohne Datenbank und ohne HTTP, damit jede Regel testbar bleibt.
 */

export const ROLES = ["ADMIN", "PACKER", "VIEWER"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "auftrag.lesen",
  "auftrag.picken",
  "auftrag.packen",
  "auftrag.abschliessen",
  /// Position ohne Scan abhaken — ausdruecklich geschuetzte Admin-Funktion.
  "auftrag.manuell_abhaken",
  "material.lesen",
  "material.verbrauch_erfassen",
  "material.verwalten",
  "bestand.lesen",
  "bestand.korrigieren",
  "produkt.lesen",
  "produkt.verwalten",
  "lagerplatz.lesen",
  "lagerplatz.verwalten",
  "versand.label_erstellen",
  "benutzer.verwalten",
  "shop.verwalten",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * PACKER darf den gesamten operativen Ablauf: picken, packen, Verbrauch
 * erfassen, Label erstellen. Nicht erlaubt sind Stammdaten, Benutzer,
 * Bestandskorrekturen und das manuelle Abhaken ohne Scan.
 */
const PACKER_PERMISSIONS: readonly Permission[] = [
  "auftrag.lesen",
  "auftrag.picken",
  "auftrag.packen",
  "auftrag.abschliessen",
  "material.lesen",
  "material.verbrauch_erfassen",
  "bestand.lesen",
  "produkt.lesen",
  "lagerplatz.lesen",
  "versand.label_erstellen",
];

/** VIEWER darf ausschliesslich lesen. */
const VIEWER_PERMISSIONS: readonly Permission[] = PERMISSIONS.filter((p) =>
  p.endsWith(".lesen"),
);

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  // ADMIN darf alles — bewusst aus der Gesamtliste abgeleitet, damit eine neue
  // Faehigkeit nicht versehentlich auch fuer den Admin fehlt.
  ADMIN: PERMISSIONS,
  PACKER: PACKER_PERMISSIONS,
  VIEWER: VIEWER_PERMISSIONS,
};

export function permissionsForRole(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

/** Benutzer, wie ihn die Rechtepruefung braucht — nicht der DB-Datensatz. */
export interface ActingUser {
  id: string;
  role: Role;
  active: boolean;
  tenantId: string;
}

/**
 * Darf dieser Benutzer das? Ein deaktivierter Benutzer darf grundsaetzlich
 * nichts — die Sperre wird hier zentral durchgesetzt und nicht an jedem
 * Aufrufort einzeln.
 */
export function can(user: ActingUser, permission: Permission): boolean {
  if (!user.active) return false;
  return ROLE_PERMISSIONS[user.role].includes(permission);
}

export class ForbiddenError extends Error {
  readonly statusCode = 403;

  constructor(readonly permission: Permission) {
    super(`Keine Berechtigung fuer diese Aktion (${permission}).`);
    this.name = "ForbiddenError";
  }
}

/**
 * Wirft, wenn das Recht fehlt. Fuer Server Actions und API-Routen gedacht,
 * damit der Positivpfad ohne if-Verschachtelung auskommt.
 */
export function requirePermission(
  user: ActingUser,
  permission: Permission,
): void {
  if (!can(user, permission)) throw new ForbiddenError(permission);
}

/**
 * Zusaetzliche Mandantenschranke: ein Benutzer darf nur Daten seines eigenen
 * Mandanten sehen. Wird geprueft, sobald mehrere Shops im System sind, und
 * schon jetzt konsequent aufgerufen, damit es spaeter kein Nachruesten braucht.
 */
export function assertSameTenant(user: ActingUser, tenantId: string): void {
  if (user.tenantId !== tenantId) {
    throw new Error("Zugriff auf einen fremden Mandanten ist nicht erlaubt.");
  }
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}
