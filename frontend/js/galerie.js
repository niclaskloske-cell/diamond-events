/**
 * Public Gallery — password gate + image viewer + downloads
 */

(function () {
  const root = document.getElementById("galleryRoot");
  const params = new URLSearchParams(location.search);
  const galleryId = params.get("id");

  if (!galleryId) {
    root.innerHTML = `
      <div class="pw-gate">
        <h2>Galerie</h2>
        <p>Bitte verwende den Link, den du von Diamond Events bekommen hast.</p>
        <a href="/" class="btn btn-primary">Zur Startseite</a>
      </div>`;
    return;
  }

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c])
    );
  }

  async function loadInfo() {
    try {
      const res = await fetch(`/api/galleries/${galleryId}/info`);
      if (res.status === 404) {
        root.innerHTML = `
          <div class="pw-gate">
            <h2>Galerie nicht gefunden</h2>
            <p>Bitte prüfe deinen Link oder kontaktiere uns.</p>
            <a href="/" class="btn btn-primary">Zur Startseite</a>
          </div>`;
        return;
      }
      const info = await res.json();
      // Try loading without password first
      const imgRes = await fetch(`/api/galleries/${galleryId}/images`);
      if (imgRes.status === 401) {
        renderPasswordGate(info);
      } else if (imgRes.ok) {
        const data = await imgRes.json();
        renderGallery(data);
      } else {
        showError("Galerie konnte nicht geladen werden.");
      }
    } catch (err) {
      showError(err.message);
    }
  }

  function showError(msg) {
    root.innerHTML = `
      <div class="pw-gate">
        <h2>Fehler</h2>
        <p>${escapeHtml(msg)}</p>
      </div>`;
  }

  function renderPasswordGate(info) {
    root.innerHTML = `
      <div class="pw-gate">
        <h2>${escapeHtml(info.name)}</h2>
        <p>${escapeHtml(info.description || "Diese Galerie ist passwortgeschützt.")}</p>
        <form id="pwForm">
          <div class="form-group">
            <label for="pwInput" style="text-align:center;">Passwort</label>
            <input type="password" id="pwInput" required autofocus placeholder="Passwort eingeben" />
          </div>
          <button type="submit" class="btn btn-primary" style="width:100%;">Galerie öffnen</button>
          <div class="form-status" id="pwStatus" style="margin-top:0.75rem;"></div>
        </form>
      </div>`;
    document.getElementById("pwForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const pw = document.getElementById("pwInput").value;
      const status = document.getElementById("pwStatus");
      status.textContent = "";
      status.className = "form-status";
      try {
        const res = await fetch(`/api/galleries/${galleryId}/access`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: pw }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Falsches Passwort");
        // Reload to show gallery
        loadInfo();
      } catch (err) {
        status.textContent = err.message;
        status.className = "form-status error";
      }
    });
  }

  function renderGallery(data) {
    const fmtDate = (iso) => {
      if (!iso) return "";
      const d = new Date(iso);
      if (isNaN(d.getTime())) return "";
      return d.toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" });
    };

    if (!data.images || !data.images.length) {
      root.innerHTML = `
        <div class="gallery-info">
          <h1>${escapeHtml(data.name)}</h1>
          ${data.description ? `<p>${escapeHtml(data.description)}</p>` : ""}
        </div>
        <div class="empty-gallery">
          <p>Hier landen bald die Bilder von deinem Event.</p>
        </div>`;
      return;
    }

    const tilesHtml = data.images
      .map(
        (filename, idx) => `
          <div class="gallery-tile" data-index="${idx}">
            <img src="/api/galleries/${galleryId}/img/${encodeURIComponent(filename)}" alt="" loading="lazy" />
            <div class="tile-actions">
              <a href="/api/galleries/${galleryId}/img/${encodeURIComponent(filename)}" download="${escapeHtml(filename)}" class="tile-action" title="Original herunterladen" onclick="event.stopPropagation()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
              </a>
            </div>
          </div>`
      )
      .join("");

    root.innerHTML = `
      <div class="gallery-info">
        <h1>${escapeHtml(data.name)}</h1>
        ${data.description ? `<p>${escapeHtml(data.description)}</p>` : ""}
        ${data.eventDate ? `<div class="gallery-meta">${fmtDate(data.eventDate)} · ${data.images.length} Bilder</div>` : `<div class="gallery-meta">${data.images.length} Bilder</div>`}
      </div>
      <div class="gallery-actions">
        <a href="/api/galleries/${galleryId}/download" class="btn btn-primary">Alle Bilder als ZIP herunterladen</a>
      </div>
      <div class="gallery-images" id="galleryImages">${tilesHtml}</div>`;

    // Lightbox handlers
    const lb = document.getElementById("lightbox");
    const lbImg = document.getElementById("lbImage");
    let currentIndex = 0;
    const filenames = data.images;

    function openLightbox(idx) {
      currentIndex = idx;
      lbImg.src = `/api/galleries/${galleryId}/img/${encodeURIComponent(filenames[idx])}`;
      lb.classList.add("open");
      document.body.style.overflow = "hidden";
    }
    function closeLightbox() {
      lb.classList.remove("open");
      document.body.style.overflow = "";
    }
    function navLightbox(delta) {
      currentIndex = (currentIndex + delta + filenames.length) % filenames.length;
      lbImg.src = `/api/galleries/${galleryId}/img/${encodeURIComponent(filenames[currentIndex])}`;
    }

    document.querySelectorAll(".gallery-tile").forEach((tile) => {
      tile.addEventListener("click", () => openLightbox(parseInt(tile.dataset.index, 10)));
    });
    document.getElementById("lbClose").addEventListener("click", closeLightbox);
    document.getElementById("lbPrev").addEventListener("click", () => navLightbox(-1));
    document.getElementById("lbNext").addEventListener("click", () => navLightbox(1));
    lb.addEventListener("click", (e) => { if (e.target === lb) closeLightbox(); });
    document.addEventListener("keydown", (e) => {
      if (!lb.classList.contains("open")) return;
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowLeft") navLightbox(-1);
      if (e.key === "ArrowRight") navLightbox(1);
    });
  }

  loadInfo();
})();
