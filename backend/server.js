/**
 * Diamond Events — Backend Server
 * Express + JSON file storage + session-based admin auth + Brevo email
 */

const express = require("express");
const session = require("express-session");
const fs = require("fs");
const path = require("path");

// ---------- Config ----------
const PORT = process.env.PORT || 3000;
// DATA_DIR: where to persist JSON files. Defaults to /data on Render (persistent disk),
// falls back to local ../data folder when developing on your computer.
const DATA_DIR =
  process.env.DATA_DIR || path.join(__dirname, "..", "data");
const DATA_FILE = path.join(DATA_DIR, "bookings.json");
const PRESETS_FILE = path.join(DATA_DIR, "presets.json");
const TEMPLATES_FILE = path.join(DATA_DIR, "templates.json");
const FRONTEND_DIR = path.join(__dirname, "..", "frontend");

const ADMIN_USER = process.env.ADMIN_USER || "DJ DIAMOND";
const ADMIN_PASS = process.env.ADMIN_PASS || "passwort";

const VALID_STATUSES = ["offen", "angenommen", "abgelehnt", "storniert"];
const VALID_PACKAGES = ["Diamond Lite", "Diamond Premium", "Diamond Exclusive"];

// Email config (via env vars on Render) — RESEND
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || ""; // Where you receive notifications
const SENDER_EMAIL = process.env.SENDER_EMAIL || "onboarding@resend.dev"; // Resend test sender; replace once domain is verified
const SENDER_NAME = process.env.SENDER_NAME || "Diamond Events";

// ---------- App ----------
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "diamond-events-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, maxAge: 1000 * 60 * 60 * 8 }, // 8h
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
  } = req.body || {};

  if (!name || !email || !eventDate || !eventLocation || !pkg) {
    return res
      .status(400)
      .json({ error: "Name, E-Mail, Datum, Ort und Paket sind Pflichtfelder." });
  }
  if (!VALID_PACKAGES.includes(pkg)) {
    return res.status(400).json({ error: "Ungültiges Paket." });
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: "Ungültige E-Mail-Adresse." });
  }

  const booking = {
    id: genId(),
    name: String(name).trim(),
    email: String(email).trim(),
    eventDate: String(eventDate),
    eventLocation: String(eventLocation).trim(),
    package: pkg,
    photography:
      photography === true || photography === "true" || photography === "ja",
    message: message ? String(message).trim() : "",
    status: "offen",
    createdAt: new Date().toISOString(),
  };

  const bookings = readBookings();
  bookings.push(booking);
  writeBookings(bookings);

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

  res.json({ ok: true, id: booking.id, booking });
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

// ---------- Fallback 404 for API ----------
app.use("/api", (req, res) => res.status(404).json({ error: "Not Found" }));

// ---------- Start ----------
app.listen(PORT, () => {
  ensureDataFile();
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
