#!/bin/bash
# Startet die Diamond Events Admin-App direkt aus dem Quellcode — kein
# signiertes App-Paket, das macOS blockieren könnte, komplett kostenlos.
cd "$(dirname "$0")" || exit 1

if [ ! -d "node_modules" ]; then
  echo "Erste Einrichtung — installiere Abhängigkeiten, einen Moment..."
  /usr/local/bin/npm install
fi

if [ ! -x "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron" ]; then
  echo "Lade Electron neu herunter, einen Moment..."
  node node_modules/electron/install.js
fi

echo "Starte Diamond Events Admin..."
/usr/local/bin/npm start
