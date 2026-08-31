/**
 * Seed fuer die lokale Entwicklung.
 *
 * Legt einen Mandanten, ein Lager mit den Plaetzen A01–B02, drei Benutzer
 * (je eine Rolle) und das reale Squishova-Verpackungsmaterial an.
 * Idempotent: mehrfaches Ausfuehren erzeugt keine Duplikate.
 */
import { PrismaClient, UserRole } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

const db = new PrismaClient();

const LOCATIONS = [
  { code: "A01", shelf: "A", bin: "01", pickOrder: 10 },
  { code: "A02", shelf: "A", bin: "02", pickOrder: 20 },
  { code: "A03", shelf: "A", bin: "03", pickOrder: 30 },
  { code: "B01", shelf: "B", bin: "01", pickOrder: 40 },
  { code: "B02", shelf: "B", bin: "02", pickOrder: 50 },
];

const MATERIALS = [
  {
    sku: "VP-HOLO-M",
    name: "Hologramm-Versandtasche M",
    stock: 24,
    minStock: 30,
    defaultConsumption: 1,
    leadTimeDays: 5,
    defaultOrderQty: 500,
    purchasePriceCents: 18,
  },
  {
    sku: "VP-KARTON-201510",
    name: "Karton 20x15x10",
    stock: 60,
    minStock: 25,
    defaultConsumption: 0,
    leadTimeDays: 7,
    defaultOrderQty: 200,
    purchasePriceCents: 42,
  },
  {
    sku: "VP-KARTON-302010",
    name: "Karton 30x20x10",
    stock: 18,
    minStock: 25,
    defaultConsumption: 0,
    leadTimeDays: 7,
    defaultOrderQty: 200,
    purchasePriceCents: 55,
  },
  {
    sku: "VP-DANKESKARTE",
    name: "Dankeskarte",
    stock: 320,
    minStock: 100,
    defaultConsumption: 1,
    leadTimeDays: 10,
    defaultOrderQty: 1000,
    purchasePriceCents: 9,
  },
  {
    sku: "VP-STICKER",
    name: "Squishova Sticker",
    stock: 450,
    minStock: 150,
    defaultConsumption: 1,
    leadTimeDays: 10,
    defaultOrderQty: 1000,
    purchasePriceCents: 6,
  },
  {
    sku: "VP-PACKBAND",
    name: "Packband",
    stock: 12,
    minStock: 6,
    defaultConsumption: 0,
    leadTimeDays: 3,
    defaultOrderQty: 24,
    purchasePriceCents: 149,
  },
  {
    sku: "VP-SCHLAENGCHEN",
    name: "Regenbogenschlaengchen",
    stock: 80,
    minStock: 50,
    defaultConsumption: 1,
    leadTimeDays: 14,
    defaultOrderQty: 500,
    purchasePriceCents: 32,
  },
];

const USERS = [
  { email: "admin@squishova.de", name: "Admin", role: UserRole.ADMIN },
  { email: "packer@squishova.de", name: "Packer", role: UserRole.PACKER },
  { email: "viewer@squishova.de", name: "Viewer", role: UserRole.VIEWER },
];

async function main() {
  const tenant = await db.tenant.upsert({
    where: { id: "squishova" },
    update: { name: "Squishova" },
    create: { id: "squishova", name: "Squishova" },
  });

  const warehouse = await db.warehouse.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: "HAUPT" } },
    update: {},
    create: { tenantId: tenant.id, code: "HAUPT", name: "Hauptlager" },
  });

  for (const loc of LOCATIONS) {
    await db.location.upsert({
      where: { warehouseId_code: { warehouseId: warehouse.id, code: loc.code } },
      update: { pickOrder: loc.pickOrder },
      create: { warehouseId: warehouse.id, ...loc },
    });
  }

  for (const material of MATERIALS) {
    await db.packagingMaterial.upsert({
      where: { tenantId_sku: { tenantId: tenant.id, sku: material.sku } },
      // Bestand bewusst NICHT ueberschreiben: ein erneuter Seed darf gezaehlte
      // Mengen nicht zurueckdrehen. Nur Stammdaten werden aktualisiert.
      update: {
        name: material.name,
        minStock: material.minStock,
        defaultConsumption: material.defaultConsumption,
        leadTimeDays: material.leadTimeDays,
        defaultOrderQty: material.defaultOrderQty,
        purchasePriceCents: material.purchasePriceCents,
      },
      create: { tenantId: tenant.id, ...material },
    });
  }

  // Nur fuer die lokale Entwicklung. In Produktion werden Benutzer ueber die
  // Admin-Oberflaeche angelegt, niemals mit einem festen Passwort geseedet.
  const devPassword = process.env.SEED_PASSWORD;
  if (devPassword) {
    const passwordHash = await hashPassword(devPassword);
    for (const user of USERS) {
      await db.user.upsert({
        where: { email: user.email },
        update: { role: user.role, name: user.name },
        create: { tenantId: tenant.id, passwordHash, ...user },
      });
    }
    console.log(`Benutzer angelegt: ${USERS.map((u) => u.email).join(", ")}`);
  } else {
    console.log(
      "SEED_PASSWORD nicht gesetzt — Benutzer wurden uebersprungen.\n" +
        "Fuer Testbenutzer: SEED_PASSWORD='...' npm run db:seed",
    );
  }

  console.log(
    `Seed fertig: ${LOCATIONS.length} Lagerplaetze, ${MATERIALS.length} Materialien.`,
  );
}

main()
  .catch((error) => {
    console.error("Seed fehlgeschlagen:", error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
