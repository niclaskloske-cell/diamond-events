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
const DATA_FILE = path.join(__dirname, "..", "data", "bookings.json");
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
 
function customerEmailHtml(b) {
  return `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background:#050507; color:#f5f5f7; padding:40px 20px;">
    <div style="max-width:560px; margin:0 auto; background:#0d0d14; border:1px solid rgba(255,255,255,0.07); border-radius:20px; padding:40px;">
      <div style="font-size:1.5rem; font-weight:700; letter-spacing:-0.02em; margin-bottom:8px;">
        Diamond<span style="background:linear-gradient(135deg,#00f0ff,#a855f7,#ff00e6); -webkit-background-clip:text; background-clip:text; color:transparent;">.</span>Events
      </div>
      <div style="font-size:0.7rem; letter-spacing:0.3em; text-transform:uppercase; color:#8e8e93; margin-bottom:32px;">Premium Event Brand</div>
 
      <h1 style="font-size:1.75rem; font-weight:700; letter-spacing:-0.03em; line-height:1.15; margin:0 0 16px;">
        Vielen Dank für deine Anfrage, ${b.name}!
      </h1>
 
      <p style="color:#a0a0a5; line-height:1.6; margin:0 0 24px;">
        Wir haben deine Buchungsanfrage erhalten und melden uns innerhalb von
        24 Stunden mit einem maßgeschneiderten Vorschlag bei dir.
      </p>
 
      <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:14px; padding:24px; margin:24px 0;">
        <div style="font-size:0.7rem; letter-spacing:0.25em; text-transform:uppercase; color:#8e8e93; font-weight:600; margin-bottom:16px;">Deine Anfrage</div>
        <table style="width:100%; border-collapse:collapse;">
          <tr><td style="padding:8px 0; color:#8e8e93; font-size:0.85rem; width:120px;">Datum</td><td style="padding:8px 0; color:#f5f5f7;">${fmtDate(b.eventDate)}</td></tr>
          <tr><td style="padding:8px 0; color:#8e8e93; font-size:0.85rem;">Ort</td><td style="padding:8px 0; color:#f5f5f7;">${b.eventLocation}</td></tr>
          <tr><td style="padding:8px 0; color:#8e8e93; font-size:0.85rem;">Paket</td><td style="padding:8px 0; color:#f5f5f7;">${b.package}</td></tr>
          <tr><td style="padding:8px 0; color:#8e8e93; font-size:0.85rem;">Fotografie</td><td style="padding:8px 0; color:#f5f5f7;">${b.photography ? "Ja" : "Nein"}</td></tr>
          <tr><td style="padding:8px 0; color:#8e8e93; font-size:0.85rem;">Referenz</td><td style="padding:8px 0; color:#f5f5f7; font-family:monospace;">${b.id}</td></tr>
        </table>
      </div>
 
      <p style="color:#a0a0a5; line-height:1.6; margin:0 0 8px;">
        Bei Fragen einfach auf diese E-Mail antworten.
      </p>
      <p style="color:#a0a0a5; line-height:1.6; margin:0;">
        Bis bald!<br/>
        <strong style="color:#f5f5f7;">Diamond Events</strong>
      </p>
 
      <div style="margin-top:40px; padding-top:24px; border-top:1px solid rgba(255,255,255,0.07); color:#8e8e93; font-size:0.75rem; text-align:center;">
        Diamond Events — Premium Entertainment & Photography
      </div>
    </div>
  </div>`;
}
 
// Email template for status changes — sent to customer
function statusChangeEmailHtml(b, status) {
  const config = {
    angenommen: {
      tagColor: "#34d399",
      tag: "Buchung bestätigt",
      heading: `Deine Buchung ist bestätigt, ${b.name}!`,
      body: `Wir freuen uns auf dein Event! Deine Buchungsanfrage haben wir gerade angenommen — jetzt geht's an die Detailplanung. Wir melden uns in den nächsten Tagen bei dir, um die letzten Details abzustimmen.`,
    },
    abgelehnt: {
      tagColor: "#f87171",
      tag: "Anfrage nicht möglich",
      heading: `Deine Anfrage, ${b.name}`,
      body: `Leider müssen wir dir absagen — an deinem Wunschtermin ist unser Team bereits ausgebucht. Wir hätten dich gerne unterstützt. Falls du Flexibilität beim Datum hast, melde dich gerne — vielleicht finden wir noch eine Lösung. Antworte einfach auf diese E-Mail.`,
    },
    storniert: {
      tagColor: "#9ca3af",
      tag: "Buchung storniert",
      heading: `Deine Buchung wurde storniert`,
      body: `Wir bestätigen hiermit die Stornierung deiner Buchung. Falls das ein Versehen war oder du noch Fragen hast, antworte gerne direkt auf diese E-Mail.`,
    },
  };
  const c = config[status] || config.angenommen;
 
  return `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background:#050507; color:#f5f5f7; padding:40px 20px;">
    <div style="max-width:560px; margin:0 auto; background:#0d0d14; border:1px solid rgba(255,255,255,0.07); border-radius:20px; padding:40px;">
      <div style="font-size:1.5rem; font-weight:700; letter-spacing:-0.02em; margin-bottom:8px;">
        Diamond<span style="background:linear-gradient(135deg,#00f0ff,#a855f7,#ff00e6); -webkit-background-clip:text; background-clip:text; color:transparent;">.</span>Events
      </div>
      <div style="display:inline-block; font-size:0.7rem; letter-spacing:0.25em; text-transform:uppercase; color:${c.tagColor}; border:1px solid ${c.tagColor}33; padding:5px 12px; border-radius:50px; margin:8px 0 28px; font-weight:600;">${c.tag}</div>
 
      <h1 style="font-size:1.6rem; font-weight:700; letter-spacing:-0.03em; line-height:1.2; margin:0 0 16px;">${c.heading}</h1>
      <p style="color:#a0a0a5; line-height:1.65; margin:0 0 24px;">${c.body}</p>
 
      <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:14px; padding:24px; margin:24px 0;">
        <div style="font-size:0.7rem; letter-spacing:0.25em; text-transform:uppercase; color:#8e8e93; font-weight:600; margin-bottom:16px;">Deine Buchung</div>
        <table style="width:100%; border-collapse:collapse;">
          <tr><td style="padding:8px 0; color:#8e8e93; font-size:0.85rem; width:120px;">Datum</td><td style="padding:8px 0; color:#f5f5f7;">${fmtDate(b.eventDate)}</td></tr>
          <tr><td style="padding:8px 0; color:#8e8e93; font-size:0.85rem;">Ort</td><td style="padding:8px 0; color:#f5f5f7;">${b.eventLocation}</td></tr>
          <tr><td style="padding:8px 0; color:#8e8e93; font-size:0.85rem;">Paket</td><td style="padding:8px 0; color:#f5f5f7;">${b.package}</td></tr>
          <tr><td style="padding:8px 0; color:#8e8e93; font-size:0.85rem;">Referenz</td><td style="padding:8px 0; color:#f5f5f7; font-family:monospace; font-size:0.85rem;">${b.id}</td></tr>
        </table>
      </div>
 
      <p style="color:#a0a0a5; line-height:1.6; margin:0 0 6px;">Bei Fragen einfach antworten.</p>
      <p style="color:#a0a0a5; line-height:1.6; margin:0;">Beste Grüße<br/><strong style="color:#f5f5f7;">Diamond Events</strong></p>
 
      <div style="margin-top:40px; padding-top:24px; border-top:1px solid rgba(255,255,255,0.07); color:#8e8e93; font-size:0.75rem; text-align:center;">
        Diamond Events — Premium Entertainment & Photography
      </div>
    </div>
  </div>`;
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
  sendEmail({
    to: booking.email,
    subject: "Deine Anfrage bei Diamond Events",
    html: customerEmailHtml(booking),
    replyTo: ADMIN_EMAIL || undefined,
  });
 
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
 
  // If status changed AND it's a customer-relevant status → notify customer
  const newStatus = bookings[idx].status;
  const notifyStatuses = ["angenommen", "abgelehnt", "storniert"];
  if (newStatus !== oldStatus && notifyStatuses.includes(newStatus)) {
    const subjects = {
      angenommen: "Deine Buchung ist bestätigt — Diamond Events",
      abgelehnt: "Zu deiner Anfrage bei Diamond Events",
      storniert: "Stornierung deiner Buchung — Diamond Events",
    };
    sendEmail({
      to: bookings[idx].email,
      subject: subjects[newStatus],
      html: statusChangeEmailHtml(bookings[idx], newStatus),
      replyTo: ADMIN_EMAIL || undefined,
    });
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
