/**
 * Smart Package Configurator
 * Live price calculation with smooth animation
 */

(function () {
  const SETUPS = {
    basic:    { label: "Basis (DJ + Sound)",       price: 349 },
    extended: { label: "Sound + Lichtshow",        price: 549 },
    complete: { label: "Komplett-Setup",           price: 749 },
  };

  const DURATIONS = {
    "4":    { label: "4 Stunden",  modifier: 0   },
    "6":    { label: "6 Stunden",  modifier: 150 },
    "8":    { label: "8 Stunden",  modifier: 300 },
    "open": { label: "Open End",   modifier: 500 },
  };

  const ADDONS = {
    foto:         { label: "Fotografie",                price: 250 },
    moderation:   { label: "Moderation",                price: 100 },
    premiumLight: { label: "Premium Licht-Upgrade",     price: 180 },
  };

  const OCCASIONS = {
    geburtstag:  "Geburtstag",
    hochzeit:    "Hochzeit",
    firmenevent: "Firmenevent",
    club:        "Club / Festival",
    sonstiges:   "Sonstiges",
  };

  const state = {
    occasion: null,
    setup: "basic",
    duration: "4",
    addons: new Set(),
  };

  let currentDisplayPrice = 0;
  const formatter = new Intl.NumberFormat("de-DE");

  // ---------- Calculation ----------
  function calculate() {
    let total = SETUPS[state.setup].price + DURATIONS[state.duration].modifier;
    state.addons.forEach((id) => {
      total += ADDONS[id].price;
    });
    return total;
  }

  function buildBreakdown() {
    const items = [
      { label: SETUPS[state.setup].label, price: SETUPS[state.setup].price },
    ];
    if (DURATIONS[state.duration].modifier > 0) {
      items.push({
        label: DURATIONS[state.duration].label + " Erweiterung",
        price: DURATIONS[state.duration].modifier,
      });
    }
    state.addons.forEach((id) => {
      items.push({ label: ADDONS[id].label, price: ADDONS[id].price });
    });
    return items;
  }

  // ---------- Animation ----------
  function animatePrice(to) {
    const el = document.getElementById("configPrice");
    if (!el) return;
    const from = currentDisplayPrice;
    const duration = 450;
    const start = performance.now();

    function tick(now) {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const value = Math.round(from + (to - from) * eased);
      el.textContent = formatter.format(value);
      if (t < 1) requestAnimationFrame(tick);
      else el.textContent = formatter.format(to);
    }
    requestAnimationFrame(tick);
    currentDisplayPrice = to;
  }

  // ---------- Render ----------
  function renderBreakdown() {
    const container = document.getElementById("configBreakdown");
    if (!container) return;
    const items = buildBreakdown();
    container.innerHTML = items
      .map(
        (item) => `
          <div class="breakdown-line">
            <span class="b-label">${escapeHtml(item.label)}</span>
            <span class="b-price">${formatter.format(item.price)} €</span>
          </div>`
      )
      .join("");
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c])
    );
  }

  function getDiamondTier() {
    if (state.setup === "complete") return "Diamond Exclusive";
    if (state.setup === "extended") return "Diamond Premium";
    return "Diamond Lite";
  }

  function buildConfigSummary(total) {
    const lines = [];
    lines.push("Mein konfiguriertes Paket:");
    lines.push("• Setup: " + SETUPS[state.setup].label);
    lines.push("• Dauer: " + DURATIONS[state.duration].label);
    if (state.addons.size) {
      const adds = [...state.addons].map((a) => ADDONS[a].label).join(", ");
      lines.push("• Extras: " + adds);
    }
    if (state.occasion) {
      lines.push("• Anlass: " + OCCASIONS[state.occasion]);
    }
    lines.push("");
    lines.push("Geschätzter Gesamtpreis: " + formatter.format(total) + " €");
    return lines.join("\n");
  }

  function updateBookingLink(total) {
    const link = document.getElementById("configBook");
    if (!link) return;
    const params = new URLSearchParams();
    params.set("package", getDiamondTier());
    params.set("configMessage", buildConfigSummary(total));
    if (state.occasion) {
      params.set("occasion", OCCASIONS[state.occasion]);
    }
    link.href = "/booking.html?" + params.toString();
  }

  // ---------- Refresh orchestrator ----------
  function refresh() {
    const total = calculate();
    animatePrice(total);
    renderBreakdown();
    updateBookingLink(total);
  }

  // ---------- Event handlers ----------
  function setupGroupHandler(selector, key, allowDeselect) {
    document.querySelectorAll(selector + " button").forEach((btn) => {
      btn.addEventListener("click", () => {
        const wasSelected = btn.classList.contains("selected");
        document
          .querySelectorAll(selector + " button")
          .forEach((b) => b.classList.remove("selected"));
        if (!(wasSelected && allowDeselect)) {
          btn.classList.add("selected");
          state[key] = btn.dataset.value;
        } else {
          state[key] = null;
        }
        refresh();
      });
    });
  }

  function setupAddonHandlers() {
    document.querySelectorAll(".config-toggle").forEach((label) => {
      const input = label.querySelector("input");
      if (!input) return;
      const sync = () => {
        const id = input.dataset.addon;
        if (input.checked) {
          state.addons.add(id);
          label.classList.add("checked");
        } else {
          state.addons.delete(id);
          label.classList.remove("checked");
        }
        refresh();
      };
      input.addEventListener("change", sync);
    });
  }

  // ---------- Init ----------
  function init() {
    if (!document.getElementById("configPrice")) return;

    setupGroupHandler('.config-cards[data-key="setup"]', "setup", false);
    setupGroupHandler('.config-buttons[data-key="duration"]', "duration", false);
    setupGroupHandler('.config-buttons[data-key="occasion"]', "occasion", true);
    setupAddonHandlers();

    // Mark defaults visually
    const setupBtn = document.querySelector(
      '.config-cards[data-key="setup"] [data-value="basic"]'
    );
    if (setupBtn) setupBtn.classList.add("selected");
    const durBtn = document.querySelector(
      '.config-buttons[data-key="duration"] [data-value="4"]'
    );
    if (durBtn) durBtn.classList.add("selected");

    // Initial render
    refresh();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
