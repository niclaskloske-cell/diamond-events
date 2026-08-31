/**
 * Statusmaschine fuer Auftraege.
 *
 * Reine Logik ohne Datenbankzugriff, damit jeder Uebergang testbar ist.
 * Zentrale Zusicherung: VERSANDBEREIT ist nur ueber LABEL_ERSTELLT erreichbar.
 * Ein Auftrag kann damit strukturell nicht faelschlich als versandbereit
 * gelten, solange kein Label mit Trackingnummer existiert.
 */

export const ORDER_STATUSES = [
  "NEU",
  "PICKING",
  "GEPICKT",
  "PACKEN",
  "GEPACKT",
  "LABEL_ERSTELLT",
  "VERSANDBEREIT",
  "ABGESCHLOSSEN",
  "STORNIERT",
  "FEHLER",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Erlaubte Folgezustaende je Status. */
const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  NEU: ["PICKING", "STORNIERT", "FEHLER"],
  PICKING: ["GEPICKT", "NEU", "STORNIERT", "FEHLER"],
  GEPICKT: ["PACKEN", "PICKING", "STORNIERT", "FEHLER"],
  PACKEN: ["GEPACKT", "GEPICKT", "STORNIERT", "FEHLER"],
  GEPACKT: ["LABEL_ERSTELLT", "PACKEN", "STORNIERT", "FEHLER"],
  LABEL_ERSTELLT: ["VERSANDBEREIT", "GEPACKT", "STORNIERT", "FEHLER"],
  VERSANDBEREIT: ["ABGESCHLOSSEN", "FEHLER"],
  ABGESCHLOSSEN: [],
  STORNIERT: [],
  // Aus einem Fehler heraus wird der Vorgang wiederholt. Welcher Zustand das
  // ist, entscheidet der Aufrufer anhand des letzten erfolgreichen Schritts.
  FEHLER: ["NEU", "PICKING", "GEPICKT", "PACKEN", "GEPACKT", "STORNIERT"],
};

/** Endzustaende — von hier aus geht es nicht weiter. */
export function isTerminal(status: OrderStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

export function allowedTransitions(status: OrderStatus): readonly OrderStatus[] {
  return TRANSITIONS[status];
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: OrderStatus,
    readonly to: OrderStatus,
  ) {
    super(
      `Statuswechsel von "${from}" nach "${to}" ist nicht erlaubt. ` +
        `Moeglich waere: ${allowedTransitions(from).join(", ") || "keiner"}.`,
    );
    this.name = "InvalidTransitionError";
  }
}

/**
 * Fuehrt einen Statuswechsel durch oder wirft mit deutscher Klartextmeldung.
 * Aufrufer sollen diesen Fehler direkt anzeigen koennen.
 */
export function transition(from: OrderStatus, to: OrderStatus): OrderStatus {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
  return to;
}
