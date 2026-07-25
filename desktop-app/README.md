# Diamond Events Admin — Desktop-App (Windows & Mac)

Eine schlanke Electron-App, die euer Admin-Dashboard (`https://eventsdiamond.de/admin.html`)
als eigenständiges Programm öffnet — eigenes Fenster, eigenes Icon, in der
Taskleiste/im Dock anpinnbar, kein Browser-Tab. Es läuft weiterhin alles über die echte
Website — die App speichert nichts lokal außer eurer Fenstergröße/-position.

## Einmalig einrichten

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

## Mac-App bauen

```bash
npm run dist:mac
```

Erzeugt in `desktop-app/dist/`:

- **`Diamond Events Admin-<Version>-universal.dmg`** — zum Öffnen und die App
  in den Programme-Ordner ziehen (läuft nativ auf Intel- und Apple-Silicon-Macs).
- **`Diamond Events Admin-<Version>-universal-mac.zip`** — die gleiche App
  gezippt, falls lieber direkt entpackt statt über DMG installiert wird.

Die App ist nicht codesigniert (kein Apple-Entwicklerzertifikat hinterlegt).
Beim ersten Start meldet macOS deshalb "nicht verifizierter Entwickler" —
einmalig per Rechtsklick auf die App → **Öffnen** bestätigen, danach läuft
sie normal.

**Falls der Build mit `Command failed: which python` abbricht:** Das passiert,
wenn die Xcode Command Line Tools nicht vollständig installiert sind (moderne
Macs bringen nur `python3` mit, kein `python`). Fix: `xcode-select --install`
ausführen und danach den Build erneut starten.

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

`assets/icon.ico` (Windows), `assets/icon.icns` (Mac) und `assets/icon.png`
(Taskleiste/Titelleiste) einfach ersetzen und den jeweiligen Build erneut
ausführen.
