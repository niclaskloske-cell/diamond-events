import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/**
 * Passwort-Hashing mit scrypt aus der Node-Standardbibliothek.
 *
 * Bewusst ohne externe Abhaengigkeit: scrypt ist speicherhart, in Node nativ
 * implementiert und braucht keinen nativen Build-Schritt im Deployment.
 * Format: "scrypt$<salt-hex>$<hash-hex>" — das Praefix erlaubt einen spaeteren
 * Wechsel des Verfahrens, ohne bestehende Hashes ungueltig zu machen.
 */
export async function hashPassword(password: string): Promise<string> {
  if (password.length < 8) {
    throw new Error("Passwort muss mindestens 8 Zeichen haben");
  }
  const salt = randomBytes(SALT_LENGTH);
  const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

/**
 * Prueft ein Passwort gegen einen gespeicherten Hash.
 * Gibt bei fehlerhaft formatierten Hashes false zurueck statt zu werfen —
 * ein kaputter Datensatz darf den Login nicht mit einem 500er beenden.
 */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;

  const [, saltHex, hashHex] = parts;
  if (!saltHex || !hashHex) return false;

  const expected = Buffer.from(hashHex, "hex");
  if (expected.length !== KEY_LENGTH) return false;

  const derived = (await scryptAsync(
    password,
    Buffer.from(saltHex, "hex"),
    KEY_LENGTH,
  )) as Buffer;

  return timingSafeEqual(derived, expected);
}
