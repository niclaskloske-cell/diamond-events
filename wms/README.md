# Squishova WMS

Warehouse Management System für den Squishova-Shop: Shopify-Anbindung,
Scanner-gestütztes Picking, Packanweisungen, Verpackungsmaterial-Verwaltung
und Versand.

> **Hinweis:** Dieses Projekt liegt vorübergehend im Repository
> `diamond-events` unter `wms/`, weil das eigene Repository noch nicht
> angelegt werden konnte. Es ist vollständig eigenständig — es teilt sich
> keinen Code mit der Diamond-Events-Anwendung und zieht später als Wurzel in
> ein eigenes Repository um.

## Stack

| Bereich | Wahl | Grund |
|---|---|---|
| Framework | Next.js 15 (App Router) + TypeScript | Eine Codebasis für Desktop-Dashboard und mobile Scanner-PWA |
| Datenbank | PostgreSQL + Prisma | Transaktionen sind für Bestandsführung zwingend; typsichere Queries und Migrationen |
| Validierung | Zod | Jede Außengrenze (Webhooks, Formulare, Scans) wird geprüft |
| Logging | Pino | Strukturiert, mit Redaction für Secrets |
| Tests | Vitest (Unit) + Playwright (E2E, folgt) | Domain-Logik ist I/O-frei und damit direkt testbar |

## Einrichtung

```bash
npm install
cp .env.example .env      # Werte eintragen
npm run db:migrate        # Schema in die Datenbank bringen
npm run db:seed           # Lagerplätze A01–B02 und Verpackungsmaterial
npm run dev
```

Für Testbenutzer (nur lokal):

```bash
SEED_PASSWORD='einlokalespasswort' npm run db:seed
```

## Befehle

| Befehl | Zweck |
|---|---|
| `npm test` | Unit-Tests |
| `npm run typecheck` | TypeScript ohne Emit |
| `npm run build` | Produktionsbuild (prüft auch die Edge-Grenze der Middleware) |
| `npm run db:migrate` | Migration erzeugen und anwenden |
| `npm run db:studio` | Prisma Studio zum Draufschauen |

## Architektur-Grundsätze

1. **Bestand wird nie direkt gesetzt.** Jede Mengenänderung läuft über einen
   `StockMovement` in derselben Transaktion. Die Historie ist die Wahrheit,
   kein nachträgliches Protokoll.
2. **Shopify bleibt Quelle der Wahrheit** für Produkte, Varianten und
   Bestellungen. Lokal liegt nur, was das Lager braucht — plus die rein
   WMS-eigenen Daten (Lagerplatz, Pick-Fortschritt, Materialverbrauch).
3. **`src/domain/` enthält kein I/O.** Statusmaschine, Scan-Prüfung,
   Nachbestellrechner und Anweisungs-Parser sind reine Funktionen. Alles, was
   fachlich schiefgehen kann, ist damit ohne Datenbank testbar.
4. **Kein Fake.** Der Versand läuft über ein `CarrierAdapter`-Interface. Der
   manuelle Adapter ist echt nutzbar, DHL kommt später dazu, ohne dass am Rest
   etwas geändert werden muss.
5. **Mandantenfähig ab Tag eins.** `Tenant → Shop / Warehouse`, damit weitere
   Shops und Lager kein Umbau werden.

## Statusmodell

```
NEU → PICKING → GEPICKT → PACKEN → GEPACKT → LABEL_ERSTELLT → VERSANDBEREIT → ABGESCHLOSSEN
                                                     ↘ FEHLER (Klartext, wiederholbar)
```

`VERSANDBEREIT` ist ausschließlich über `LABEL_ERSTELLT` erreichbar — ein
Auftrag kann strukturell nicht fälschlich als versandbereit gelten, solange
kein Label mit Trackingnummer existiert. Diese Zusicherung ist in
`tests/unit/stateMachine.test.ts` festgeschrieben.

## Umsetzungsstand

- [x] 1 Projekt-Setup, Env-Validierung, Logging
- [x] 2 Datenmodell (Prisma-Schema) und Seed
- [x] 3 Domain-Logik: Statusmaschine, Scan-Prüfung, Nachbestellung, Anweisungs-Parser
- [x] 4 Auth und Rollen (ADMIN / PACKER / VIEWER)
- [~] 5 Shopify: HMAC, Bestell-Mapping, Admin-API-Client (Produkt-Sync folgt)
- [x] 6 Webhook-Endpunkt mit HMAC-Prüfung und Idempotenz
- [ ] 7 Auftragsliste und Desktop-Dashboard
- [ ] 8 Lagerplatzverwaltung
- [ ] 9 Picking-Scanner (mobil)
- [ ] 10 Packanweisungen mit Pflichtbestätigung
- [ ] 11 Verpackungsmaterial und Verbrauchserfassung
- [ ] 12 Bestandswarnungen und Push-Benachrichtigungen
- [ ] 13 Versand: Carrier-Adapter, Label, Tracking
- [ ] 14 Dashboard-Kennzahlen und Bestandshistorie
- [ ] 15 End-to-End-Test über den kompletten Ablauf

## Rollen und Rechte

Die Rechtematrix liegt in `src/domain/auth/permissions.ts` als **Whitelist je
Rolle**: eine neu eingeführte Fähigkeit ist damit standardmäßig für niemanden
freigeschaltet, bis sie dort eingetragen wird. Ein vergessener Eintrag sperrt
aus statt zu öffnen — das ist die sichere Richtung.

| Rolle | Darf |
|---|---|
| `ADMIN` | Alles, inklusive Stammdaten, Benutzer, Bestandskorrekturen und dem manuellen Abhaken ohne Scan |
| `PACKER` | Den operativen Ablauf: picken, packen, Verbrauch erfassen, Label erstellen |
| `VIEWER` | Ausschließlich lesen |

Ein deaktiviertes Konto darf grundsätzlich nichts — auch als `ADMIN`.
Die Rolle wird bei jedem Aufruf frisch aus der Datenbank gelesen und nicht aus
dem Cookie übernommen: eine Sperre oder Herabstufung wirkt damit sofort und
nicht erst, wenn die Sitzung abläuft.

Sitzungen sind signierte, zustandslose Cookies (HMAC-SHA256). Bewusst kein
Session-Speicher: mehrere Scanner arbeiten gleichzeitig, ein Dateispeicher
würde dabei zum Engpass. Der Cookie-Inhalt ist lesbar, aber nicht fälschbar —
deshalb steht dort nichts Vertrauliches.

Die Middleware prüft nur, **ob** ein Cookie vorhanden ist, und ist ausdrücklich
keine Sicherheitsgrenze: sie läuft in der Edge-Runtime, in der `node:crypto`
und damit die Signaturprüfung fehlt. Die echte Prüfung passiert serverseitig in
`requireUser()`.

## Shopify-Anbindung

Shopify ist die Quelle der Wahrheit. Lokal liegt nur, was das Lager braucht.

**Webhooks** (`POST /api/webhooks/shopify`) laufen in dieser Reihenfolge:

1. Roher Body lesen — die Signatur wird über die unveränderten Bytes gebildet.
   Geparstes und neu serialisiertes JSON ergäbe eine andere Signatur; ein Test
   hält das fest.
2. HMAC gegen das Shared Secret des Shops prüfen, bevor irgendetwas anderes
   passiert. Die Signatur ist hier die Authentifizierung — Shopify schickt keine
   Cookies, deshalb ist die Route in der Middleware vom Anmeldezwang ausgenommen.
3. Ereignis ablegen und sofort mit 200 antworten. Die Verarbeitung läuft
   getrennt, damit Shopify nicht in einen Timeout läuft und erneut zustellt.

**Idempotenz** kommt aus dem UNIQUE-Index auf `WebhookEvent.shopifyEventId` —
bewusst nicht aus einem vorherigen `SELECT`: zwei gleichzeitig eintreffende
Zustellungen würden beide „noch nicht vorhanden" lesen und beide einfügen.

Ein unbekannter Shop bekommt `401 Signatur ungültig`, nicht `404`. Sonst ließe
sich über den Endpunkt herausfinden, welche Domains eingerichtet sind.

Der **Admin-API-Client** wiederholt nur, was sich von selbst erledigen kann:
429 und 5xx sowie Netzwerkfehler, mit `Retry-After` oder exponentiell wachsender
Wartezeit. Ein 401 oder ein GraphQL-Fehler wird sofort im Klartext gemeldet —
erneutes Senden erzeugt nur dieselbe Ablehnung. Die API-Version ist fest
verdrahtet, weil ein stiller Versionssprung Feldnamen ändert.

## Sicherheit

Secrets ausschließlich über Umgebungsvariablen, siehe `.env.example`.
Shopify-Access-Tokens werden verschlüsselt in der Tabelle `Shop` abgelegt,
niemals im Klartext. Passwörter werden mit scrypt gehasht.
Die Logs redigieren `authorization`, `cookie`, HMAC-Header und Tokens.
