/**
 * Pruefung eines Barcode-/SKU-Scans gegen die offene Auftragsposition.
 *
 * Reine Funktion: rein hinein, Entscheidung heraus. Die Datenbankbuchung
 * passiert im Service, nicht hier — dadurch ist jede Regel einzeln testbar.
 */

export interface ScannableItem {
  id: string;
  sku: string;
  barcode?: string | null;
  name: string;
  quantityOrdered: number;
  quantityPicked: number;
}

export type ScanRejectReason =
  | "FALSCHER_ARTIKEL"
  | "MENGE_ERREICHT"
  | "LEERER_CODE";

export type ScanResult =
  | {
      accepted: true;
      itemId: string;
      /** Menge nach diesem Scan. */
      quantityPicked: number;
      quantityOrdered: number;
      /** True, wenn diese Position mit dem Scan vollstaendig ist. */
      itemComplete: boolean;
    }
  | {
      accepted: false;
      reason: ScanRejectReason;
      /** Fertig formulierte Meldung fuer die rote Fehleranzeige am Scanner. */
      message: string;
    };

/**
 * Normalisiert einen gescannten Code: Scanner haengen haeufig ein Zeilenende
 * an, und Gross-/Kleinschreibung unterscheidet sich je nach Etikett.
 */
export function normalizeCode(code: string): string {
  return code.trim().replace(/\s+/g, "").toUpperCase();
}

/** Passt der Code zu diesem Artikel? Geprueft werden SKU und Barcode. */
export function matchesItem(item: ScannableItem, code: string): boolean {
  const normalized = normalizeCode(code);
  if (!normalized) return false;
  if (normalizeCode(item.sku) === normalized) return true;
  return Boolean(item.barcode && normalizeCode(item.barcode) === normalized);
}

/**
 * Prueft einen Scan gegen die erwartete Position.
 *
 * `expected` ist der Artikel, der dem Mitarbeiter gerade angezeigt wird.
 * Ein Treffer auf einer anderen Position des Auftrags gilt bewusst als Fehler:
 * die Reihenfolge folgt der Pick-Route, ein Sprung waere ein Bedienfehler.
 */
export function validateScan(
  expected: ScannableItem,
  scannedCode: string,
): ScanResult {
  if (!normalizeCode(scannedCode)) {
    return {
      accepted: false,
      reason: "LEERER_CODE",
      message: "Kein Code erkannt. Bitte erneut scannen.",
    };
  }

  if (!matchesItem(expected, scannedCode)) {
    return {
      accepted: false,
      reason: "FALSCHER_ARTIKEL",
      message: `Falscher Artikel. Erwartet wird: ${expected.name}`,
    };
  }

  if (expected.quantityPicked >= expected.quantityOrdered) {
    return {
      accepted: false,
      reason: "MENGE_ERREICHT",
      message:
        `Menge bereits vollstaendig: ` +
        `${expected.quantityPicked}/${expected.quantityOrdered}`,
    };
  }

  const quantityPicked = expected.quantityPicked + 1;
  return {
    accepted: true,
    itemId: expected.id,
    quantityPicked,
    quantityOrdered: expected.quantityOrdered,
    itemComplete: quantityPicked >= expected.quantityOrdered,
  };
}

/** Fortschritt ueber alle Positionen — Grundlage fuer "alles gepickt?". */
export function pickProgress(items: readonly ScannableItem[]) {
  const totalOrdered = items.reduce((sum, i) => sum + i.quantityOrdered, 0);
  const totalPicked = items.reduce(
    (sum, i) => sum + Math.min(i.quantityPicked, i.quantityOrdered),
    0,
  );
  return {
    totalOrdered,
    totalPicked,
    complete: items.length > 0 && totalPicked >= totalOrdered,
  };
}

/**
 * Naechste offene Position. `items` wird in Pick-Reihenfolge erwartet
 * (nach Location.pickOrder sortiert), damit der Weg durchs Lager kurz bleibt.
 */
export function nextOpenItem(
  items: readonly ScannableItem[],
): ScannableItem | undefined {
  return items.find((i) => i.quantityPicked < i.quantityOrdered);
}
