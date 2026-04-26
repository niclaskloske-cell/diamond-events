/**
 * Booking page — submits to /api/bookings
 */

(function () {
  // Pre-select package from ?package= query param
  const params = new URLSearchParams(window.location.search);
  const pkgParam = params.get("package");
  if (pkgParam) {
    const sel = document.getElementById("package");
    if (sel) {
      const opt = Array.from(sel.options).find((o) => o.value === pkgParam);
      if (opt) sel.value = pkgParam;
    }
  }

  // Min date = today
  const dateInput = document.getElementById("eventDate");
  if (dateInput) {
    const today = new Date().toISOString().split("T")[0];
    dateInput.min = today;
  }

  const form = document.getElementById("bookingForm");
  const status = document.getElementById("formStatus");
  const submitBtn = document.getElementById("submitBtn");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const data = {
      name: form.name.value.trim(),
      email: form.email.value.trim(),
      eventDate: form.eventDate.value,
      eventLocation: form.eventLocation.value.trim(),
      package: form.package.value,
      photography: form.photography.checked,
      message: form.message.value.trim(),
    };

    // Quick validation
    if (
      !data.name ||
      !data.email ||
      !data.eventDate ||
      !data.eventLocation ||
      !data.package
    ) {
      status.textContent = "Bitte fülle alle Pflichtfelder (*) aus.";
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

      if (!res.ok) {
        throw new Error(json.error || "Anfrage fehlgeschlagen");
      }

      // Redirect to confirmation
      window.location.href =
        "/confirmation.html?id=" + encodeURIComponent(json.id);
    } catch (err) {
      status.textContent = "Fehler: " + err.message;
      status.className = "form-status error";
      submitBtn.disabled = false;
      submitBtn.textContent = "Anfrage senden";
    }
  });
})();
