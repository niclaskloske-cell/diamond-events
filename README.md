# Diamond Events — Fullstack App

Premium Event Entertainment & Photography — Buchungsplattform mit Admin-Verwaltung.

## Features

- Moderne, dunkle Website mit Apple-Typografie und dezenten Neon-RGB-Akzenten
- Buchungsformular für Kunden (Name, E-Mail, Datum, Ort, Paket, Fotografie, Nachricht)
- Bestätigungsseite mit Referenz-ID
- Admin-Login (Session-basiert)
- Admin-Dashboard mit:
  - Statistik-Karten (Gesamt, Offen, Angenommen, Abgelehnt)
  - Buchungstabelle mit Status-Pillen
  - Filter nach Status (Alle / Offen / Angenommen / Abgelehnt / Storniert)
  - Aktionen: Annehmen, Ablehnen, Stornieren, Bearbeiten, Löschen
  - Kalenderansicht mit Termin-Visualisierung und Tages-Modal
- Responsive Design (Mobile-optimiert, Tabelle wird auf Mobile zu Karten)
- Animierte Karten beim Scrollen (Fade + Slide Up, gestaffelt)

## Voraussetzungen

- **Node.js 18 oder höher**
- npm (kommt mit Node.js)

Check mit: `node -v` und `npm -v`

## Installation

Im Projektordner ausführen:

    npm install

Das installiert die zwei Abhängigkeiten:
- `express` — Webserver
- `express-session` — Session-Management für Login

## Starten

    npm start

Du siehst dann in der Konsole:

    Diamond Events running at: http://localhost:3000
    Admin Login:  /login.html
    Username:     DJ DIAMOND
    Password:     passwort

Öffne im Browser: **http://localhost:3000**

## Admin Login

- **URL:** http://localhost:3000/login.html
- **Benutzername:** `DJ DIAMOND`
- **Passwort:** `passwort`

Nach dem Login wirst du zum Admin-Dashboard weitergeleitet.

## Projektstruktur

    diamond-events-app/
    ├── package.json              # Dependencies & Scripts
    ├── README.md                 # Diese Datei
    ├── backend/
    │   └── server.js             # Express-Server mit API + Auth
    ├── frontend/
    │   ├── index.html            # Startseite
    │   ├── booking.html          # Buchungsformular
    │   ├── confirmation.html     # Bestätigung nach Buchung
    │   ├── login.html            # Admin Login
    │   ├── admin.html            # Admin Dashboard (geschützt)
    │   ├── css/
    │   │   └── style.css         # Globale Styles
    │   └── js/
    │       ├── main.js           # Navbar, Mobile-Menü, Reveal-Animationen, Toast
    │       ├── booking.js        # Buchungsformular-Logik
    │       └── admin.js          # Dashboard, Filter, Aktionen, Kalender
    └── data/
        └── bookings.json         # Persistenz (JSON-Datei)

## API Endpunkte

### Öffentlich

| Methode | Pfad | Zweck |
|---|---|---|
| POST | `/api/bookings` | Neue Buchung anlegen (Status: `offen`) |
| POST | `/api/login` | Admin Login |
| POST | `/api/logout` | Logout |
| GET  | `/api/me` | Login-Status prüfen |

### Geschützt (nur nach Login)

| Methode | Pfad | Zweck |
|---|---|---|
| GET    | `/api/bookings` | Alle Buchungen |
| GET    | `/api/bookings/:id` | Einzelne Buchung |
| PATCH  | `/api/bookings/:id` | Status oder Felder ändern |
| DELETE | `/api/bookings/:id` | Buchung löschen |

Auch die Seite `/admin.html` ist server-seitig geschützt — ohne Session erfolgt
ein Redirect auf `/login.html`.

## Status-Werte

- `offen` — neue Anfrage (Standard nach Buchung)
- `angenommen`
- `abgelehnt`
- `storniert`

## Datenpersistenz

Alle Buchungen werden in `data/bookings.json` gespeichert. Die Datei wird
automatisch angelegt, wenn sie noch nicht existiert. Sie ist menschenlesbar
und kann notfalls direkt bearbeitet oder gesichert werden.

## Anpassungen

- **Port ändern:** `PORT=4000 npm start`
- **Admin-Zugangsdaten ändern:** Variablen `ADMIN_USER` und `ADMIN_PASS` oben
  in `backend/server.js`
- **Session-Secret ändern (Produktion):** `secret` in der `session()`-Konfiguration
  in `backend/server.js`

## Troubleshooting

- **"Cannot find module 'express'"** → `npm install` vergessen
- **Port 3000 belegt** → mit `PORT=4000 npm start` anderen Port wählen
- **Login funktioniert nicht** → Cookies im Browser erlauben (Session basiert auf
  einem Cookie)
- **Alte Buchungen weg?** → Die werden in `data/bookings.json` gespeichert, dort
  reinschauen

## Hinweis zur Sicherheit

Diese App ist als Demo/Prototyp gedacht. Für den produktiven Einsatz:

- Admin-Passwort durch eine Umgebungsvariable ersetzen, nicht im Code hardcoden
- Session-Secret als Umgebungsvariable
- HTTPS einsetzen und `cookie.secure: true` in der Session-Config
- Rate-Limiting für `/api/login` und `/api/bookings`
- Für mehr Daten: Wechsel auf SQLite oder PostgreSQL
