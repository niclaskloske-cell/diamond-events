import { childLogger } from "@/lib/logger";

const log = childLogger("shopify-client");

/** Fest verdrahtete API-Version: ein stiller Versionssprung aendert Feldnamen. */
export const SHOPIFY_API_VERSION = "2025-01";

export interface ShopCredentials {
  domain: string;
  accessToken: string;
}

export class ShopifyApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ShopifyApiError";
  }
}

interface GraphQLAntwort<T> {
  data?: T;
  errors?: Array<{ message: string }>;
  extensions?: { cost?: { throttleStatus?: { currentlyAvailable: number } } };
}

const MAX_VERSUCHE = 3;

/**
 * Ruft die Shopify Admin GraphQL API auf.
 *
 * Wiederholt wird nur bei Fehlern, die sich von selbst erledigen koennen:
 * 429 (Rate Limit) und 5xx. Ein 401 oder ein GraphQL-Fehler wird sofort
 * gemeldet — erneutes Senden wuerde nur dieselbe Ablehnung erzeugen.
 *
 * Fehler werden geworfen, nicht verschluckt: Aufrufer sollen sie protokollieren
 * und dem Benutzer verstaendlich anzeigen koennen.
 */
export async function shopifyGraphQL<T>(
  credentials: ShopCredentials,
  query: string,
  variables: Record<string, unknown> = {},
  optionen: { fetchImpl?: typeof fetch; maxVersuche?: number } = {},
): Promise<T> {
  const aufrufen = optionen.fetchImpl ?? fetch;
  const maxVersuche = optionen.maxVersuche ?? MAX_VERSUCHE;
  const url = `https://${credentials.domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;

  let letzterFehler: ShopifyApiError | undefined;

  for (let versuch = 1; versuch <= maxVersuche; versuch++) {
    let antwort: Response;
    try {
      antwort = await aufrufen(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": credentials.accessToken,
        },
        body: JSON.stringify({ query, variables }),
      });
    } catch (error) {
      // Netzwerkfehler: erneut versuchen, das ist der klassische Wackler.
      letzterFehler = new ShopifyApiError(
        "Shopify ist nicht erreichbar.",
        undefined,
        error,
      );
      await warten(versuch);
      continue;
    }

    if (antwort.status === 429 || antwort.status >= 500) {
      letzterFehler = new ShopifyApiError(
        `Shopify antwortet mit Status ${antwort.status}.`,
        antwort.status,
      );
      log.warn(
        { status: antwort.status, versuch },
        "Shopify-Aufruf wird wiederholt",
      );
      await warten(versuch, antwort.headers.get("Retry-After"));
      continue;
    }

    if (!antwort.ok) {
      // 4xx ausser 429: erneutes Senden aendert nichts.
      throw new ShopifyApiError(
        antwort.status === 401
          ? "Shopify hat den Zugriff abgelehnt. Bitte Zugangsdaten prüfen."
          : `Shopify hat die Anfrage abgelehnt (Status ${antwort.status}).`,
        antwort.status,
      );
    }

    const ergebnis = (await antwort.json()) as GraphQLAntwort<T>;

    if (ergebnis.errors?.length) {
      throw new ShopifyApiError(
        `Shopify meldet: ${ergebnis.errors.map((e) => e.message).join("; ")}`,
        antwort.status,
        ergebnis.errors,
      );
    }

    if (!ergebnis.data) {
      throw new ShopifyApiError("Shopify hat keine Daten geliefert.");
    }

    return ergebnis.data;
  }

  throw (
    letzterFehler ??
    new ShopifyApiError(`Shopify-Aufruf nach ${maxVersuche} Versuchen aufgegeben.`)
  );
}

/**
 * Wartezeit vor dem naechsten Versuch. Beruecksichtigt den Retry-After-Header,
 * sonst exponentiell — damit ein ausgelastetes Shopify nicht weiter belastet
 * wird.
 */
async function warten(versuch: number, retryAfter?: string | null): Promise<void> {
  const ausHeader = retryAfter ? Number(retryAfter) * 1000 : NaN;
  const ms = Number.isFinite(ausHeader) ? ausHeader : 2 ** (versuch - 1) * 500;
  await new Promise((fertig) => setTimeout(fertig, ms));
}
