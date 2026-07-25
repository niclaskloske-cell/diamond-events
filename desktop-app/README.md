# Diamond Events Admin — Desktop-App (Windows)

Eine schlanke Electron-App, die euer Admin-Dashboard (`https://eventsdiamond.de/admin.html`)
als eigenständiges Windows-Programm öffnet — eigenes Fenster, eigenes Icon, in der
Taskleiste anpinnbar, kein Browser-Tab. Es läuft weiterhin alles über die echte
Website — die App speichert nichts lokal außer eurer Fenstergröße/-position.

## Einmalig einrichten (auf dem Windows-Rechner)

Voraussetzung: [Node.js](https://nodejs.org) ist installiert (Version 18 oder neuer).

```bash
cd desktop-app
npm install
```

## Zum Testen starten

```bash
npm start
```

Öffnet die App direkt im Login-Fenster. Login-Status bleibt zwischen Neustarts
erhalten (genau wie im Browser).

## Windows-Installer bauen

```bash
npm run dist
```

Erzeugt zwei Dateien in `desktop-app/dist/`:

- **`Diamond Events Admin Setup <Version>.exe`** — klassischer Installer
  (Desktop- und Startmenü-Verknüpfung, Installationsordner frei wählbar,
  sauber deinstallierbar über "Programme und Features").
- **`DiamondEventsAdmin-portable.exe`** — läuft ohne Installation direkt
  von einem USB-Stick oder beliebigen Ordner.

Nur den Installer bauen: `npm run dist:installer`
Nur die portable Version bauen: `npm run dist:portable`

## Was die App macht

- Öffnet `eventsdiamond.de/admin.html` in einem eigenen Fenster mit eigenem
  Icon und Titel.
- Externe Links (z. B. "Zurück zur Website", `mailto:`-Links) öffnen sich im
  normalen Browser, nicht in der App.
- Merkt sich Fenstergröße und -position zwischen den Starts.
- Lädt automatisch neu, falls die Website mal kurz nicht erreichbar ist
  (z. B. beim Aufwachen aus dem Ruhezustand von Render).
- Menü oben: Neu laden, Entwicklertools, Zoom, Vollbild.

## Icon ändern

`assets/icon.ico` (Windows) und `assets/icon.png` (Taskleiste/Titelleiste)
einfach ersetzen und `npm run dist` erneut ausführen.
