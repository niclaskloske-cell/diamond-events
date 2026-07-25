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

Ohne Code-Signierung blockiert macOS die App inzwischen oft komplett mit
"enthält Malware" (nicht nur eine Warnung — Gatekeeper verweigert das Öffnen
ganz). Unsignierte Electron-Apps, die im Kern nur eine Website in einem
Fenster anzeigen, ähneln leider dem Muster mancher echter Adware, daher die
strenge Reaktion. Um das sauber loszuwerden, muss die App richtig signiert
und notarisiert werden — siehe nächster Abschnitt.

**Falls der Build mit `Command failed: which python` abbricht:** Das passiert,
wenn die Xcode Command Line Tools nicht vollständig installiert sind (moderne
Macs bringen nur `python3` mit, kein `python`). Fix: `xcode-select --install`
ausführen und danach den Build erneut starten.

## Mac-App richtig signieren & notarisieren (einmalig einrichten)

Damit macOS die App als vertrauenswürdig einstuft und nicht mehr blockiert,
braucht es ein echtes Apple-Entwicklerzertifikat. Das kann nur mit einem
eigenen Apple-Account eingerichtet werden — das übernimmt niemand für euch:

1. **Apple Developer Program beitreten** (einmalig, 99 $/Jahr):
   [developer.apple.com/programs/enroll](https://developer.apple.com/programs/enroll) —
   mit eurer Apple-ID anmelden und die Mitgliedschaft abschließen. Freischaltung
   dauert meist wenige Stunden bis 1–2 Tage.

2. **"Developer ID Application"-Zertifikat erstellen:**
   Xcode öffnen (kostenlos aus dem App Store) → Xcode → Einstellungen → Accounts
   → eure Apple-ID hinzufügen → **Manage Certificates** → **+** → **Developer ID
   Application** auswählen. Landet automatisch im Schlüsselbund — kein manueller
   Export nötig.

3. **App-spezifisches Passwort erzeugen** (wird fürs Notarisieren gebraucht,
   nicht das normale Apple-ID-Passwort!):
   [appleid.apple.com](https://appleid.apple.com) → Anmelden → Sicherheit →
   App-spezifische Passwörter → Neues Passwort erzeugen, z. B. "Diamond Events
   Build".

4. **Team-ID herausfinden:**
   [developer.apple.com/account](https://developer.apple.com/account) →
   Membership Details → dort steht die Team-ID (10-stelliger Code).

5. **Build mit Signierung + Notarisierung starten** — in einem Terminal
   (damit niemand außer euch die Werte sieht):
   ```bash
   export APPLE_ID="eure-apple-id@example.com"
   export APPLE_APP_SPECIFIC_PASSWORD="das-app-spezifische-passwort"
   export APPLE_TEAM_ID="EURETEAMID"
   npm run dist:mac
   ```
   electron-builder findet das Zertifikat automatisch im Schlüsselbund und
   notarisiert die App danach automatisch bei Apple (dauert ein paar Minuten).
   Ergebnis: eine `.dmg`, die beim Öffnen keine Warnung mehr zeigt.

Die technische Vorbereitung dafür (Hardened Runtime, Entitlements) ist im
Projekt bereits hinterlegt (`build/entitlements.mac.plist`,
`package.json` → `build.mac`) — es fehlen nur die drei Umgebungsvariablen
oben.

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
