/**
 * Parser fuer das Shopify-Metafeld custom.pack_instructions.
 *
 * Der Shop-Betreiber schreibt dort Freitext, z. B.
 *   "Dankeskarte + Regenbogenschlaengchen nicht vergessen."
 * oder eine Liste mit Bindestrichen. Fuer die Scanner-Oberflaeche braucht es
 * einzelne abhakbare Punkte. Der Rohtext bleibt in der Datenbank erhalten,
 * damit eine spaetere Parser-Aenderung nichts unwiederbringlich zerstoert.
 */

export interface ParsedInstruction {
  text: string;
  position: number;
  /** Optionale Punkte werden mit "(optional)" markiert. */
  required: boolean;
}

/** Aufzaehlungszeichen am Zeilenanfang, die entfernt werden. */
const BULLET = /^\s*(?:[-*•–—]|\d+[.)])\s*/;
const OPTIONAL_MARKER = /\(\s*optional\s*\)/i;

/**
 * Zerlegt den Rohtext in Einzelpunkte.
 *
 * Reihenfolge der Trennung:
 *  1. Zeilenumbrueche und Semikolons — die explizite Absicht des Autors.
 *  2. Nur wenn daraus eine einzige Zeile entsteht, wird zusaetzlich an
 *     " + " und " und " getrennt, damit auch der Fliesstext aus dem Beispiel
 *     zu mehreren Punkten wird. Bei bereits gegliederten Listen bleibt ein
 *     "und" innerhalb einer Zeile dagegen unangetastet.
 */
export function parsePackInstructions(raw: string | null | undefined): ParsedInstruction[] {
  if (!raw) return [];

  let parts = splitAndClean(raw, /[\n\r;]+/);

  if (parts.length <= 1) {
    parts = splitAndClean(parts[0] ?? "", /\s+\+\s+|\s+und\s+/i);
  }

  return parts.map((part, index) => {
    const required = !OPTIONAL_MARKER.test(part);
    const text = part.replace(OPTIONAL_MARKER, "").trim().replace(/[.,]+$/, "");
    return { text, position: index, required };
  })
  // Nach dem Entfernen der Marker koennen leere Punkte uebrig bleiben.
  .filter((i) => i.text.length > 0)
  .map((i, index) => ({ ...i, position: index }));
}

function splitAndClean(input: string, separator: RegExp): string[] {
  return input
    .split(separator)
    .map((line) => line.replace(BULLET, "").trim())
    .filter((line) => line.length > 0);
}

/**
 * Sind alle Pflichtpunkte abgehakt? Solange das false ist, darf der Auftrag
 * nicht als packfertig markiert werden.
 */
export function allRequiredChecked(
  instructions: readonly { required: boolean; checkedAt: Date | null }[],
): boolean {
  return instructions
    .filter((i) => i.required)
    .every((i) => i.checkedAt !== null);
}
