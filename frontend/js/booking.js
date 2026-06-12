/**
 * Booking page — service toggle + form submission
 */

(function () {
  const params = new URLSearchParams(window.location.search);

  // ── Service Toggle ──────────────────────────────────────────
  const toggle = document.getElementById("serviceToggle");
  const serviceTypeInput = document.getElementById("serviceType");
  const djGroup = document.getElementById("djPackageGroup");
  const photoGroup = document.getElementById("photoPackageGroup");
  const djSelect = document.getElementById("package");
  const photoSelect = document.getElementById("photoPackage");

  function applyService(svc) {
    serviceTypeInput.value = svc;
    document.querySelectorAll(".svc-btn").forEach((b) =>
      b.classList.toggle("active", b.dataset.service === svc)
    );
    if (svc === "dj") {
      djGroup.style.display = "";
      photoGroup.style.display = "none";
      djSelect.required = true;
      photoSelect.required = false;
    } else if (svc === "fotografie") {
      djGroup.style.display = "none";
      photoGroup.style.display = "";
      djSelect.required = false;
      photoSelect.required = true;
    } else {
      // beides
      djGroup.style.display = "";
      photoGroup.style.display = "";
      djSelect.required = true;
      photoSelect.required = true;
    }
  }

  toggle.addEventListener("click", (e) => {
    const btn = e.target.closest(".svc-btn");
    if (btn) applyService(btn.dataset.service);
  });

  // Pre-select from URL ?service=fotografie / ?service=dj / ?service=beides
  const svcParam = params.get("service");
  if (svcParam && ["dj", "fotografie", "beides"].includes(svcParam)) {
    applyService(svcParam);
  } else {
    applyService("dj");
  }

  // Pre-fill package from ?package=... — auto-detect DJ vs Foto
  const pkgParam = params.get("package");
  if (pkgParam) {
    const djOpt = djSelect && Array.from(djSelect.options).find((o) => o.value === pkgParam);
    const photoOpt = photoSelect && Array.from(photoSelect.options).find((o) => o.value === pkgParam);
    if (photoOpt && !djOpt) {
      // It's a photo package — switch to fotografie mode
      applyService("fotografie");
      photoSelect.value = pkgParam;
    } else if (djOpt) {
      djSelect.value = pkgParam;
    }
  }

  // Pre-fill from configurator
  const configMessage = params.get("configMessage");
  if (configMessage) {
    const messageField = document.getElementById("message");
    if (messageField) messageField.value = configMessage + "\n\n";
    if (/Fotografie/i.test(configMessage)) applyService("beides");
  }

  // Min date = today
  const dateInput = document.getElementById("eventDate");
  if (dateInput) {
    dateInput.min = new Date().toISOString().split("T")[0];
  }

  // ── Form Submission ────────────────────────────────────────
  const form = document.getElementById("bookingForm");
  const status = document.getElementById("formStatus");
  const submitBtn = document.getElementById("submitBtn");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const svc = serviceTypeInput.value;
    const djPkg = djSelect.value;
    const photoPkg = photoSelect.value;

    const data = {
      name: form.name.value.trim(),
      email: form.email.value.trim(),
      eventDate: dateInput.value,
      eventLocation: form.eventLocation.value.trim(),
      serviceType: svc,
      message: form.message.value.trim(),
    };

    // Determine package value
    if (svc === "dj") {
      data.package = djPkg;
    } else if (svc === "fotografie") {
      data.package = photoPkg;
    } else {
      // beides — combine or use DJ package as primary
      data.package = djPkg;
      data.photoPackage = photoPkg;
    }

    if (!data.name || !data.email || !data.eventDate || !data.eventLocation) {
      status.textContent = "Bitte fülle alle Pflichtfelder (*) aus.";
      status.className = "form-status error";
      return;
    }
    if ((svc === "dj" || svc === "beides") && !djPkg) {
      status.textContent = "Bitte wähle ein DJ-Paket aus.";
      status.className = "form-status error";
      return;
    }
    if ((svc === "fotografie" || svc === "beides") && !photoPkg) {
      status.textContent = "Bitte wähle ein Foto-Paket aus.";
      status.className = "form-status error";
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Wird gesendet...";
    status.textContent = "";
    status.className = "form-status";

    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Anfrage fehlgeschlagen");
      window.location.href = "/confirmation.html?id=" + encodeURIComponent(json.id);
    } catch (err) {
      status.textContent = "Fehler: " + err.message;
      status.className = "form-status error";
      submitBtn.disabled = false;
      submitBtn.textContent = "Anfrage senden";
    }
  });
})();
