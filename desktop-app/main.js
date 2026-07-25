const { app, BrowserWindow, shell, Menu } = require("electron");
const path = require("path");
const fs = require("fs");

const APP_ORIGIN = "https://eventsdiamond.de";
const ADMIN_URL = `${APP_ORIGIN}/admin.html`;

const stateFile = path.join(app.getPath("userData"), "window-state.json");

function loadWindowState() {
  try {
    return JSON.parse(fs.readFileSync(stateFile, "utf8"));
  } catch {
    return { width: 1360, height: 860 };
  }
}

function saveWindowState(win) {
  if (win.isDestroyed()) return;
  const bounds = win.isMaximized() ? win.getNormalBounds() : win.getBounds();
  try {
    fs.writeFileSync(stateFile, JSON.stringify({ ...bounds, maximized: win.isMaximized() }));
  } catch {
    // Non-critical — just means the window won't restore its last size/position.
  }
}

function createWindow() {
  const state = loadWindowState();

  const win = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#fbfaf6",
    icon: path.join(__dirname, "assets", "icon.png"),
    title: "Diamond Events — Admin",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  if (state.maximized) win.maximize();

  win.once("ready-to-show", () => win.show());
  win.loadURL(ADMIN_URL);

  // Anything that isn't our own site (mailto:, external links, "Zurück zur Website"
  // pointing elsewhere, etc.) opens in the user's real browser instead of inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(APP_ORIGIN)) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(APP_ORIGIN)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // Render's free tier can cold-start slowly, or the connection can briefly drop —
  // retry instead of leaving a dead error page on screen.
  win.webContents.on("did-fail-load", (_event, errorCode) => {
    if (errorCode === -3) return; // ERR_ABORTED, usually just a redirect in progress
    setTimeout(() => {
      if (!win.isDestroyed()) win.loadURL(ADMIN_URL);
    }, 3000);
  });

  let saveTimer = null;
  const scheduleSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveWindowState(win), 400);
  };
  win.on("resize", scheduleSave);
  win.on("move", scheduleSave);
  win.on("close", () => saveWindowState(win));

  return win;
}

function buildMenu() {
  const template = [
    {
      label: "Diamond Events Admin",
      submenu: [
        { label: "Neu laden", accelerator: "CmdOrCtrl+R", click: (_item, win) => win && win.reload() },
        {
          label: "Vollständig neu laden",
          accelerator: "CmdOrCtrl+Shift+R",
          click: (_item, win) => win && win.webContents.reloadIgnoringCache(),
        },
        { type: "separator" },
        { label: "Entwicklertools", accelerator: "F12", click: (_item, win) => win && win.webContents.toggleDevTools() },
        { type: "separator" },
        { role: "quit", label: "Beenden" },
      ],
    },
    {
      label: "Ansicht",
      submenu: [
        { role: "resetZoom", label: "Zoom zurücksetzen" },
        { role: "zoomIn", label: "Vergrößern" },
        { role: "zoomOut", label: "Verkleinern" },
        { type: "separator" },
        { role: "togglefullscreen", label: "Vollbild" },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  buildMenu();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
