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
    return `
      <tr>
        <td data-label="Kunde">
          <div class="name">${escapeHtml(b.name)}</div>
          <div class="email">${escapeHtml(b.email)}</div>
        </td>
        <td data-label="Event">
          <div>${fmtDate(b.eventDate)}</div>
          <div class="email">${escapeHtml(b.eventLocation || "—")}</div>
        </td>
        <td data-label="Paket">
          <div>${escapeHtml(b.package)}</div>
          ${b.photography ? '<div class="email">+ Fotografie</div>' : ""}
        </td>
        <td data-label="Status">${statusPill(b.status)}</td>
        <td data-label="Aktionen" style="text-align:right;">
          <div class="row-actions" style="justify-content:flex-end;">
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

  // ---------- Init ----------
  loadBookings();
})();
