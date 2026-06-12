/**
 * Admin Dashboard
 * - Loads bookings from /api/bookings
 * - Filters, status updates, edit, delete
 * - Calendar visualization
 */

(function () {
  let bookings = [];
  let currentFilter = "all";
  let currentView = "list";

  // Calendar state
  const today = new Date();
  let calYear = today.getFullYear();
  let calMonth = today.getMonth(); // 0-based

  // ---------- Helpers ----------
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

  function fmtDateTime(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function fmtRelative(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const diffMs = Date.now() - d.getTime();
    const min = Math.round(diffMs / 60000);
    if (min < 1) return "gerade eben";
    if (min < 60) return `vor ${min} Min`;
    const hrs = Math.round(min / 60);
    if (hrs < 24) return `vor ${hrs} Std`;
    const days = Math.round(hrs / 24);
    if (days < 7) return `vor ${days} Tagen`;
    return fmtDate(iso);
  }

  function escapeHtml(str) {
    if (str == null) return "";
    return String(str).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c])
    );
  }

  function statusPill(status) {
    return `<span class="status-pill ${status}">${status}</span>`;
  }

  // ---------- Logout ----------
  document.getElementById("logoutLink").addEventListener("click", async (e) => {
    e.preventDefault();
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login.html";
  });

  // ---------- Load ----------
  async function loadBookings() {
    try {
      const res = await fetch("/api/bookings");
      if (res.status === 401) {
        window.location.href = "/login.html";
        return;
      }
      bookings = await res.json();
      render();
    } catch (err) {
      console.error(err);
      document.getElementById("bookingsContent").innerHTML = `
        <div class="empty-state">
          <h3>Fehler beim Laden</h3>
          <p>${escapeHtml(err.message)}</p>
        </div>`;
    }
  }

  // ---------- Render: Stats ----------
  function renderStats() {
    document.getElementById("statTotal").textContent = bookings.length;
    document.getElementById("statOpen").textContent = bookings.filter(
      (b) => b.status === "offen"
    ).length;
    document.getElementById("statAccepted").textContent = bookings.filter(
      (b) => b.status === "angenommen"
    ).length;
    document.getElementById("statRejected").textContent = bookings.filter(
      (b) => b.status === "abgelehnt"
    ).length;
  }

  // ---------- Render: Table ----------
  function renderTable() {
    const filtered =
      currentFilter === "all"
        ? bookings
        : bookings.filter((b) => b.status === currentFilter);

    const container = document.getElementById("bookingsContent");

    if (!filtered.length) {
      container.innerHTML = `
        <div class="empty-state">
          <h3>Keine Buchungen</h3>
          <p>Hier erscheinen alle Anfragen, sobald jemand bucht.</p>
        </div>`;
      return;
    }

    container.innerHTML = `
      <table class="bookings-table">
        <thead>
          <tr>
            <th>Kunde</th>
            <th>Event</th>
            <th>Paket</th>
            <th>Eingegangen</th>
            <th>Status</th>
            <th style="text-align:right;">Aktionen</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map(rowHtml).join("")}
        </tbody>
      </table>
    `;

    // Wire actions
    container.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        const action = btn.dataset.action;
        handleAction(action, id);
      });
    });
  }

  function rowHtml(b) {
    const messagePreview = b.message
      ? `<div class="email" style="margin-top:4px; font-style:italic;">"${escapeHtml(
          b.message.length > 50 ? b.message.slice(0, 50) + "…" : b.message
        )}"</div>`
      : "";
    return `
      <tr data-id="${b.id}" style="cursor:pointer;">
        <td data-label="Kunde">
          <div class="name">${escapeHtml(b.name)}</div>
          <div class="email">${escapeHtml(b.email)}</div>
        </td>
        <td data-label="Event">
          <div>${fmtDate(b.eventDate)}</div>
          <div class="email">${escapeHtml(b.eventLocation || "—")}</div>
          ${messagePreview}
        </td>
        <td data-label="Paket">
          <div>${escapeHtml(b.package)}</div>
          ${b.photography ? '<div class="email">+ Fotografie</div>' : ""}
        </td>
        <td data-label="Eingegangen">
          <div style="font-size:0.85rem;">${fmtRelative(b.createdAt)}</div>
          <div class="email" style="font-size:0.75rem;">${fmtDateTime(b.createdAt)}</div>
        </td>
        <td data-label="Status">${statusPill(b.status)}</td>
        <td data-label="Aktionen" style="text-align:right;">
          <div class="row-actions" style="justify-content:flex-end;">
            <button data-action="detail" data-id="${b.id}">Details</button>
            <button data-action="email" data-id="${b.id}">E-Mail</button>
            ${
              b.status !== "angenommen"
                ? `<button class="success" data-action="accept" data-id="${b.id}">Annehmen</button>`
                : ""
            }
            ${
              b.status !== "abgelehnt"
                ? `<button class="danger" data-action="reject" data-id="${b.id}">Ablehnen</button>`
                : ""
            }
            ${
              b.status !== "storniert"
                ? `<button class="warning" data-action="cancel" data-id="${b.id}">Stornieren</button>`
                : ""
            }
            <button data-action="edit" data-id="${b.id}">Bearbeiten</button>
            <button class="danger" data-action="delete" data-id="${b.id}">Löschen</button>
          </div>
        </td>
      </tr>`;
  }

  // ---------- Actions ----------
  async function handleAction(action, id) {
    const b = bookings.find((x) => x.id === id);
    if (!b) return;

    if (action === "accept") return setStatus(id, "angenommen");
    if (action === "reject") return setStatus(id, "abgelehnt");
    if (action === "cancel") return setStatus(id, "storniert");
    if (action === "edit") return openEditModal(b);
    if (action === "delete") return deleteBooking(id, b);
    if (action === "detail") return openDetailModal(b);
    if (action === "email") return openEmailModal(b);
  }

  async function setStatus(id, status) {
    try {
      const res = await fetch(`/api/bookings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Update failed");
      const json = await res.json();
      const idx = bookings.findIndex((x) => x.id === id);
      if (idx >= 0) bookings[idx] = json.booking;
      render();
      window.showToast(`Status: ${status}`, "success");
    } catch (err) {
      window.showToast("Fehler: " + err.message, "error");
    }
  }

  async function deleteBooking(id, b) {
    if (!confirm(`Buchung von "${b.name}" wirklich löschen?`)) return;
    try {
      const res = await fetch(`/api/bookings/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Löschen fehlgeschlagen");
      bookings = bookings.filter((x) => x.id !== id);
      render();
      window.showToast("Buchung gelöscht", "success");
    } catch (err) {
      window.showToast("Fehler: " + err.message, "error");
    }
  }

  // ---------- Detail Modal ----------
  const detailModal = document.getElementById("detailModal");

  function openDetailModal(b) {
    document.getElementById("detailTitle").textContent = b.name;
    document.getElementById("detailStatusPill").innerHTML = statusPill(b.status);
    const content = document.getElementById("detailContent");
    content.innerHTML = `
      <div style="background:rgba(255,255,255,0.02); border:1px solid var(--line); border-radius:12px; padding:1.25rem; margin-bottom:1.25rem;">
        <table style="width:100%; border-collapse:collapse;">
          <tr><td style="padding:6px 0; color:var(--text-muted); font-size:0.75rem; letter-spacing:0.15em; text-transform:uppercase; width:40%;">E-Mail</td>
              <td style="padding:6px 0;"><a href="mailto:${escapeHtml(b.email)}" style="color:var(--neon-cyan); text-decoration:none;">${escapeHtml(b.email)}</a></td></tr>
          <tr><td style="padding:6px 0; color:var(--text-muted); font-size:0.75rem; letter-spacing:0.15em; text-transform:uppercase;">Datum</td>
              <td style="padding:6px 0;">${fmtDate(b.eventDate)}</td></tr>
          <tr><td style="padding:6px 0; color:var(--text-muted); font-size:0.75rem; letter-spacing:0.15em; text-transform:uppercase;">Ort</td>
              <td style="padding:6px 0;">${escapeHtml(b.eventLocation || "—")}</td></tr>
          <tr><td style="padding:6px 0; color:var(--text-muted); font-size:0.75rem; letter-spacing:0.15em; text-transform:uppercase;">Paket</td>
              <td style="padding:6px 0;">${escapeHtml(b.package)}</td></tr>
          <tr><td style="padding:6px 0; color:var(--text-muted); font-size:0.75rem; letter-spacing:0.15em; text-transform:uppercase;">Fotografie</td>
              <td style="padding:6px 0;">${b.photography ? "Ja" : "Nein"}</td></tr>
          <tr><td style="padding:6px 0; color:var(--text-muted); font-size:0.75rem; letter-spacing:0.15em; text-transform:uppercase;">Eingegangen</td>
              <td style="padding:6px 0;">${fmtDateTime(b.createdAt)}</td></tr>
          ${b.updatedAt ? `<tr><td style="padding:6px 0; color:var(--text-muted); font-size:0.75rem; letter-spacing:0.15em; text-transform:uppercase;">Geändert</td>
              <td style="padding:6px 0;">${fmtDateTime(b.updatedAt)}</td></tr>` : ""}
          <tr><td style="padding:6px 0; color:var(--text-muted); font-size:0.75rem; letter-spacing:0.15em; text-transform:uppercase;">Referenz</td>
              <td style="padding:6px 0; font-family:monospace; font-size:0.8rem; color:var(--text-muted);">${b.id}</td></tr>
        </table>
      </div>
      ${
        b.message
          ? `<div style="background:rgba(168, 85, 247, 0.05); border-left:2px solid var(--neon-purple); padding:1rem 1.25rem; border-radius:8px; margin-bottom:1.25rem;">
              <div style="font-size:0.7rem; letter-spacing:0.2em; text-transform:uppercase; color:var(--text-muted); font-weight:600; margin-bottom:0.5rem;">Nachricht des Kunden</div>
              <div style="white-space:pre-wrap; line-height:1.5;">${escapeHtml(b.message)}</div>
            </div>`
          : ""
      }
    `;
    document.getElementById("editFromDetail").dataset.id = b.id;
    detailModal.classList.add("open");
  }

  document.getElementById("closeDetail").addEventListener("click", () =>
    detailModal.classList.remove("open")
  );
  detailModal.addEventListener("click", (e) => {
    if (e.target === detailModal) detailModal.classList.remove("open");
  });
  document.getElementById("editFromDetail").addEventListener("click", () => {
    const id = document.getElementById("editFromDetail").dataset.id;
    const b = bookings.find((x) => x.id === id);
    if (b) {
      detailModal.classList.remove("open");
      openEditModal(b);
    }
  });

  // ---------- Edit Modal ----------
  const editModal = document.getElementById("editModal");
  const editForm = document.getElementById("editForm");

  function openEditModal(b) {
    document.getElementById("editId").value = b.id;
    document.getElementById("editName").value = b.name || "";
    document.getElementById("editEmail").value = b.email || "";
    document.getElementById("editDate").value = b.eventDate || "";
    document.getElementById("editLocation").value = b.eventLocation || "";
    document.getElementById("editPackage").value = b.package || "Diamond Lite";
    document.getElementById("editStatus").value = b.status || "offen";
    document.getElementById("editPhoto").checked = !!b.photography;
    document.getElementById("editMessage").value = b.message || "";
    editModal.classList.add("open");
  }

  function closeEditModal() {
    editModal.classList.remove("open");
  }

  document.getElementById("closeEdit").addEventListener("click", closeEditModal);
  editModal.addEventListener("click", (e) => {
    if (e.target === editModal) closeEditModal();
  });

  editForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("editId").value;
    const data = {
      name: document.getElementById("editName").value.trim(),
      email: document.getElementById("editEmail").value.trim(),
      eventDate: document.getElementById("editDate").value,
      eventLocation: document.getElementById("editLocation").value.trim(),
      package: document.getElementById("editPackage").value,
      status: document.getElementById("editStatus").value,
      photography: document.getElementById("editPhoto").checked,
      message: document.getElementById("editMessage").value.trim(),
    };
    try {
      const res = await fetch(`/api/bookings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Update failed");
      const json = await res.json();
      const idx = bookings.findIndex((x) => x.id === id);
      if (idx >= 0) bookings[idx] = json.booking;
      closeEditModal();
      render();
      window.showToast("Buchung aktualisiert", "success");
    } catch (err) {
      window.showToast("Fehler: " + err.message, "error");
    }
  });

  // ---------- Filter Tabs ----------
  document.querySelectorAll(".admin-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document
        .querySelectorAll(".admin-tab")
        .forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      currentFilter = tab.dataset.filter;
      renderTable();
    });
  });

  // ---------- View Toggle ----------
  document.querySelectorAll("#viewToggle button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll("#viewToggle button")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentView = btn.dataset.view;
      document.getElementById("listView").style.display =
        currentView === "list" ? "" : "none";
      document.getElementById("calendarView").style.display =
        currentView === "calendar" ? "" : "none";
      if (currentView === "calendar") renderCalendar();
    });
  });

  // ---------- Calendar ----------
  function renderCalendar() {
    const grid = document.getElementById("calGrid");
    const monthLabel = document.getElementById("calMonthLabel");
    const monthNames = [
      "Januar", "Februar", "März", "April", "Mai", "Juni",
      "Juli", "August", "September", "Oktober", "November", "Dezember"
    ];
    monthLabel.textContent = `${monthNames[calMonth]} ${calYear}`;

    const firstDay = new Date(calYear, calMonth, 1);
    const lastDay = new Date(calYear, calMonth + 1, 0);
    const daysInMonth = lastDay.getDate();
    // Monday-first offset (0..6 where 0 = Mon)
    let leading = (firstDay.getDay() + 6) % 7;

    const weekdays = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

    let html = weekdays.map((w) => `<div class="weekday">${w}</div>`).join("");

    for (let i = 0; i < leading; i++) {
      html += `<div class="calendar-day empty"></div>`;
    }

    const todayStr = new Date().toISOString().split("T")[0];

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr =
        calYear +
        "-" +
        String(calMonth + 1).padStart(2, "0") +
        "-" +
        String(d).padStart(2, "0");

      const events = bookings.filter((b) => b.eventDate === dateStr);
      const hasEvents = events.length > 0;
      const isToday = dateStr === todayStr;

      const dotsHtml = events
        .slice(0, 6)
        .map((e) => `<span class="dot-mini ${e.status}"></span>`)
        .join("");

      html += `
        <div class="calendar-day ${hasEvents ? "has-event" : ""} ${
        isToday ? "today" : ""
      }" ${hasEvents ? `data-date="${dateStr}"` : ""}>
          <div>${d}</div>
          <div class="dots">${dotsHtml}</div>
        </div>`;
    }

    grid.innerHTML = html;

    grid.querySelectorAll(".calendar-day.has-event").forEach((cell) => {
      cell.addEventListener("click", () => openDayModal(cell.dataset.date));
    });
  }

  document.getElementById("calPrev").addEventListener("click", () => {
    calMonth--;
    if (calMonth < 0) {
      calMonth = 11;
      calYear--;
    }
    renderCalendar();
  });

  document.getElementById("calNext").addEventListener("click", () => {
    calMonth++;
    if (calMonth > 11) {
      calMonth = 0;
      calYear++;
    }
    renderCalendar();
  });

  document.getElementById("calToday").addEventListener("click", () => {
    calYear = new Date().getFullYear();
    calMonth = new Date().getMonth();
    renderCalendar();
  });

  // ---------- Day Modal ----------
  const dayModal = document.getElementById("dayModal");
  document.getElementById("closeDay").addEventListener("click", () =>
    dayModal.classList.remove("open")
  );
  dayModal.addEventListener("click", (e) => {
    if (e.target === dayModal) dayModal.classList.remove("open");
  });

  function openDayModal(dateStr) {
    const events = bookings.filter((b) => b.eventDate === dateStr);
    document.getElementById("dayTitle").textContent =
      "Termine — " + fmtDate(dateStr);
    const content = document.getElementById("dayContent");
    if (!events.length) {
      content.innerHTML = `<p style="color:var(--text-muted);">Keine Termine.</p>`;
    } else {
      content.innerHTML = events
        .map(
          (e) => `
          <div style="padding: 1rem 0; border-bottom: 1px solid var(--line);">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:1rem; flex-wrap:wrap;">
              <div>
                <div style="font-weight:600;">${escapeHtml(e.name)}</div>
                <div style="color: var(--text-muted); font-size: 0.85rem;">${escapeHtml(
                  e.eventLocation || "—"
                )} · ${escapeHtml(e.package)}</div>
              </div>
              ${statusPill(e.status)}
            </div>
          </div>`
        )
        .join("");
    }
    dayModal.classList.add("open");
  }

  // ---------- Render orchestrator ----------
  function render() {
    renderStats();
    renderTable();
    if (currentView === "calendar") renderCalendar();
  }

  // ---------- Email Modal & Presets ----------
  let presets = [];

  async function loadPresets() {
    try {
      const res = await fetch("/api/presets");
      if (!res.ok) return;
      presets = await res.json();
      refreshPresetSelect();
      renderPresetsList();
    } catch (err) {
      console.error("Presets load failed:", err);
    }
  }

  function refreshPresetSelect() {
    const sel = document.getElementById("presetSelect");
    sel.innerHTML =
      '<option value="">— Leere Nachricht —</option>' +
      presets
        .map(
          (p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`
        )
        .join("");
  }

  // ---- Email modal ----
  const emailModal = document.getElementById("emailModal");
  const emailForm = document.getElementById("emailForm");
  const emailStatus = document.getElementById("emailStatus");

  function openEmailModal(b) {
    document.getElementById("emailBookingId").value = b.id;
    document.getElementById("emailTo").innerHTML = `
      <strong>${escapeHtml(b.name)}</strong>
      <span style="color: var(--text-muted);"> · ${escapeHtml(b.email)}</span>
      <div style="font-size:0.8rem; color:var(--text-muted); margin-top:4px;">
        ${escapeHtml(b.package)} · ${fmtDate(b.eventDate)} · ${escapeHtml(b.eventLocation || "—")}
      </div>
    `;
    document.getElementById("emailSubject").value = "";
    document.getElementById("emailBody").value = "";
    document.getElementById("presetSelect").value = "";
    emailStatus.className = "form-status";
    emailStatus.textContent = "";
    emailModal.classList.add("open");
  }

  document.getElementById("closeEmail").addEventListener("click", () =>
    emailModal.classList.remove("open")
  );
  emailModal.addEventListener("click", (e) => {
    if (e.target === emailModal) emailModal.classList.remove("open");
  });

  // Load preset into editor when selected
  document.getElementById("presetSelect").addEventListener("change", (e) => {
    const id = e.target.value;
    if (!id) return;
    const p = presets.find((x) => x.id === id);
    if (!p) return;
    document.getElementById("emailSubject").value = p.subject || "";
    document.getElementById("emailBody").value = p.body || "";
  });

  // Send email
  emailForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("emailBookingId").value;
    const subject = document.getElementById("emailSubject").value.trim();
    const body = document.getElementById("emailBody").value.trim();
    if (!subject || !body) {
      emailStatus.textContent = "Betreff und Text sind Pflichtfelder.";
      emailStatus.className = "form-status error";
      return;
    }
    const btn = document.getElementById("sendEmailBtn");
    btn.disabled = true;
    btn.textContent = "Senden...";
    emailStatus.className = "form-status";
    emailStatus.textContent = "";
    try {
      const res = await fetch(`/api/bookings/${id}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Versand fehlgeschlagen");
      emailModal.classList.remove("open");
      window.showToast("E-Mail gesendet", "success");
    } catch (err) {
      emailStatus.textContent = err.message;
      emailStatus.className = "form-status error";
    } finally {
      btn.disabled = false;
      btn.textContent = "Senden";
    }
  });

  // Save current draft as preset
  document.getElementById("saveAsPreset").addEventListener("click", () => {
    const subject = document.getElementById("emailSubject").value.trim();
    const body = document.getElementById("emailBody").value.trim();
    if (!subject || !body) {
      emailStatus.textContent = "Betreff und Text ausfüllen, bevor du speicherst.";
      emailStatus.className = "form-status error";
      return;
    }
    openPresetEdit({ name: "", subject, body });
  });

  // ---- Presets management ----
  const presetsModal = document.getElementById("presetsModal");
  const presetEditModal = document.getElementById("presetEditModal");
  const presetEditForm = document.getElementById("presetEditForm");

  document.getElementById("openPresetsBtn").addEventListener("click", () => {
    renderPresetsList();
    presetsModal.classList.add("open");
  });

  document.getElementById("closePresets").addEventListener("click", () =>
    presetsModal.classList.remove("open")
  );
  presetsModal.addEventListener("click", (e) => {
    if (e.target === presetsModal) presetsModal.classList.remove("open");
  });

  document.getElementById("newPresetBtn").addEventListener("click", () => {
    openPresetEdit({ name: "", subject: "", body: "" });
  });

  function renderPresetsList() {
    const container = document.getElementById("presetsList");
    if (!presets.length) {
      container.innerHTML = `
        <div style="text-align:center; padding:2rem 1rem; color:var(--text-muted);">
          <p>Noch keine Vorlagen.</p>
          <p style="font-size:0.85rem; margin-top:0.5rem;">Klicke auf "+ Neue Vorlage" um anzufangen.</p>
        </div>`;
      return;
    }
    container.innerHTML = presets
      .map(
        (p) => `
        <div style="background:rgba(255,255,255,0.02); border:1px solid var(--line); border-radius:12px; padding:1rem 1.25rem; margin-bottom:0.6rem; display:flex; justify-content:space-between; align-items:center; gap:1rem; flex-wrap:wrap;">
          <div style="flex:1; min-width:0;">
            <div style="font-weight:600;">${escapeHtml(p.name)}</div>
            <div style="font-size:0.85rem; color:var(--text-muted); margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(p.subject)}</div>
          </div>
          <div class="row-actions">
            <button data-preset-action="edit" data-id="${p.id}">Bearbeiten</button>
            <button class="danger" data-preset-action="delete" data-id="${p.id}">Löschen</button>
          </div>
        </div>`
      )
      .join("");

    container.querySelectorAll("[data-preset-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const action = btn.dataset.presetAction;
        const id = btn.dataset.id;
        const p = presets.find((x) => x.id === id);
        if (action === "edit") openPresetEdit(p);
        else if (action === "delete") deletePreset(p);
      });
    });
  }

  function openPresetEdit(p) {
    document.getElementById("presetEditTitle").textContent = p.id
      ? "Vorlage bearbeiten"
      : "Neue Vorlage";
    document.getElementById("presetEditId").value = p.id || "";
    document.getElementById("presetName").value = p.name || "";
    document.getElementById("presetSubject").value = p.subject || "";
    document.getElementById("presetBody").value = p.body || "";
    presetEditModal.classList.add("open");
  }

  document.getElementById("closePresetEdit").addEventListener("click", () =>
    presetEditModal.classList.remove("open")
  );
  presetEditModal.addEventListener("click", (e) => {
    if (e.target === presetEditModal) presetEditModal.classList.remove("open");
  });

  presetEditForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("presetEditId").value;
    const data = {
      name: document.getElementById("presetName").value.trim(),
      subject: document.getElementById("presetSubject").value.trim(),
      body: document.getElementById("presetBody").value,
    };
    if (!data.name || !data.subject || !data.body) {
      window.showToast("Bitte alle Felder ausfüllen.", "error");
      return;
    }
    try {
      const url = id ? `/api/presets/${id}` : "/api/presets";
      const method = id ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Speichern fehlgeschlagen");
      await loadPresets();
      presetEditModal.classList.remove("open");
      window.showToast("Vorlage gespeichert", "success");
    } catch (err) {
      window.showToast("Fehler: " + err.message, "error");
    }
  });

  async function deletePreset(p) {
    if (!confirm(`Vorlage "${p.name}" wirklich löschen?`)) return;
    try {
      const res = await fetch(`/api/presets/${p.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Löschen fehlgeschlagen");
      await loadPresets();
      window.showToast("Vorlage gelöscht", "success");
    } catch (err) {
      window.showToast("Fehler: " + err.message, "error");
    }
  }

  // ---------- Auto-Templates Editor ----------
  let templates = [];
  const templatesModal = document.getElementById("templatesModal");
  const templateEditModal = document.getElementById("templateEditModal");

  async function loadTemplates() {
    try {
      const res = await fetch("/api/templates");
      if (!res.ok) return;
      templates = await res.json();
      renderTemplatesList();
    } catch (err) {
      console.error("Templates load failed:", err);
    }
  }

  function renderTemplatesList() {
    const container = document.getElementById("templatesList");
    if (!templates.length) {
      container.innerHTML = `<div class="empty-state"><p>Keine Templates verfügbar.</p></div>`;
      return;
    }
    container.innerHTML = templates
      .map(
        (t) => `
        <div style="background:rgba(255,255,255,0.02); border:1px solid var(--line); border-radius:12px; padding:1rem 1.25rem; margin-bottom:0.6rem;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:1rem; flex-wrap:wrap;">
            <div style="flex:1; min-width:0;">
              <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap; margin-bottom:4px;">
                <strong>${escapeHtml(t.label)}</strong>
                ${
                  t.isCustomized
                    ? '<span style="font-size:0.65rem; letter-spacing:0.15em; text-transform:uppercase; padding:2px 8px; border-radius:50px; background:rgba(0, 240, 255, 0.1); color:var(--neon-cyan); font-weight:600;">Angepasst</span>'
                    : '<span style="font-size:0.65rem; letter-spacing:0.15em; text-transform:uppercase; padding:2px 8px; border-radius:50px; background:rgba(255,255,255,0.05); color:var(--text-muted); font-weight:600;">Standard</span>'
                }
              </div>
              <div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:6px;">${escapeHtml(t.description)}</div>
              <div style="font-size:0.85rem; color:var(--text); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"><em>"${escapeHtml(t.subject)}"</em></div>
            </div>
            <div class="row-actions">
              <button data-template-action="edit" data-key="${t.key}">Bearbeiten</button>
            </div>
          </div>
        </div>`
      )
      .join("");

    container.querySelectorAll("[data-template-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.key;
        const t = templates.find((x) => x.key === key);
        if (t) openTemplateEdit(t);
      });
    });
  }

  function openTemplateEdit(t) {
    document.getElementById("templateEditTitle").textContent = t.label;
    document.getElementById("templateEditDesc").textContent = t.description;
    document.getElementById("templateEditKey").value = t.key;
    document.getElementById("templateSubject").value = t.subject;
    document.getElementById("templateBody").value = t.body;
    document.getElementById("templatePreview").style.display = "none";
    templateEditModal.classList.add("open");
  }

  document.getElementById("openTemplatesBtn").addEventListener("click", () => {
    loadTemplates().then(() => templatesModal.classList.add("open"));
  });

  document.getElementById("closeTemplates").addEventListener("click", () =>
    templatesModal.classList.remove("open")
  );
  templatesModal.addEventListener("click", (e) => {
    if (e.target === templatesModal) templatesModal.classList.remove("open");
  });

  document.getElementById("closeTemplateEdit").addEventListener("click", () =>
    templateEditModal.classList.remove("open")
  );
  templateEditModal.addEventListener("click", (e) => {
    if (e.target === templateEditModal) templateEditModal.classList.remove("open");
  });

  // Save template
  document.getElementById("templateEditForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const key = document.getElementById("templateEditKey").value;
    const data = {
      subject: document.getElementById("templateSubject").value.trim(),
      body: document.getElementById("templateBody").value,
    };
    if (!data.subject || !data.body) {
      window.showToast("Betreff und Text ausfüllen.", "error");
      return;
    }
    try {
      const res = await fetch(`/api/templates/${key}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Speichern fehlgeschlagen");
      await loadTemplates();
      templateEditModal.classList.remove("open");
      window.showToast("Auto-Nachricht gespeichert", "success");
    } catch (err) {
      window.showToast("Fehler: " + err.message, "error");
    }
  });

  // Reset to default
  document.getElementById("resetTemplateBtn").addEventListener("click", async () => {
    if (!confirm("Diese Nachricht wirklich auf den Standardtext zurücksetzen?")) return;
    const key = document.getElementById("templateEditKey").value;
    try {
      const res = await fetch(`/api/templates/${key}/reset`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Zurücksetzen fehlgeschlagen");
      // Reload and reopen with defaults
      await loadTemplates();
      const t = templates.find((x) => x.key === key);
      if (t) openTemplateEdit(t);
      window.showToast("Auf Standard zurückgesetzt", "success");
    } catch (err) {
      window.showToast("Fehler: " + err.message, "error");
    }
  });

  // Preview
  document.getElementById("previewTemplateBtn").addEventListener("click", async () => {
    const key = document.getElementById("templateEditKey").value;
    const data = {
      subject: document.getElementById("templateSubject").value,
      body: document.getElementById("templateBody").value,
    };
    try {
      const res = await fetch(`/api/templates/${key}/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Vorschau fehlgeschlagen");
      document.getElementById("templatePreviewSubject").textContent = json.subject;
      const frame = document.getElementById("templatePreviewFrame");
      frame.srcdoc = json.html;
      document.getElementById("templatePreview").style.display = "block";
      // Scroll preview into view
      setTimeout(
        () =>
          document
            .getElementById("templatePreview")
            .scrollIntoView({ behavior: "smooth", block: "nearest" }),
        50
      );
    } catch (err) {
      window.showToast("Fehler: " + err.message, "error");
    }
  });

  // ---------- Init ----------
  loadBookings();
  loadPresets();
})();
