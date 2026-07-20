/**
 * Diamond Events — Backend Server
 * Express + JSON file storage + session-based admin auth + Brevo email
 */

const express = require("express");
const session = require("express-session");
const FileStore = require("session-file-store")(session);
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const archiver = require("archiver");
const { v2: cloudinary } = require("cloudinary");
const streamifier = require("streamifier");
const webpush = require("web-push");
const crypto = require("crypto");

// ---------- Cloudinary ----------
const CLOUDINARY_ENABLED = !!(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);
if (CLOUDINARY_ENABLED) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  console.log("[cloudinary] Configured ✓");
} else {
  console.log("[cloudinary] Not configured — using local disk storage");
}

// ---------- Config ----------
const PORT = process.env.PORT || 3000;
// DATA_DIR: where to persist JSON files. Defaults to /data on Render (persistent disk),
// falls back to local ../data folder when developing on your computer.
const DATA_DIR =
  process.env.DATA_DIR || path.join(__dirname, "..", "data");
const DATA_FILE = path.join(DATA_DIR, "bookings.json");
const PRESETS_FILE = path.join(DATA_DIR, "presets.json");
const TEMPLATES_FILE = path.join(DATA_DIR, "templates.json");
const GALLERIES_FILE = path.join(DATA_DIR, "galleries.json");
const AVAILABILITY_FILE = path.join(DATA_DIR, "availability.json");
const GALLERIES_DIR = path.join(DATA_DIR, "galleries");
const FRONTEND_DIR = path.join(__dirname, "..", "frontend");
const PUSH_SUBS_FILE = path.join(DATA_DIR, "push_subscriptions.json");

const ADMIN_USER = process.env.ADMIN_USER || "DJ DIAMOND";
const ADMIN_PASS = process.env.ADMIN_PASS || "passwort";

const VALID_STATUSES = ["offen", "angenommen", "abgelehnt", "storniert"];
const VALID_PACKAGES = [
  "Diamond Lite", "Diamond Premium", "Diamond Exclusive",
  "Hochzeit Basis", "Hochzeit Premium", "Hochzeit Exclusive",
  "Mini Shooting", "Standard Shooting", "Shooting + Drohne",
  // Legacy — alte Buchungen in der Datenbank nutzen noch diese Namen
  "Foto Portrait", "Foto Reportage", "Foto Premium"
];
const VALID_SERVICE_TYPES = ["dj", "fotografie", "beides"];

// Email config (via env vars on Render) — RESEND
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || ""; // Where you receive notifications
const SENDER_EMAIL = process.env.SENDER_EMAIL || "onboarding@resend.dev"; // Resend test sender; replace once domain is verified
const SENDER_NAME = process.env.SENDER_NAME || "Diamond Events";

// ---------- Web Push ----------
const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_EMAIL = process.env.VAPID_EMAIL || "mailto:hallo@eventsdiamond.de";
if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE);
  console.log("[push] VAPID configured ✓");
}
function readPushSubs() {
  if (!fs.existsSync(PUSH_SUBS_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(PUSH_SUBS_FILE, "utf8") || "[]"); } catch { return []; }
}
function writePushSubs(subs) { fs.writeFileSync(PUSH_SUBS_FILE, JSON.stringify(subs, null, 2)); }
async function sendPushToAll(payload) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;
  const subs = readPushSubs();
  const dead = [];
  await Promise.all(subs.map(async (sub) => {
    try { await webpush.sendNotification(sub, JSON.stringify(payload)); }
    catch (e) { if (e.statusCode === 410 || e.statusCode === 404) dead.push(sub.endpoint); }
  }));
  if (dead.length) writePushSubs(subs.filter(s => !dead.includes(s.endpoint)));
}

// ---------- App ----------
const app = express();
app.set("trust proxy", true); // Render sits behind a proxy — needed so req.ip is the real visitor IP, not the proxy's

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ensure sessions directory exists on the persistent disk
const SESSIONS_DIR = path.join(DATA_DIR, "sessions");
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

app.use(
  session({
    store: new FileStore({
      path: SESSIONS_DIR,
      ttl: 8 * 60 * 60, // 8h, in seconds
      retries: 1,
      logFn: () => {}, // silence verbose logs
    }),
    secret: process.env.SESSION_SECRET || "diamond-events-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, maxAge: 1000 * 60 * 60 * 8 }, // 8h, in ms
  })
);

// ---------- Storage Helpers ----------
function ensureDataFile() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "[]", "utf8");
}

function readBookings() {
  ensureDataFile();
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    return JSON.parse(raw || "[]");
  } catch (err) {
    console.error("Error reading bookings:", err);
    return [];
  }
}

function writeBookings(bookings) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(bookings, null, 2), "utf8");
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Presets storage helpers
function ensurePresetsFile() {
  const dir = path.dirname(PRESETS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(PRESETS_FILE)) fs.writeFileSync(PRESETS_FILE, "[]", "utf8");
}

function readPresets() {
  ensurePresetsFile();
  try {
    return JSON.parse(fs.readFileSync(PRESETS_FILE, "utf8") || "[]");
  } catch (err) {
    console.error("Error reading presets:", err);
    return [];
  }
}

function writePresets(presets) {
  ensurePresetsFile();
  fs.writeFileSync(PRESETS_FILE, JSON.stringify(presets, null, 2), "utf8");
}

function escapeHtmlServer(str) {
  if (str == null) return "";
  return String(str).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c])
  );
}

// Returns HTML span with the brand RGB gradient applied to text
function gradientSpan(text) {
  return `<span style="background:linear-gradient(135deg,#00f0ff,#a855f7,#ff00e6); -webkit-background-clip:text; background-clip:text; color:transparent; font-weight:700;">${escapeHtmlServer(text)}</span>`;
}

// Returns the styled summary card HTML with booking details
function summaryCardHtml(b) {
  return `<div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:14px; padding:24px; margin:24px 0;">
    <div style="font-size:0.7rem; letter-spacing:0.25em; text-transform:uppercase; color:#8e8e93; font-weight:600; margin-bottom:16px;">Deine Buchung</div>
    <table style="width:100%; border-collapse:collapse;">
      <tr><td style="padding:8px 0; color:#8e8e93; font-size:0.85rem; width:120px;">Datum</td><td style="padding:8px 0; color:#f5f5f7;">${fmtDate(b.eventDate)}</td></tr>
      <tr><td style="padding:8px 0; color:#8e8e93; font-size:0.85rem;">Ort</td><td style="padding:8px 0; color:#f5f5f7;">${escapeHtmlServer(b.eventLocation || "—")}</td></tr>
      <tr><td style="padding:8px 0; color:#8e8e93; font-size:0.85rem;">Paket</td><td style="padding:8px 0; color:#f5f5f7;">${escapeHtmlServer(b.package || "—")}</td></tr>
      <tr><td style="padding:8px 0; color:#8e8e93; font-size:0.85rem;">Referenz</td><td style="padding:8px 0; color:#f5f5f7; font-family:monospace; font-size:0.85rem;">${escapeHtmlServer(b.id || "")}</td></tr>
    </table>
  </div>`;
}

// Replace {{placeholders}} in templates — returns HTML (escapes user text, injects HTML for special placeholders)
function fillPlaceholdersHtml(text, b) {
  if (!text) return "";
  const firstName = (b.name || "").trim().split(/\s+/)[0] || "";
  const parts = (b.name || "").trim().split(/\s+/).filter(Boolean);
  const lastName = parts.length > 1 ? parts[parts.length - 1] : "";
  const e = escapeHtmlServer;

  // Use unique placeholders we substitute LAST (after escaping) so injected HTML survives
  let result = e(String(text));

  // Convert newlines to <br> first (so HTML blocks we inject don't get \n converted inside them)
  result = result.replace(/\n/g, "<br>");

  // HTML-injecting placeholders
  result = result
    .replace(/\{\{nameStyled\}\}/g, gradientSpan(b.name || ""))
    .replace(/\{\{lastNameStyled\}\}/g, gradientSpan(lastName || b.name || ""))
    .replace(/\{\{firstNameStyled\}\}/g, gradientSpan(firstName))
    .replace(/\{\{summary\}\}/g, summaryCardHtml(b));

  // Plain-text placeholders (already escaped because we escaped the whole text first; but the values themselves come from data and need escaping)
  result = result
    .replace(/\{\{name\}\}/g, e(b.name || ""))
    .replace(/\{\{firstName\}\}/g, e(firstName))
    .replace(/\{\{lastName\}\}/g, e(lastName))
    .replace(/\{\{email\}\}/g, e(b.email || ""))
    .replace(/\{\{date\}\}/g, e(fmtDate(b.eventDate)))
    .replace(/\{\{location\}\}/g, e(b.eventLocation || ""))
    .replace(/\{\{package\}\}/g, e(b.package || ""))
    .replace(/\{\{id\}\}/g, e(b.id || ""));

  return result;
}

// Plain-text placeholder replacement (for subjects)
function fillPlaceholders(text, b) {
  if (!text) return "";
  const firstName = (b.name || "").trim().split(/\s+/)[0] || "";
  const parts = (b.name || "").trim().split(/\s+/).filter(Boolean);
  const lastName = parts.length > 1 ? parts[parts.length - 1] : "";
  return String(text)
    .replace(/\{\{nameStyled\}\}/g, b.name || "")
    .replace(/\{\{lastNameStyled\}\}/g, lastName || b.name || "")
    .replace(/\{\{firstNameStyled\}\}/g, firstName)
    .replace(/\{\{name\}\}/g, b.name || "")
    .replace(/\{\{firstName\}\}/g, firstName)
    .replace(/\{\{lastName\}\}/g, lastName)
    .replace(/\{\{email\}\}/g, b.email || "")
    .replace(/\{\{date\}\}/g, fmtDate(b.eventDate))
    .replace(/\{\{location\}\}/g, b.eventLocation || "")
    .replace(/\{\{package\}\}/g, b.package || "")
    .replace(/\{\{id\}\}/g, b.id || "");
}

// Common email frame (logo, footer)
function renderEmailFrame(htmlBody) {
  return `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background:#050507; color:#f5f5f7; padding:40px 20px;">
    <div style="max-width:560px; margin:0 auto; background:#0d0d14; border:1px solid rgba(255,255,255,0.07); border-radius:20px; padding:40px;">
      <div style="font-size:1.5rem; font-weight:700; letter-spacing:-0.02em; margin-bottom:8px;">
        Diamond<span style="background:linear-gradient(135deg,#00f0ff,#a855f7,#ff00e6); -webkit-background-clip:text; background-clip:text; color:transparent;">.</span>Events
      </div>
      <div style="font-size:0.7rem; letter-spacing:0.3em; text-transform:uppercase; color:#8e8e93; margin-bottom:32px;">Premium Event Brand</div>
      <div style="color:#f5f5f7; line-height:1.65;">${htmlBody}</div>
      <div style="margin-top:40px; padding-top:24px; border-top:1px solid rgba(255,255,255,0.07); color:#8e8e93; font-size:0.75rem; text-align:center;">
        Diamond Events — Premium Entertainment & Photography
      </div>
    </div>
  </div>`;
}

// ---------- Auto-message Templates (editable in admin) ----------
const TEMPLATE_KEYS = ["booking_received", "status_angenommen", "status_abgelehnt", "status_storniert"];

const TEMPLATE_META = {
  booking_received: {
    label: "Bestätigung beim Eingang einer Buchung",
    description: "Wird automatisch an den Kunden gesendet, sobald er das Buchungsformular abschickt.",
  },
  status_angenommen: {
    label: "Buchung angenommen",
    description: "Wird gesendet, wenn du eine Buchung im Admin als 'Angenommen' markierst.",
  },
  status_abgelehnt: {
    label: "Buchung abgelehnt",
    description: "Wird gesendet, wenn du eine Buchung im Admin als 'Abgelehnt' markierst.",
  },
  status_storniert: {
    label: "Buchung storniert",
    description: "Wird gesendet, wenn du eine Buchung im Admin als 'Storniert' markierst.",
  },
};

const DEFAULT_TEMPLATES = {
  booking_received: {
    subject: "Deine Anfrage bei Diamond Events",
    body: `Hallo {{firstName}} {{lastNameStyled}},

vielen Dank für deine Anfrage! Wir haben sie erhalten und melden uns innerhalb von 24 Stunden mit einem maßgeschneiderten Vorschlag bei dir.

{{summary}}

Bei Fragen einfach auf diese E-Mail antworten.

Bis bald!
Diamond Events`,
  },
  status_angenommen: {
    subject: "Deine Buchung ist bestätigt — Diamond Events",
    body: `Hallo {{firstName}} {{lastNameStyled}},

deine Buchung für das Event am {{date}} ist bestätigt! Wir freuen uns sehr und melden uns in den nächsten Tagen für die Detailplanung.

{{summary}}

Bei Fragen einfach auf diese E-Mail antworten.

Beste Grüße
Diamond Events`,
  },
  status_abgelehnt: {
    subject: "Zu deiner Anfrage bei Diamond Events",
    body: `Hallo {{firstName}} {{lastNameStyled}},

leider müssen wir dir absagen — an deinem Wunschtermin sind wir bereits ausgebucht. Wir hätten dich gerne unterstützt.

Falls du Flexibilität beim Datum hast, melde dich gerne — vielleicht finden wir noch eine Lösung. Antworte einfach auf diese E-Mail.

Beste Grüße
Diamond Events`,
  },
  status_storniert: {
    subject: "Stornierung deiner Buchung — Diamond Events",
    body: `Hallo {{firstName}} {{lastNameStyled}},

wir bestätigen hiermit die Stornierung deiner Buchung. Falls das ein Versehen war oder du noch Fragen hast, antworte gerne direkt auf diese E-Mail.

{{summary}}

Beste Grüße
Diamond Events`,
  },
};

function ensureTemplatesFile() {
  const dir = path.dirname(TEMPLATES_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(TEMPLATES_FILE)) fs.writeFileSync(TEMPLATES_FILE, "{}", "utf8");
}

function readTemplatesStorage() {
  ensureTemplatesFile();
  try {
    return JSON.parse(fs.readFileSync(TEMPLATES_FILE, "utf8") || "{}");
  } catch (err) {
    console.error("Error reading templates:", err);
    return {};
  }
}

function writeTemplatesStorage(data) {
  ensureTemplatesFile();
  fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(data, null, 2), "utf8");
}

function getTemplate(key) {
  const stored = readTemplatesStorage();
  return stored[key] || DEFAULT_TEMPLATES[key] || null;
}

function isTemplateCustomized(key) {
  const stored = readTemplatesStorage();
  return !!stored[key];
}

function renderEmailFromTemplate(key, b) {
  const tpl = getTemplate(key);
  if (!tpl) return null;
  return {
    subject: fillPlaceholders(tpl.subject, b),
    html: renderEmailFrame(fillPlaceholdersHtml(tpl.body, b)),
  };
}

// ---------- Email (Resend REST API) ----------
async function sendEmail({ to, subject, html, replyTo }) {
  if (!RESEND_API_KEY) {
    console.log("[mail] Skipped — RESEND_API_KEY not configured");
    return;
  }
  try {
    const body = {
      from: `${SENDER_NAME} <${SENDER_EMAIL}>`,
      to: [to],
      subject,
      html,
    };
    if (replyTo) body.reply_to = replyTo;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[mail] Resend error", res.status, errText);
    } else {
      console.log("[mail] Sent to", to);
    }
  } catch (err) {
    console.error("[mail] Exception:", err);
  }
}

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// Custom email template for admin-composed messages
function customEmailHtml(b, bodyText) {
  return renderEmailFrame(fillPlaceholdersHtml(bodyText, b));
}

function adminEmailHtml(b) {
  return `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background:#050507; color:#f5f5f7; padding:40px 20px;">
    <div style="max-width:560px; margin:0 auto; background:#0d0d14; border:1px solid rgba(255,255,255,0.07); border-radius:20px; padding:40px;">
      <div style="font-size:0.7rem; letter-spacing:0.3em; text-transform:uppercase; background:linear-gradient(135deg,#00f0ff,#a855f7,#ff00e6); -webkit-background-clip:text; background-clip:text; color:transparent; font-weight:700; margin-bottom:8px;">Neue Buchung</div>

      <h1 style="font-size:1.75rem; font-weight:700; letter-spacing:-0.03em; line-height:1.15; margin:0 0 24px;">
        ${b.name}
      </h1>

      <table style="width:100%; border-collapse:collapse; margin-bottom:24px;">
        <tr><td style="padding:8px 0; color:#8e8e93; font-size:0.85rem; width:120px;">E-Mail</td><td style="padding:8px 0;"><a href="mailto:${b.email}" style="color:#00f0ff; text-decoration:none;">${b.email}</a></td></tr>
        <tr><td style="padding:8px 0; color:#8e8e93; font-size:0.85rem;">Datum</td><td style="padding:8px 0; color:#f5f5f7;">${fmtDate(b.eventDate)}</td></tr>
        <tr><td style="padding:8px 0; color:#8e8e93; font-size:0.85rem;">Ort</td><td style="padding:8px 0; color:#f5f5f7;">${b.eventLocation}</td></tr>
        <tr><td style="padding:8px 0; color:#8e8e93; font-size:0.85rem;">Paket</td><td style="padding:8px 0; color:#f5f5f7;">${b.package}</td></tr>
        <tr><td style="padding:8px 0; color:#8e8e93; font-size:0.85rem;">Fotografie</td><td style="padding:8px 0; color:#f5f5f7;">${b.photography ? "Ja" : "Nein"}</td></tr>
        ${b.discountCode ? `<tr><td style="padding:8px 0; color:#8e8e93; font-size:0.85rem;">Rabattcode</td><td style="padding:8px 0; color:#f5f5f7;">${b.discountCode} (${b.discountType === "percent" ? b.discountValue + "%" : b.discountValue + "€"})</td></tr>` : ""}
        <tr><td style="padding:8px 0; color:#8e8e93; font-size:0.85rem;">Referenz</td><td style="padding:8px 0; color:#f5f5f7; font-family:monospace; font-size:0.85rem;">${b.id}</td></tr>
      </table>

      ${
        b.message
          ? `<div style="background:rgba(255,255,255,0.03); border-left:2px solid #a855f7; padding:16px 20px; border-radius:8px; margin-bottom:24px;">
              <div style="font-size:0.7rem; letter-spacing:0.25em; text-transform:uppercase; color:#8e8e93; font-weight:600; margin-bottom:8px;">Nachricht</div>
              <div style="color:#f5f5f7; line-height:1.5; white-space:pre-wrap;">${b.message.replace(/</g, "&lt;")}</div>
            </div>`
          : ""
      }

      <p style="color:#8e8e93; font-size:0.85rem; line-height:1.5; margin:0;">
        Diese Buchung steht jetzt mit Status <strong style="color:#f5f5f7;">offen</strong> in deinem Admin-Dashboard.
      </p>
    </div>
  </div>`;
}

// ---------- Gallery Storage ----------
// ---------- Availability Storage ----------
function ensureAvailabilityFile() {
  const dir = path.dirname(AVAILABILITY_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(AVAILABILITY_FILE)) fs.writeFileSync(AVAILABILITY_FILE, "[]", "utf8");
}

function readAvailability() {
  ensureAvailabilityFile();
  try {
    return JSON.parse(fs.readFileSync(AVAILABILITY_FILE, "utf8") || "[]");
  } catch (err) {
    console.error("Error reading availability:", err);
    return [];
  }
}

function writeAvailability(data) {
  ensureAvailabilityFile();
  fs.writeFileSync(AVAILABILITY_FILE, JSON.stringify(data, null, 2), "utf8");
}

// ---------- API: Availability (public read) ----------
app.get("/api/availability", (req, res) => {
  const data = readAvailability();
  res.json(data);
});

// ---------- API: Availability (admin write) ----------
app.post("/api/admin/availability", requireAuth, (req, res) => {
  const { date, type, note } = req.body || {};
  if (!date || !type) {
    return res.status(400).json({ error: "Datum und Typ sind Pflichtfelder." });
  }
  if (!["blockiert", "frei", "belegt", "special"].includes(type)) {
    return res.status(400).json({ error: "Typ muss 'blockiert', 'belegt', 'special' oder 'frei' sein." });
  }
  // Validate date format YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: "Ungültiges Datumsformat. Erwartet: YYYY-MM-DD" });
  }
  let data = readAvailability();
  // Remove existing entry for that date (upsert)
  data = data.filter((x) => x.date !== date);
  data.push({
    date,
    type,
    note: note ? String(note).trim() : "",
    createdAt: new Date().toISOString(),
  });
  data.sort((a, b) => a.date.localeCompare(b.date));
  writeAvailability(data);
  res.json({ ok: true });
});

app.delete("/api/admin/availability/:date", requireAuth, (req, res) => {
  let data = readAvailability();
  const before = data.length;
  data = data.filter((x) => x.date !== req.params.date);
  if (data.length === before) {
    return res.status(404).json({ error: "Kein Eintrag für dieses Datum gefunden." });
  }
  writeAvailability(data);
  res.json({ ok: true });
});

function ensureGalleriesFile() {
  const dir = path.dirname(GALLERIES_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(GALLERIES_FILE))
    fs.writeFileSync(GALLERIES_FILE, "[]", "utf8");
  if (!fs.existsSync(GALLERIES_DIR)) fs.mkdirSync(GALLERIES_DIR, { recursive: true });
}

function readGalleries() {
  ensureGalleriesFile();
  try {
    return JSON.parse(fs.readFileSync(GALLERIES_FILE, "utf8") || "[]");
  } catch (err) {
    console.error("Error reading galleries:", err);
    return [];
  }
}

function writeGalleries(g) {
  ensureGalleriesFile();
  fs.writeFileSync(GALLERIES_FILE, JSON.stringify(g, null, 2), "utf8");
}

function getGallery(id) {
  return readGalleries().find((g) => g.id === id);
}

function listGalleryFiles(galleryId) {
  // If Cloudinary enabled, images are stored in gallery.images[] array
  const g = readGalleries().find(x => x.id === galleryId);
  if (CLOUDINARY_ENABLED && g && g.images) return g.images.map(i => i.publicId || i);
  // Fallback: local disk
  const dir = path.join(GALLERIES_DIR, galleryId);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /\.(jpe?g|png|webp|gif|heic|tiff?)$/i.test(f))
    .sort();
}

function getGalleryImages(galleryId) {
  const g = readGalleries().find(x => x.id === galleryId);
  if (CLOUDINARY_ENABLED && g && g.images) return g.images;
  // Fallback: local disk — return fake objects with publicId = filename
  const dir = path.join(GALLERIES_DIR, galleryId);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /\.(jpe?g|png|webp|gif|heic|tiff?)$/i.test(f))
    .sort()
    .map(f => ({ publicId: f, url: null }));
}

// Upload helper: stream buffer to Cloudinary
function uploadToCloudinary(buffer, folder, originalname) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `diamond-events/${folder}`,
        resource_type: "image",
        transformation: [{ quality: "auto:good", fetch_format: "auto" }],
      },
      (err, result) => {
        if (err) return reject(err);
        resolve(result);
      }
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
}

// Multer — memory storage when Cloudinary enabled, disk otherwise
const galleryUpload = CLOUDINARY_ENABLED
  ? multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } })
  : multer({
      storage: multer.diskStorage({
        destination: (req, file, cb) => {
          const dir = path.join(GALLERIES_DIR, req.params.id);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (req, file, cb) => {
          const safe = (file.originalname || "image").replace(/[^a-zA-Z0-9._-]/g, "_");
          const unique = Date.now() + "_" + Math.random().toString(36).slice(2, 8) + "_" + safe;
          cb(null, unique);
        },
      }),
      limits: { fileSize: 50 * 1024 * 1024 },
    });

// ---------- Auth Middleware ----------
function requireAuth(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  if (req.path.startsWith("/api/")) {
    return res.status(401).json({ error: "Nicht autorisiert" });
  }
  return res.redirect("/login.html");
}

// ---------- Static frontend (public pages) ----------
app.get("/admin.html", requireAuth, (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "admin.html"));
});

// Legacy booking page — merged into buchen.html, keep old links/bookmarks working
app.get("/booking.html", (req, res) => {
  const query = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  res.redirect(301, "/buchen.html" + query);
});

app.use(express.static(FRONTEND_DIR));

// ---------- API: Auth ----------
app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    req.session.isAdmin = true;
    req.session.user = username;
    return res.json({ ok: true });
  }
  return res.status(401).json({ ok: false, error: "Ungültige Zugangsdaten" });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/me", (req, res) => {
  res.json({
    isAdmin: !!(req.session && req.session.isAdmin),
    user: req.session?.user || null,
  });
});

// ---------- API: Public booking creation ----------
app.post("/api/bookings", async (req, res) => {
  const {
    name,
    email,
    eventDate,
    eventLocation,
    package: pkg,
    photography,
    message,
    serviceType,
    discountCode,
  } = req.body || {};

  if (!name || !email || !eventDate || !eventLocation) {
    return res
      .status(400)
      .json({ error: "Name, E-Mail, Datum und Ort sind Pflichtfelder." });
  }

  const svcType = serviceType && VALID_SERVICE_TYPES.includes(serviceType) ? serviceType : "dj";
  const isFotoOnly = svcType === "fotografie";

  if (!isFotoOnly && !pkg) {
    return res.status(400).json({ error: "Bitte ein Paket auswählen." });
  }
  if (pkg && !VALID_PACKAGES.includes(pkg)) {
    return res.status(400).json({ error: "Ungültiges Paket." });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: "Ungültige E-Mail-Adresse." });
  }

  // Re-validate the discount code server-side — never trust the client's number.
  let discountCodes = readDiscountCodes();
  let appliedDiscount = null;
  if (discountCode) {
    const { code: match } = findActiveDiscountCode(discountCodes, discountCode);
    if (match) appliedDiscount = match;
  }

  const booking = {
    id: genId(),
    name: String(name).trim(),
    email: String(email).trim(),
    eventDate: String(eventDate),
    eventLocation: String(eventLocation).trim(),
    package: pkg || "",
    serviceType: svcType,
    photography:
      photography === true || photography === "true" || photography === "ja",
    message: message ? String(message).trim() : "",
    status: "offen",
    createdAt: new Date().toISOString(),
    discountCode: appliedDiscount ? appliedDiscount.code : "",
    discountType: appliedDiscount ? appliedDiscount.type : "",
    discountValue: appliedDiscount ? appliedDiscount.value : null,
  };

  const bookings = readBookings();
  bookings.push(booking);
  writeBookings(bookings);

  if (appliedDiscount) {
    const idx = discountCodes.findIndex((c) => c.id === appliedDiscount.id);
    if (idx !== -1) {
      discountCodes[idx].usageCount = (discountCodes[idx].usageCount || 0) + 1;
      writeDiscountCodes(discountCodes);
    }
  }

  // Fire-and-forget emails (don't block API response)
  const customerMail = renderEmailFromTemplate("booking_received", booking);
  if (customerMail) {
    sendEmail({
      to: booking.email,
      subject: customerMail.subject,
      html: customerMail.html,
      replyTo: ADMIN_EMAIL || undefined,
    });
  }

  if (ADMIN_EMAIL) {
    sendEmail({
      to: ADMIN_EMAIL,
      subject: `Neue Buchung: ${booking.name} — ${booking.package}`,
      html: adminEmailHtml(booking),
      replyTo: booking.email,
    });
  }

  // Push notification
  sendPushToAll({
    title: "💎 Neue Buchungsanfrage!",
    body: `${booking.name} — ${booking.package} am ${booking.date || "?"}`,
    url: "/admin.html",
  });

  res.json({ ok: true, id: booking.id, booking });
});

// ---------- Push Subscription Endpoints ----------
app.get("/api/push/vapid-public-key", (req, res) => {
  res.json({ key: VAPID_PUBLIC });
});

app.post("/api/push/subscribe", requireAuth, (req, res) => {
  const sub = req.body;
  if (!sub || !sub.endpoint) return res.status(400).json({ error: "Invalid subscription" });
  const subs = readPushSubs();
  if (!subs.find(s => s.endpoint === sub.endpoint)) {
    subs.push(sub);
    writePushSubs(subs);
  }
  res.json({ ok: true });
});

app.delete("/api/push/subscribe", requireAuth, (req, res) => {
  const { endpoint } = req.body;
  writePushSubs(readPushSubs().filter(s => s.endpoint !== endpoint));
  res.json({ ok: true });
});

// ---------- API: Admin CRUD ----------
app.get("/api/bookings", requireAuth, (req, res) => {
  const bookings = readBookings();
  bookings.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  res.json(bookings);
});

app.get("/api/bookings/:id", requireAuth, (req, res) => {
  const bookings = readBookings();
  const b = bookings.find((x) => x.id === req.params.id);
  if (!b) return res.status(404).json({ error: "Buchung nicht gefunden" });
  res.json(b);
});

app.patch("/api/bookings/:id", requireAuth, (req, res) => {
  const bookings = readBookings();
  const idx = bookings.findIndex((x) => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Buchung nicht gefunden" });

  const allowed = [
    "name",
    "email",
    "eventDate",
    "eventLocation",
    "package",
    "serviceType",
    "photography",
    "message",
    "status",
  ];

  const oldStatus = bookings[idx].status;

  for (const key of allowed) {
    if (key in req.body) {
      if (key === "status" && !VALID_STATUSES.includes(req.body.status)) {
        return res.status(400).json({ error: "Ungültiger Status" });
      }
      if (key === "package" && !VALID_PACKAGES.includes(req.body.package)) {
        return res.status(400).json({ error: "Ungültiges Paket" });
      }
      bookings[idx][key] = req.body[key];
    }
  }
  bookings[idx].updatedAt = new Date().toISOString();
  writeBookings(bookings);

  // If status changed AND it's a customer-relevant status → notify customer using template
  const newStatus = bookings[idx].status;
  const notifyStatuses = ["angenommen", "abgelehnt", "storniert"];
  if (newStatus !== oldStatus && notifyStatuses.includes(newStatus)) {
    const mail = renderEmailFromTemplate("status_" + newStatus, bookings[idx]);
    if (mail) {
      sendEmail({
        to: bookings[idx].email,
        subject: mail.subject,
        html: mail.html,
        replyTo: ADMIN_EMAIL || undefined,
      });
    }
  }

  res.json({ ok: true, booking: bookings[idx] });
});

app.delete("/api/bookings/:id", requireAuth, (req, res) => {
  let bookings = readBookings();
  const before = bookings.length;
  bookings = bookings.filter((x) => x.id !== req.params.id);
  if (bookings.length === before)
    return res.status(404).json({ error: "Buchung nicht gefunden" });
  writeBookings(bookings);
  res.json({ ok: true });
});

// ---------- API: Send custom email to a customer ----------
app.post("/api/bookings/:id/email", requireAuth, async (req, res) => {
  const { subject, body } = req.body || {};
  if (!subject || !body) {
    return res.status(400).json({ error: "Betreff und Text sind Pflichtfelder." });
  }
  const bookings = readBookings();
  const b = bookings.find((x) => x.id === req.params.id);
  if (!b) return res.status(404).json({ error: "Buchung nicht gefunden" });

  if (!RESEND_API_KEY) {
    return res.status(503).json({ error: "E-Mail-Versand ist nicht konfiguriert." });
  }

  const filledSubject = fillPlaceholders(String(subject), b);
  const html = customEmailHtml(b, String(body));

  try {
    const resendBody = {
      from: `${SENDER_NAME} <${SENDER_EMAIL}>`,
      to: [b.email],
      subject: filledSubject,
      html,
    };
    if (ADMIN_EMAIL) resendBody.reply_to = ADMIN_EMAIL;

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(resendBody),
    });

    if (!r.ok) {
      const errText = await r.text();
      console.error("[mail] Custom email failed", r.status, errText);
      return res.status(502).json({ error: "Versand fehlgeschlagen: " + errText });
    }
    console.log("[mail] Custom email sent to", b.email);
    res.json({ ok: true });
  } catch (err) {
    console.error("[mail] Exception:", err);
    res.status(500).json({ error: err.message || "Unbekannter Fehler" });
  }
});

// ---------- API: Email Presets (admin only) ----------
app.get("/api/presets", requireAuth, (req, res) => {
  const presets = readPresets();
  presets.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  res.json(presets);
});

app.post("/api/presets", requireAuth, (req, res) => {
  const { name, subject, body } = req.body || {};
  if (!name || !subject || !body) {
    return res.status(400).json({ error: "Name, Betreff und Text sind Pflichtfelder." });
  }
  const presets = readPresets();
  const preset = {
    id: genId(),
    name: String(name).trim(),
    subject: String(subject).trim(),
    body: String(body),
    createdAt: new Date().toISOString(),
  };
  presets.push(preset);
  writePresets(presets);
  res.json({ ok: true, preset });
});

app.patch("/api/presets/:id", requireAuth, (req, res) => {
  const presets = readPresets();
  const idx = presets.findIndex((x) => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Preset nicht gefunden" });
  ["name", "subject", "body"].forEach((k) => {
    if (k in req.body) presets[idx][k] = String(req.body[k]);
  });
  presets[idx].updatedAt = new Date().toISOString();
  writePresets(presets);
  res.json({ ok: true, preset: presets[idx] });
});

app.delete("/api/presets/:id", requireAuth, (req, res) => {
  let presets = readPresets();
  const before = presets.length;
  presets = presets.filter((x) => x.id !== req.params.id);
  if (presets.length === before)
    return res.status(404).json({ error: "Preset nicht gefunden" });
  writePresets(presets);
  res.json({ ok: true });
});

// ---------- API: Auto-Message Templates (admin only) ----------
app.get("/api/templates", requireAuth, (req, res) => {
  const stored = readTemplatesStorage();
  const result = TEMPLATE_KEYS.map((key) => ({
    key,
    label: TEMPLATE_META[key].label,
    description: TEMPLATE_META[key].description,
    subject: (stored[key] || DEFAULT_TEMPLATES[key]).subject,
    body: (stored[key] || DEFAULT_TEMPLATES[key]).body,
    isCustomized: !!stored[key],
    default: DEFAULT_TEMPLATES[key],
  }));
  res.json(result);
});

app.put("/api/templates/:key", requireAuth, (req, res) => {
  const { key } = req.params;
  if (!TEMPLATE_KEYS.includes(key)) {
    return res.status(400).json({ error: "Ungültiger Template-Key" });
  }
  const { subject, body } = req.body || {};
  if (!subject || !body) {
    return res.status(400).json({ error: "Betreff und Text sind Pflichtfelder." });
  }
  const stored = readTemplatesStorage();
  stored[key] = {
    subject: String(subject),
    body: String(body),
    updatedAt: new Date().toISOString(),
  };
  writeTemplatesStorage(stored);
  res.json({ ok: true, template: stored[key] });
});

app.post("/api/templates/:key/reset", requireAuth, (req, res) => {
  const { key } = req.params;
  if (!TEMPLATE_KEYS.includes(key)) {
    return res.status(400).json({ error: "Ungültiger Template-Key" });
  }
  const stored = readTemplatesStorage();
  delete stored[key];
  writeTemplatesStorage(stored);
  res.json({ ok: true, template: DEFAULT_TEMPLATES[key] });
});

// Preview a template without saving (renders against a sample booking)
app.post("/api/templates/:key/preview", requireAuth, (req, res) => {
  const { subject, body } = req.body || {};
  const sampleBooking = {
    name: "Maximilian Mustermann",
    email: "max@example.de",
    eventDate: "2026-08-15",
    eventLocation: "Berlin, Beispiel-Location",
    package: "Diamond Premium",
    photography: true,
    id: "BSP-1234",
  };
  res.json({
    subject: fillPlaceholders(String(subject || ""), sampleBooking),
    html: renderEmailFrame(fillPlaceholdersHtml(String(body || ""), sampleBooking)),
  });
});

// ============================================================
// ---------- API: Galleries ----------
// ============================================================

// Public: list all galleries (no passwords exposed)
app.get("/api/galleries", (req, res) => {
  const list = readGalleries().map((g) => {
    const images = getGalleryImages(g.id);
    const imageCount = images.length;
    let coverUrl = null;
    if (CLOUDINARY_ENABLED && images.length) {
      const coverImg = g.coverImage
        ? images.find(i => i.publicId === g.coverImage) || images[0]
        : images[0];
      coverUrl = coverImg ? cloudinary.url(coverImg.publicId, { width: 600, crop: "fill", quality: "auto", fetch_format: "auto" }) : null;
    }
    return {
      id: g.id,
      name: g.name,
      eventDate: g.eventDate,
      message: g.message || "",
      imageCount,
      coverUrl,
      requiresPassword: !!g.password,
    };
  });
  list.sort((a, b) => (a.eventDate > b.eventDate ? -1 : 1));
  res.json(list);
});

// Public: submit password to unlock a gallery (sets session)
app.post("/api/galleries/:id/access", (req, res) => {
  const g = getGallery(req.params.id);
  if (!g) return res.status(404).json({ error: "Galerie nicht gefunden" });
  const { password } = req.body || {};
  if (g.password && g.password !== password) {
    return res.status(401).json({ error: "Falsches Passwort" });
  }
  if (!req.session.galleries) req.session.galleries = {};
  req.session.galleries[g.id] = true;
  res.json({ ok: true });
});

function checkGalleryAccess(req, res, next) {
  const id = req.params.id;
  if (req.session.isAdmin) return next();
  if (req.session.galleries && req.session.galleries[id]) return next();
  return res.status(401).json({ error: "Nicht freigeschaltet" });
}

// Public: serve cover image redirect (Cloudinary) or local file
app.get("/api/galleries/:id/cover", (req, res) => {
  const g = getGallery(req.params.id);
  if (!g) return res.status(404).end();
  if (CLOUDINARY_ENABLED) {
    const images = g.images || [];
    const coverImg = g.coverImage
      ? images.find(i => i.publicId === g.coverImage) || images[0]
      : images[0];
    if (!coverImg) return res.status(404).end();
    const url = cloudinary.url(coverImg.publicId, { width: 600, crop: "fill", quality: "auto", fetch_format: "auto" });
    return res.redirect(url);
  }
  // Local fallback
  const files = fs.existsSync(path.join(GALLERIES_DIR, g.id))
    ? fs.readdirSync(path.join(GALLERIES_DIR, g.id)).filter(f => /\.(jpe?g|png|webp)$/i.test(f)).sort()
    : [];
  const cover = g.coverImage && files.includes(g.coverImage) ? g.coverImage : files[0];
  if (!cover) return res.status(404).end();
  res.sendFile(path.join(GALLERIES_DIR, g.id, path.basename(cover)));
});

// List images in a gallery (after access)
app.get("/api/galleries/:id/images", checkGalleryAccess, (req, res) => {
  const g = getGallery(req.params.id);
  if (!g) return res.status(404).json({ error: "Galerie nicht gefunden" });
  const images = getGalleryImages(g.id);
  let imageList;
  if (CLOUDINARY_ENABLED) {
    imageList = images.map(img => ({
      publicId: img.publicId,
      url: cloudinary.url(img.publicId, { quality: "auto", fetch_format: "auto" }),
      thumb: cloudinary.url(img.publicId, { width: 400, crop: "fill", quality: "auto", fetch_format: "auto" }),
      uploadedAt: img.uploadedAt || null,
      hash: img.hash || null,
      folderId: img.folderId || null,
    }));
  } else {
    imageList = images.map(img => ({ publicId: img.publicId, url: null, thumb: null, uploadedAt: img.uploadedAt || null, hash: img.hash || null, folderId: img.folderId || null }));
  }
  res.json({
    name: g.name,
    description: g.description,
    eventDate: g.eventDate,
    message: g.message || "",
    folders: g.folders || [],
    images: imageList,
  });
});

// Serve a single image — local fallback only (Cloudinary serves directly via URL)
app.get("/api/galleries/:id/img/:filename", checkGalleryAccess, (req, res) => {
  const g = getGallery(req.params.id);
  if (!g) return res.status(404).end();
  const safeName = path.basename(req.params.filename);
  const filepath = path.join(GALLERIES_DIR, g.id, safeName);
  if (!fs.existsSync(filepath)) return res.status(404).end();
  res.sendFile(filepath);
});

// Download all images as ZIP
app.get("/api/galleries/:id/download", checkGalleryAccess, async (req, res) => {
  const g = getGallery(req.params.id);
  if (!g) return res.status(404).json({ error: "Galerie nicht gefunden" });

  const safeName = (g.name || g.id).replace(/[^a-zA-Z0-9._-]/g, "_");
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="diamond-events-${safeName}.zip"`);

  const archive = archiver("zip", { zlib: { level: 1 } });
  archive.on("error", (err) => { console.error("ZIP error:", err); res.end(); });
  archive.pipe(res);

  if (CLOUDINARY_ENABLED) {
    const images = g.images || [];
    if (!images.length) { archive.finalize(); return; }
    const https = require("https");
    const http = require("http");
    await Promise.all(images.map((img, i) => new Promise((resolve) => {
      const url = img.url || img;
      const ext = (url.split("?")[0].split(".").pop() || "jpg").toLowerCase().slice(0, 4);
      const filename = `${String(i + 1).padStart(3, "0")}.${ext}`;
      const mod = url.startsWith("https") ? https : http;
      mod.get(url, (stream) => {
        archive.append(stream, { name: filename });
        stream.on("end", resolve);
        stream.on("error", resolve);
      }).on("error", resolve);
    })));
  } else {
    const dir = path.join(GALLERIES_DIR, g.id);
    if (fs.existsSync(dir)) archive.directory(dir, false);
  }

  archive.finalize();
});

// ---------- API: Galleries (Admin) ----------
app.get("/api/admin/galleries", requireAuth, (req, res) => {
  const list = readGalleries().map((g) => ({
    ...g,
    imageCount: CLOUDINARY_ENABLED ? (g.images || []).length : listGalleryFiles(g.id).length,
  }));
  list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  res.json(list);
});

app.post("/api/admin/galleries", requireAuth, (req, res) => {
  const { name, password, eventDate, description, message, coverImage } = req.body || {};
  if (!name) return res.status(400).json({ error: "Name ist Pflicht." });
  const galleries = readGalleries();
  const gallery = {
    id: genId(),
    name: String(name).trim(),
    password: password ? String(password) : "",
    eventDate: eventDate || "",
    description: description ? String(description).trim() : "",
    message: message ? String(message).trim() : "",
    coverImage: coverImage ? String(coverImage).trim() : "",
    createdAt: new Date().toISOString(),
  };
  galleries.push(gallery);
  writeGalleries(galleries);
  res.json({ ok: true, gallery });
});

app.patch("/api/admin/galleries/:id", requireAuth, (req, res) => {
  const galleries = readGalleries();
  const idx = galleries.findIndex((x) => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Galerie nicht gefunden" });
  ["name", "password", "eventDate", "description", "message", "coverImage"].forEach((k) => {
    if (k in req.body) galleries[idx][k] = String(req.body[k] || "");
  });
  galleries[idx].updatedAt = new Date().toISOString();
  writeGalleries(galleries);
  res.json({ ok: true, gallery: galleries[idx] });
});

app.delete("/api/admin/galleries/:id", requireAuth, (req, res) => {
  let galleries = readGalleries();
  const before = galleries.length;
  galleries = galleries.filter((x) => x.id !== req.params.id);
  if (galleries.length === before)
    return res.status(404).json({ error: "Galerie nicht gefunden" });
  writeGalleries(galleries);
  // Delete files
  const dir = path.join(GALLERIES_DIR, req.params.id);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  res.json({ ok: true });
});

// Direct-upload signature — browser uploads straight to Cloudinary
app.get("/api/admin/galleries/:id/upload-signature", requireAuth, (req, res) => {
  if (!CLOUDINARY_ENABLED) return res.status(503).json({ error: "Cloudinary nicht konfiguriert" });
  const g = getGallery(req.params.id);
  if (!g) return res.status(404).json({ error: "Galerie nicht gefunden" });

  const timestamp = Math.round(Date.now() / 1000);
  const folder = `diamond-events/${req.params.id}`;
  const paramsToSign = { folder, timestamp };
  const signature = cloudinary.utils.api_sign_request(paramsToSign, process.env.CLOUDINARY_API_SECRET);
  res.json({
    signature,
    timestamp,
    folder,
    apiKey: process.env.CLOUDINARY_API_KEY,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
  });
});

// Notify server after direct Cloudinary upload — store publicId + url
app.post("/api/admin/galleries/:id/notify-upload", requireAuth, express.json(), (req, res) => {
  const { publicId, url, hash, folderId } = req.body || {};
  if (!publicId || !url) return res.status(400).json({ error: "publicId und url erforderlich" });
  const galleries = readGalleries();
  const idx = galleries.findIndex((x) => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Galerie nicht gefunden" });
  if (!galleries[idx].images) galleries[idx].images = [];
  // Duplicate check by hash
  if (hash && galleries[idx].images.some(i => i.hash === hash)) {
    return res.json({ ok: true, duplicate: true });
  }
  galleries[idx].images.push({ publicId, url, uploadedAt: new Date().toISOString(), hash: hash || null, folderId: folderId || null });
  writeGalleries(galleries);
  res.json({ ok: true });
});

// ---------- Folder routes ----------
app.post("/api/admin/galleries/:id/folders", requireAuth, express.json(), (req, res) => {
  const { name } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: "Name erforderlich" });
  const galleries = readGalleries();
  const idx = galleries.findIndex((x) => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Galerie nicht gefunden" });
  if (!galleries[idx].folders) galleries[idx].folders = [];
  const folder = { id: require("crypto").randomBytes(6).toString("hex"), name: name.trim() };
  galleries[idx].folders.push(folder);
  writeGalleries(galleries);
  res.json({ ok: true, folder });
});

app.patch("/api/admin/galleries/:id/folders/:fid", requireAuth, express.json(), (req, res) => {
  const { name } = req.body || {};
  const galleries = readGalleries();
  const idx = galleries.findIndex((x) => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Galerie nicht gefunden" });
  const folders = galleries[idx].folders || [];
  const fi = folders.findIndex(f => f.id === req.params.fid);
  if (fi === -1) return res.status(404).json({ error: "Ordner nicht gefunden" });
  if (name && name.trim()) folders[fi].name = name.trim();
  galleries[idx].folders = folders;
  writeGalleries(galleries);
  res.json({ ok: true, folder: folders[fi] });
});

app.delete("/api/admin/galleries/:id/folders/:fid", requireAuth, (req, res) => {
  const galleries = readGalleries();
  const idx = galleries.findIndex((x) => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Galerie nicht gefunden" });
  galleries[idx].folders = (galleries[idx].folders || []).filter(f => f.id !== req.params.fid);
  // Remove folderId from images that were in this folder
  (galleries[idx].images || []).forEach(img => { if (img.folderId === req.params.fid) img.folderId = null; });
  writeGalleries(galleries);
  res.json({ ok: true });
});

app.patch("/api/admin/galleries/:id/images/:publicId/folder", requireAuth, express.json(), (req, res) => {
  const { folderId } = req.body || {};
  const galleries = readGalleries();
  const idx = galleries.findIndex((x) => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Galerie nicht gefunden" });
  const publicId = decodeURIComponent(req.params.publicId);
  const img = (galleries[idx].images || []).find(i => i.publicId === publicId);
  if (!img) return res.status(404).json({ error: "Bild nicht gefunden" });
  img.folderId = folderId || null;
  writeGalleries(galleries);
  res.json({ ok: true });
});

// Upload images (fallback when Cloudinary not enabled)
app.post(
  "/api/admin/galleries/:id/upload",
  requireAuth,
  galleryUpload.array("images", 200),
  async (req, res) => {
    const g = getGallery(req.params.id);
    if (!g) return res.status(404).json({ error: "Galerie nicht gefunden" });

    if (CLOUDINARY_ENABLED) {
      const files = req.files || [];
      const uploaded = [];
      const failed = [];
      for (const f of files) {
        try {
          const result = await uploadToCloudinary(f.buffer, req.params.id, f.originalname);
          const galleries = readGalleries();
          const idx = galleries.findIndex(x => x.id === req.params.id);
          if (idx !== -1) {
            if (!galleries[idx].images) galleries[idx].images = [];
            galleries[idx].images.push({ publicId: result.public_id, url: result.secure_url });
            writeGalleries(galleries);
          }
          uploaded.push(result.public_id);
        } catch (err) {
          console.error("[cloudinary] Upload error for", f.originalname, err.message);
          failed.push(f.originalname);
        }
      }
      return res.json({ ok: true, uploaded, failed });
    } else {
      res.json({ ok: true, uploaded: (req.files || []).map(f => f.filename) });
    }
  }
);

// Delete a single image
app.delete(
  "/api/admin/galleries/:id/images/:filename",
  requireAuth,
  async (req, res) => {
    const g = getGallery(req.params.id);
    if (!g) return res.status(404).json({ error: "Galerie nicht gefunden" });
    const publicId = decodeURIComponent(req.params.filename);

    if (CLOUDINARY_ENABLED) {
      try {
        await cloudinary.uploader.destroy(publicId);
        const galleries = readGalleries();
        const idx = galleries.findIndex(x => x.id === req.params.id);
        if (idx !== -1) {
          galleries[idx].images = (galleries[idx].images || []).filter(i => i.publicId !== publicId);
          if (galleries[idx].coverImage === publicId) galleries[idx].coverImage = "";
          writeGalleries(galleries);
        }
        return res.json({ ok: true });
      } catch (err) {
        return res.status(500).json({ error: "Löschen fehlgeschlagen: " + err.message });
      }
    }
    // Local fallback
    const safe = path.basename(publicId);
    const filepath = path.join(GALLERIES_DIR, g.id, safe);
    if (!fs.existsSync(filepath))
      return res.status(404).json({ error: "Bild nicht gefunden" });
    fs.unlinkSync(filepath);
    res.json({ ok: true });
  }
);

// ---------- Reviews ----------
const REVIEWS_FILE = path.join(DATA_DIR, "reviews.json");
function readReviews() {
  if (!fs.existsSync(REVIEWS_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(REVIEWS_FILE, "utf8") || "[]"); } catch { return []; }
}
function writeReviews(r) { fs.writeFileSync(REVIEWS_FILE, JSON.stringify(r, null, 2), "utf8"); }

// Public: get approved reviews
app.get("/api/reviews", (req, res) => {
  const reviews = readReviews().filter(r => r.status === "approved");
  reviews.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
  res.json(reviews);
});

// Public: submit review
app.post("/api/reviews", (req, res) => {
  const { name, rating, text, eventType } = req.body || {};
  if (!name || !text || !rating) return res.status(400).json({ error: "Name, Bewertung und Text erforderlich." });
  const r = parseInt(rating);
  if (r < 1 || r > 5) return res.status(400).json({ error: "Bewertung muss zwischen 1 und 5 sein." });
  const review = { id: genId(), name: String(name).trim().slice(0, 80), rating: r, text: String(text).trim().slice(0, 800), eventType: eventType ? String(eventType).trim().slice(0, 60) : "", status: "pending", createdAt: new Date().toISOString() };
  const reviews = readReviews();
  reviews.push(review);
  writeReviews(reviews);
  res.json({ ok: true });
});

// Admin: get all reviews
app.get("/api/admin/reviews", requireAuth, (req, res) => res.json(readReviews().sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))));

// Admin: approve/reject
app.patch("/api/admin/reviews/:id", requireAuth, (req, res) => {
  const { status } = req.body || {};
  if (!["approved", "rejected", "pending"].includes(status)) return res.status(400).json({ error: "Ungültiger Status." });
  const reviews = readReviews();
  const idx = reviews.findIndex(r => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Nicht gefunden." });
  reviews[idx].status = status;
  writeReviews(reviews);
  res.json({ ok: true });
});

// Admin: delete
app.delete("/api/admin/reviews/:id", requireAuth, (req, res) => {
  const reviews = readReviews().filter(r => r.id !== req.params.id);
  writeReviews(reviews);
  res.json({ ok: true });
});


// ---------- Discount Codes ----------
const DISCOUNT_CODES_FILE = path.join(DATA_DIR, "discount-codes.json");
function readDiscountCodes() {
  if (!fs.existsSync(DISCOUNT_CODES_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(DISCOUNT_CODES_FILE, "utf8") || "[]"); } catch { return []; }
}
function writeDiscountCodes(c) { fs.writeFileSync(DISCOUNT_CODES_FILE, JSON.stringify(c, null, 2), "utf8"); }

function findActiveDiscountCode(codes, rawCode) {
  if (!rawCode) return { code: null, error: "Kein Code angegeben." };
  const clean = String(rawCode).trim().toLowerCase();
  const match = codes.find((c) => c.code.toLowerCase() === clean);
  if (!match) return { code: null, error: "Code nicht gefunden." };
  if (!match.active) return { code: null, error: "Code ist nicht mehr aktiv." };
  if (match.expiresAt && match.expiresAt < new Date().toISOString().split("T")[0]) {
    return { code: null, error: "Code ist abgelaufen." };
  }
  if (match.maxUses && match.usageCount >= match.maxUses) {
    return { code: null, error: "Code wurde bereits zu oft eingelöst." };
  }
  return { code: match, error: null };
}

// Public: validate a code (used live in the booking form)
app.post("/api/discount-codes/validate", (req, res) => {
  const { code } = req.body || {};
  const { code: match, error } = findActiveDiscountCode(readDiscountCodes(), code);
  if (!match) return res.status(400).json({ valid: false, error });
  res.json({ valid: true, code: match.code, type: match.type, value: match.value });
});

// Admin: list all
app.get("/api/admin/discount-codes", requireAuth, (req, res) =>
  res.json(readDiscountCodes().sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1)))
);

// Admin: create
app.post("/api/admin/discount-codes", requireAuth, (req, res) => {
  const { code, type, value, maxUses, expiresAt } = req.body || {};
  if (!code || !type || value == null || value === "") {
    return res.status(400).json({ error: "Code, Typ und Wert erforderlich." });
  }
  if (!["percent", "fixed"].includes(type)) {
    return res.status(400).json({ error: "Ungültiger Typ." });
  }
  const numValue = parseFloat(value);
  if (isNaN(numValue) || numValue <= 0) {
    return res.status(400).json({ error: "Ungültiger Wert." });
  }
  if (type === "percent" && numValue > 100) {
    return res.status(400).json({ error: "Prozent darf nicht über 100 liegen." });
  }
  const cleanCode = String(code).trim().toUpperCase();
  if (!cleanCode) return res.status(400).json({ error: "Ungültiger Code." });
  const codes = readDiscountCodes();
  if (codes.some((c) => c.code.toLowerCase() === cleanCode.toLowerCase())) {
    return res.status(400).json({ error: "Code existiert bereits." });
  }
  const entry = {
    id: genId(),
    code: cleanCode,
    type,
    value: numValue,
    active: true,
    maxUses: maxUses ? parseInt(maxUses, 10) : null,
    usageCount: 0,
    expiresAt: expiresAt || null,
    createdAt: new Date().toISOString(),
  };
  codes.push(entry);
  writeDiscountCodes(codes);
  res.json({ ok: true, code: entry });
});

// Admin: toggle active / edit
app.patch("/api/admin/discount-codes/:id", requireAuth, (req, res) => {
  const codes = readDiscountCodes();
  const idx = codes.findIndex((c) => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Nicht gefunden." });
  const { active, value, maxUses, expiresAt } = req.body || {};
  if (active !== undefined) codes[idx].active = !!active;
  if (value !== undefined) {
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue > 0) codes[idx].value = numValue;
  }
  if (maxUses !== undefined) codes[idx].maxUses = maxUses ? parseInt(maxUses, 10) : null;
  if (expiresAt !== undefined) codes[idx].expiresAt = expiresAt || null;
  writeDiscountCodes(codes);
  res.json({ ok: true });
});

// Admin: delete
app.delete("/api/admin/discount-codes/:id", requireAuth, (req, res) => {
  const codes = readDiscountCodes().filter((c) => c.id !== req.params.id);
  writeDiscountCodes(codes);
  res.json({ ok: true });
});

// ---------- Analytics (self-hosted, privacy-friendly pageview tracking) ----------
// No cookies, no persistent identifiers. "Unique visitor" = a hash of IP+UA that
// is salted with the calendar day, so it can't be linked across days and the raw
// IP is never written to disk.
const ANALYTICS_FILE = path.join(DATA_DIR, "analytics.json");
const ANALYTICS_RETENTION_DAYS = 400;
const ANALYTICS_SKIP_PREFIXES = ["/admin", "/login.html", "/api/"];

function readAnalytics() {
  if (!fs.existsSync(ANALYTICS_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(ANALYTICS_FILE, "utf8") || "[]"); } catch { return []; }
}
function writeAnalytics(events) { fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(events), "utf8"); }

function detectDevice(ua) {
  ua = ua || "";
  if (/iPad|Tablet(?!.*Mobile)/i.test(ua)) return "tablet";
  if (/Mobi|Android|iPhone|iPod/i.test(ua)) return "mobile";
  return "desktop";
}

function isBotUA(ua) {
  return /bot|crawl|spider|slurp|facebookexternalhit|preview|monitor|pingdom|curl|wget|python-requests|headlesschrome/i.test(ua || "");
}

function hashVisitor(req, dayKey) {
  const ip = req.ip || req.connection?.remoteAddress || "";
  const ua = req.get("user-agent") || "";
  return crypto.createHash("sha256").update(`${dayKey}|${ip}|${ua}`).digest("hex").slice(0, 16);
}

// Public: fired via navigator.sendBeacon from every public page (see main.js).
// Responds immediately — tracking must never slow the page down.
app.post("/api/track", (req, res) => {
  res.status(204).end();
  try {
    const ua = req.get("user-agent") || "";
    if (isBotUA(ua)) return;

    let reqPath = String((req.body && req.body.path) || "").split("?")[0].split("#")[0].slice(0, 200);
    if (!reqPath.startsWith("/")) reqPath = "/" + reqPath;
    if (ANALYTICS_SKIP_PREFIXES.some((p) => reqPath.startsWith(p))) return;

    let refDomain = "";
    const ref = (req.body && req.body.ref) || "";
    if (ref) {
      try { refDomain = new URL(ref).hostname.replace(/^www\./, "").slice(0, 100); } catch {}
    }

    const now = new Date();
    const dayKey = now.toISOString().slice(0, 10);

    const events = readAnalytics();
    events.push({
      path: reqPath,
      device: detectDevice(ua),
      ref: refDomain,
      vh: hashVisitor(req, dayKey),
      ts: now.toISOString(),
    });

    const cutoff = new Date(now.getTime() - ANALYTICS_RETENTION_DAYS * 86400000).toISOString();
    writeAnalytics(events.filter((e) => e.ts >= cutoff));
  } catch (err) {
    console.error("Tracking error:", err);
  }
});

// Admin: aggregated stats for the analytics dashboard
app.get("/api/admin/analytics", requireAuth, (req, res) => {
  const days = Math.min(parseInt(req.query.days, 10) || 30, 365);
  const events = readAnalytics();
  const now = new Date();
  const cutoff = new Date(now.getTime() - days * 86400000);

  const inRange = events.filter((e) => new Date(e.ts) >= cutoff);

  const uniqueVisitors = new Set(inRange.map((e) => e.vh)).size;

  const pageCounts = {};
  inRange.forEach((e) => { pageCounts[e.path] = (pageCounts[e.path] || 0) + 1; });
  const topPages = Object.entries(pageCounts)
    .map(([path, views]) => ({ path, views }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 10);

  const deviceCounts = { desktop: 0, mobile: 0, tablet: 0 };
  inRange.forEach((e) => { deviceCounts[e.device] = (deviceCounts[e.device] || 0) + 1; });

  const refCounts = {};
  inRange.forEach((e) => { if (e.ref) refCounts[e.ref] = (refCounts[e.ref] || 0) + 1; });
  const topReferrers = Object.entries(refCounts)
    .map(([ref, count]) => ({ ref, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const dayMap = {};
  inRange.forEach((e) => {
    const d = e.ts.slice(0, 10);
    if (!dayMap[d]) dayMap[d] = { views: 0, visitors: new Set() };
    dayMap[d].views++;
    dayMap[d].visitors.add(e.vh);
  });
  const dailySeries = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000).toISOString().slice(0, 10);
    dailySeries.push({
      date: d,
      views: dayMap[d]?.views || 0,
      visitors: dayMap[d]?.visitors.size || 0,
    });
  }

  res.json({ totalViews: inRange.length, uniqueVisitors, topPages, deviceCounts, topReferrers, dailySeries });
});

// ---------- Fragebogen (event questionnaire, sent per-booking link) ----------
const QUESTIONNAIRE_FIELDS = [
  "contactName", "contactPhone", "timeline",
  "firstDanceSong", "mustPlaySongs", "noPlaySongs", "genres", "notes",
];

// Public: booking context + existing answers, keyed by the booking's own id
app.get("/api/questionnaire/:bookingId", (req, res) => {
  const booking = readBookings().find((b) => b.id === req.params.bookingId);
  if (!booking) return res.status(404).json({ error: "Fragebogen nicht gefunden." });
  res.json({
    name: booking.name,
    eventDate: booking.eventDate,
    eventLocation: booking.eventLocation,
    package: booking.package,
    questionnaire: booking.questionnaire || null,
  });
});

// Public: submit or update answers
app.post("/api/questionnaire/:bookingId", (req, res) => {
  const bookings = readBookings();
  const idx = bookings.findIndex((b) => b.id === req.params.bookingId);
  if (idx === -1) return res.status(404).json({ error: "Fragebogen nicht gefunden." });

  const body = req.body || {};
  const answers = {};
  QUESTIONNAIRE_FIELDS.forEach((f) => {
    answers[f] = f === "genres"
      ? (Array.isArray(body.genres) ? body.genres.map(String) : [])
      : (body[f] ? String(body[f]).trim() : "");
  });
  answers.submittedAt = new Date().toISOString();

  bookings[idx].questionnaire = answers;
  writeBookings(bookings);

  if (ADMIN_EMAIL) {
    sendEmail({
      to: ADMIN_EMAIL,
      subject: `Fragebogen ausgefüllt: ${bookings[idx].name}`,
      html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background:#050507; color:#f5f5f7; padding:40px 20px;">
        <div style="max-width:560px; margin:0 auto; background:#0d0d14; border:1px solid rgba(255,255,255,0.07); border-radius:20px; padding:40px;">
          <div style="font-size:0.7rem; letter-spacing:0.3em; text-transform:uppercase; background:linear-gradient(135deg,#00f0ff,#a855f7,#ff00e6); -webkit-background-clip:text; background-clip:text; color:transparent; font-weight:700; margin-bottom:8px;">Fragebogen ausgefüllt</div>
          <h1 style="font-size:1.75rem; font-weight:700; letter-spacing:-0.03em; margin:0 0 24px;">${escapeHtmlServer(bookings[idx].name)}</h1>
          <p style="color:#8e8e93; font-size:0.85rem; line-height:1.5;">Hochzeit am ${fmtDate(bookings[idx].eventDate)}. Die Antworten stehen jetzt bei der Buchung im Admin-Dashboard.</p>
        </div>
      </div>`,
    });
  }

  sendPushToAll({
    title: "📋 Fragebogen ausgefüllt!",
    body: `${bookings[idx].name} hat den Hochzeits-Fragebogen abgeschickt.`,
    url: "/admin.html",
  });

  res.json({ ok: true });
});

// ---------- Start ----------
// Backfill uploadedAt for existing images (set to 8 days ago so they don't show NEU)
function backfillUploadedAt() {
  const galleries = readGalleries();
  const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
  let changed = false;
  galleries.forEach(g => {
    if (!g.images) return;
    g.images.forEach(img => {
      if (typeof img === "object" && !img.uploadedAt) { img.uploadedAt = old; changed = true; }
    });
  });
  if (changed) writeGalleries(galleries);
}

app.listen(PORT, () => {
  ensureDataFile();
  backfillUploadedAt();
  console.log(`\n  Diamond Events running at: http://localhost:${PORT}`);
  console.log(`  Admin Login:  /login.html`);
  console.log(`  Username:     ${ADMIN_USER}`);
  console.log(`  Password:     ${ADMIN_PASS}`);
  console.log(
    `  Email:        ${
      RESEND_API_KEY ? `configured (Resend, from: ${SENDER_EMAIL})` : "NOT configured"
    }\n`
  );
});

// ---------- Event (Fotify-like) ----------
const EVENT_FILE = path.join(DATA_DIR, "event_data.json");
function readEventData() {
  if (!fs.existsSync(EVENT_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(EVENT_FILE, "utf8") || "{}"); } catch { return {}; }
}
function writeEventData(d) { fs.writeFileSync(EVENT_FILE, JSON.stringify(d, null, 2), "utf8"); }

function getEvent(galleryId) {
  const data = readEventData();
  return data[galleryId] || null;
}

// Public: get event info (name, active features)
app.get("/api/event/:id", (req, res) => {
  const g = getGallery(req.params.id);
  if (!g) return res.status(404).json({ error: "Event nicht gefunden" });
  const ev = getEvent(req.params.id) || {};
  res.json({
    name: g.name,
    eventDate: g.eventDate,
    allowPhotoUpload: ev.allowPhotoUpload !== false,
    allowSongRequests: ev.allowSongRequests !== false,
    welcomeText: ev.welcomeText || `Willkommen bei ${g.name}!`,
    active: ev.active !== false,
  });
});

// Public: submit song request
app.post("/api/event/:id/song-request", (req, res) => {
  const { song, artist, guestName } = req.body || {};
  if (!song) return res.status(400).json({ error: "Song erforderlich" });
  const g = getGallery(req.params.id);
  if (!g) return res.status(404).json({ error: "Event nicht gefunden" });
  const data = readEventData();
  if (!data[req.params.id]) data[req.params.id] = {};
  if (!data[req.params.id].songRequests) data[req.params.id].songRequests = [];
  data[req.params.id].songRequests.push({
    id: genId(), song: String(song).trim().slice(0, 100),
    artist: artist ? String(artist).trim().slice(0, 80) : "",
    guestName: guestName ? String(guestName).trim().slice(0, 60) : "Anonym",
    createdAt: new Date().toISOString(), played: false,
  });
  writeEventData(data);
  res.json({ ok: true });
});

// Public: get recent photos for live wall
app.get("/api/event/:id/photos", (req, res) => {
  const g = getGallery(req.params.id);
  if (!g) return res.status(404).json({ error: "Nicht gefunden" });
  const images = (g.images || []).slice(-40).reverse();
  res.json({ images });
});

// Public: guest upload (uses existing Cloudinary setup, no auth required for event uploads)
app.get("/api/event/:id/upload-signature", (req, res) => {
  if (!CLOUDINARY_ENABLED) return res.status(503).json({ error: "Upload nicht verfügbar" });
  const g = getGallery(req.params.id);
  if (!g) return res.status(404).json({ error: "Event nicht gefunden" });
  const ev = getEvent(req.params.id) || {};
  if (ev.allowPhotoUpload === false) return res.status(403).json({ error: "Upload deaktiviert" });
  const timestamp = Math.round(Date.now() / 1000);
  const folder = `diamond-events/${req.params.id}`;
  const signature = cloudinary.utils.api_sign_request({ folder, timestamp }, process.env.CLOUDINARY_API_SECRET);
  res.json({ signature, timestamp, folder, apiKey: process.env.CLOUDINARY_API_KEY, cloudName: process.env.CLOUDINARY_CLOUD_NAME });
});

app.post("/api/event/:id/notify-upload", (req, res) => {
  const { publicId, url } = req.body || {};
  if (!publicId || !url) return res.status(400).json({ error: "Fehlende Daten" });
  const galleries = readGalleries();
  const idx = galleries.findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Nicht gefunden" });
  if (!galleries[idx].images) galleries[idx].images = [];
  galleries[idx].images.push({ publicId, url });
  writeGalleries(galleries);
  res.json({ ok: true });
});

// Admin: get/update event settings
app.get("/api/admin/event/:id", requireAuth, (req, res) => {
  const ev = getEvent(req.params.id) || {};
  res.json({
    active: ev.active !== false,
    allowPhotoUpload: ev.allowPhotoUpload !== false,
    allowSongRequests: ev.allowSongRequests !== false,
    welcomeText: ev.welcomeText || "",
    songRequests: ev.songRequests || [],
  });
});

app.patch("/api/admin/event/:id", requireAuth, (req, res) => {
  const data = readEventData();
  if (!data[req.params.id]) data[req.params.id] = {};
  const allowed = ["allowPhotoUpload","allowSongRequests","welcomeText","active"];
  allowed.forEach(k => { if (k in req.body) data[req.params.id][k] = req.body[k]; });
  writeEventData(data);
  res.json({ ok: true });
});

// Admin: get song requests
app.get("/api/admin/event/:id/song-requests", requireAuth, (req, res) => {
  const ev = getEvent(req.params.id) || {};
  res.json(ev.songRequests || []);
});

// Admin: mark song as played
app.patch("/api/admin/event/:id/song-requests/:sid", requireAuth, (req, res) => {
  const data = readEventData();
  const ev = data[req.params.id];
  if (!ev || !ev.songRequests) return res.status(404).json({ error: "Nicht gefunden" });
  const req2 = ev.songRequests.find(s => s.id === req.params.sid);
  if (!req2) return res.status(404).json({ error: "Nicht gefunden" });
  req2.played = req.body.played !== false;
  writeEventData(data);
  res.json({ ok: true });
});

// Admin: delete song request
app.delete("/api/admin/event/:id/song-requests/:sid", requireAuth, (req, res) => {
  const data = readEventData();
  if (data[req.params.id]?.songRequests) {
    data[req.params.id].songRequests = data[req.params.id].songRequests.filter(s => s.id !== req.params.sid);
    writeEventData(data);
  }
  res.json({ ok: true });
});

// ---------- Fallback 404 for API ----------
app.use("/api", (req, res) => res.status(404).json({ error: "Not Found" }));
