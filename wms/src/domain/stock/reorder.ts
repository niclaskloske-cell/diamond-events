/**
 * Bestandswarnungen und Nachbestellvorschlag fuer Verpackungsmaterial.
 *
 * Formel bewusst einfach und nachvollziehbar gehalten — der Mitarbeiter soll
 * die Zahl im Dashboard nachrechnen koennen. Kein Forecast-Modell.
 */

export interface MaterialForReorder {
  id: string;
  name: string;
  stock: number;
  minStock: number;
  /** Durchschnittlicher Verbrauch pro Tag, aus StockMovement berechnet. */
  dailyUsage: number;
  leadTimeDays?: number | null;
  defaultOrderQty?: number | null;
}

export type StockLevel = "OK" | "NIEDRIG" | "KRITISCH";

export interface ReorderAssessment {
  materialId: string;
  name: string;
  stock: number;
  minStock: number;
  dailyUsage: number;
  /** Reichweite in Tagen, null wenn kein Verbrauch bekannt ist. */
  daysRemaining: number | null;
  level: StockLevel;
  /** True, wenn der Bestand die Lieferzeit nicht mehr ueberbrueckt. */
  reorderNeeded: boolean;
  /** Empfohlene Bestellmenge, 0 wenn keine Bestellung noetig ist. */
  recommendedOrderQty: number;
}

/**
 * Durchschnittsverbrauch pro Tag aus den Abgaengen eines Zeitraums.
 * Erwartet werden die negativen Deltas als positive Verbrauchsmengen.
 */
export function averageDailyUsage(
  consumedQuantities: readonly number[],
  days: number,
): number {
  if (days <= 0) return 0;
  const total = consumedQuantities.reduce((sum, q) => sum + Math.abs(q), 0);
  return total / days;
}

/** Reichweite in Tagen. Null, wenn nichts verbraucht wird — dann endlos. */
export function daysOfStock(stock: number, dailyUsage: number): number | null {
  if (dailyUsage <= 0) return null;
  return Math.floor(stock / dailyUsage);
}

/**
 * Bewertet ein Material.
 *
 * Nachbestellung ist noetig, sobald der Bestand unter den Meldebestand faellt.
 * Meldebestand = Verbrauch waehrend der Lieferzeit + Sicherheitsbestand,
 * wobei minStock als Sicherheitsbestand dient. Beispiel aus der Anforderung:
 * Bestand 24, Verbrauch 8/Tag, Lieferzeit 5 Tage, Sicherheit 10
 * -> Meldebestand 8*5 + 10 = 50 > 24 -> Nachbestellung erforderlich.
 */
export function assessMaterial(m: MaterialForReorder): ReorderAssessment {
  const dailyUsage = Math.max(0, m.dailyUsage);
  const leadTimeDays = Math.max(0, m.leadTimeDays ?? 0);
  const daysRemaining = daysOfStock(m.stock, dailyUsage);

  const reorderPoint = dailyUsage * leadTimeDays + m.minStock;
  const reorderNeeded = m.stock <= reorderPoint;

  let level: StockLevel = "OK";
  if (m.stock <= m.minStock) level = "KRITISCH";
  else if (reorderNeeded) level = "NIEDRIG";

  return {
    materialId: m.id,
    name: m.name,
    stock: m.stock,
    minStock: m.minStock,
    dailyUsage,
    daysRemaining,
    level,
    reorderNeeded,
    recommendedOrderQty: reorderNeeded
      ? recommendedOrderQty(m, reorderPoint)
      : 0,
  };
}

/**
 * Empfohlene Menge: so viel, dass der Bestand den Meldebestand wieder
 * ueberschreitet — mindestens aber die Standard-Bestellmenge des Lieferanten,
 * auf ein Vielfaches davon aufgerundet.
 */
function recommendedOrderQty(
  m: MaterialForReorder,
  reorderPoint: number,
): number {
  const gap = Math.max(0, Math.ceil(reorderPoint - m.stock));
  const batch = m.defaultOrderQty ?? 0;
  if (batch <= 0) return Math.max(gap, 1);
  return Math.max(batch, Math.ceil(gap / batch) * batch);
}

/** Alle Materialien, die eine Warnung ausloesen — kritischste zuerst. */
export function materialsNeedingAttention(
  materials: readonly MaterialForReorder[],
): ReorderAssessment[] {
  const order: Record<StockLevel, number> = { KRITISCH: 0, NIEDRIG: 1, OK: 2 };
  return materials
    .map(assessMaterial)
    .filter((a) => a.level !== "OK")
    .sort(
      (a, b) =>
        order[a.level] - order[b.level] ||
        (a.daysRemaining ?? Infinity) - (b.daysRemaining ?? Infinity),
    );
}
