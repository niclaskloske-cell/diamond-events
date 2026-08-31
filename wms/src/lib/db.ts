import { PrismaClient } from "@prisma/client";

/**
 * Prisma-Client als Singleton. Im Dev-Modus laedt Next.js Module bei jedem
 * Hot-Reload neu — ohne diesen Cache entstehen dutzende DB-Verbindungen.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "warn", "error"]
        : ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
