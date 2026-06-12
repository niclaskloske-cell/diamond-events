/**
 * Admin — Gallery Management
 * Create, edit, delete galleries. Upload/delete images.
 */

(function () {
  if (!document.getElementById("galleriesModal")) return;

  let galleries = [];
  let currentGalleryId = null;

  const galleriesModal = document.getElementById("galleriesModal");
  const editModal = document.getElementById("galleryEditModal");

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c])
    );
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    return isNaN(d.getTime())
      ? iso
      : d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  // ---------- Load + Render List ----------
  async function loadGalleries() {
    try {
      const res = await fetch("/api/admin/galleries");
      if (!res.ok) return;
      galleries = await res.json();
      renderGalleriesList();
    } catch (err) {
      console.error("Load galleries failed:", err);
    }
  }

  function renderGalleriesList() {
    const container = document.getElementById("galleriesList");
    if (!galleries.length) {
      container.innerHTML = `
        <div style="text-align: center; padding: 2rem 1rem; color: var(--text-muted);">
          <p>Noch keine Galerien.</p>
          <p style="font-size: 0.85rem; margin-top: 0.5rem;">Klicke auf "+ Neue Galerie" um anzufangen.</p>
        </div>`;
      return;
    }
    container.innerHTML = galleries
      .map(
        (g) => `
        <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--line); border-radius: 12px; padding: 1rem 1.25rem; margin-bottom: 0.6rem;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap;">
            <div style="flex: 1; min-width: 0;">
              <div style="font-weight: 600; margin-bottom: 4px;">${escapeHtml(g.name)}</div>
              <div style="font-size: 0.82rem; color: var(--text-muted); display: flex; gap: 1rem; flex-wrap: wrap;">
                <span>${g.imageCount || 0} Bilder</span>
                ${g.eventDate ? `<span>${fmtDate(g.eventDate)}</span>` : ""}
                <span>Passwort: <code style="background: rgba(255,255,255,0.05); padding: 1px 6px; border-radius: 4px; color: var(--neon-cyan);">${escapeHtml(g.password || "—")}</code></span>
              </div>
            </div>
            <div class="row-actions">
              <button data-gallery-action="manage" data-id="${g.id}">Verwalten</button>
              <button class="danger" data-gallery-action="delete" data-id="${g.id}">Löschen</button>
            </div>
          </div>
        </div>`
      )
      .join("");

    container.querySelectorAll("[data-gallery-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const action = btn.dataset.galleryAction;
        const id = btn.dataset.id;
        const g = galleries.find((x) => x.id === id);
        if (action === "manage") openGalleryEdit(g);
        if (action === "delete") deleteGallery(g);
      });
    });
  }

  // ---------- Open / Close Modals ----------
  document.getElementById("openGalleriesBtn").addEventListener("click", () => {
    loadGalleries().then(() => galleriesModal.classList.add("open"));
  });

  document.getElementById("closeGalleries").addEventListener("click", () => {
    galleriesModal.classList.remove("open");
  });
  galleriesModal.addEventListener("click", (e) => {
    if (e.target === galleriesModal) galleriesModal.classList.remove("open");
  });

  document.getElementById("newGalleryBtn").addEventListener("click", () => {
    openGalleryEdit({ name: "", password: "", eventDate: "", description: "" });
  });

  document.getElementById("closeGalleryEdit").addEventListener("click", () => {
    editModal.classList.remove("open");
  });
  editModal.addEventListener("click", (e) => {
    if (e.target === editModal) editModal.classList.remove("open");
  });

  // ---------- Open Gallery Edit ----------
  function openGalleryEdit(g) {
    currentGalleryId = g.id || null;
    document.getElementById("galleryEditTitle").textContent = g.id ? "Galerie verwalten" : "Neue Galerie";
    document.getElementById("galleryEditId").value = g.id || "";
    document.getElementById("galleryName").value = g.name || "";
    document.getElementById("galleryPassword").value = g.password || "";
    document.getElementById("galleryDate").value = g.eventDate || "";
    document.getElementById("galleryDescription").value = g.description || "";

    const imageManager = document.getElementById("galleryImageManager");
    if (g.id) {
      imageManager.style.display = "block";
      renderShareInfo(g);
      loadGalleryImages(g.id);
    } else {
      imageManager.style.display = "none";
    }
    editModal.classList.add("open");
  }

  function renderShareInfo(g) {
    const url = `${location.origin}/galerie.html?id=${g.id}`;
    document.getElementById("galleryShareInfo").innerHTML = `
      <strong style="color: var(--text);">Kunden-Link:</strong>
      <a href="${url}" target="_blank" style="color: var(--neon-cyan); word-break: break-all; text-decoration: none; border-bottom: 1px solid rgba(0,240,255,0.3);">${url}</a><br />
      <strong style="color: var(--text);">Passwort:</strong>
      <code style="background: rgba(255,255,255,0.05); padding: 1px 6px; border-radius: 4px; color: var(--neon-cyan);">${escapeHtml(g.password || "—")}</code>`;
  }

  // ---------- Save Gallery ----------
  document.getElementById("galleryEditForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("galleryEditId").value;
    const data = {
      name: document.getElementById("galleryName").value.trim(),
      password: document.getElementById("galleryPassword").value,
      eventDate: document.getElementById("galleryDate").value,
      description: document.getElementById("galleryDescription").value.trim(),
    };
    if (!data.name || !data.password) {
      window.showToast("Name und Passwort sind Pflicht.", "error");
      return;
    }
    try {
      const url = id ? `/api/admin/galleries/${id}` : "/api/admin/galleries";
      const method = id ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Speichern fehlgeschlagen");
      await loadGalleries();
      // If new gallery → reopen with full UI
      if (!id) {
        openGalleryEdit(json.gallery);
      } else {
        // Just refresh share info
        renderShareInfo(json.gallery);
      }
      window.showToast("Galerie gespeichert", "success");
    } catch (err) {
      window.showToast("Fehler: " + err.message, "error");
    }
  });

  // ---------- Delete Gallery ----------
  async function deleteGallery(g) {
    if (!confirm(`Galerie "${g.name}" mit allen Bildern wirklich löschen?`)) return;
    try {
      const res = await fetch(`/api/admin/galleries/${g.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Löschen fehlgeschlagen");
      await loadGalleries();
      window.showToast("Galerie gelöscht", "success");
    } catch (err) {
      window.showToast("Fehler: " + err.message, "error");
    }
  }

  // ---------- Image Management ----------
  async function loadGalleryImages(id) {
    try {
      const res = await fetch(`/api/galleries/${id}/images`);
      if (!res.ok) {
        document.getElementById("galleryImagesGrid").innerHTML =
          '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 1rem;">Bilder konnten nicht geladen werden.</div>';
        return;
      }
      const data = await res.json();
      renderImagesGrid(id, data.images || []);
    } catch (err) {
      console.error(err);
    }
  }

  function renderImagesGrid(id, images) {
    const grid = document.getElementById("galleryImagesGrid");
    if (!images.length) {
      grid.innerHTML =
        '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 1.5rem;">Noch keine Bilder. Lade welche hoch ↑</div>';
      return;
    }
    grid.innerHTML = images
      .map(
        (filename) => `
          <div style="position: relative; aspect-ratio: 1; border-radius: 10px; overflow: hidden; background: var(--bg-card); border: 1px solid var(--line);">
            <img src="/api/galleries/${id}/img/${encodeURIComponent(filename)}" style="width: 100%; height: 100%; object-fit: cover;" loading="lazy" alt="" />
            <button type="button" data-img-delete="${escapeHtml(filename)}" title="Löschen" style="position: absolute; top: 0.4rem; right: 0.4rem; width: 28px; height: 28px; border-radius: 50%; background: rgba(248, 113, 113, 0.9); color: #fff; border: none; cursor: pointer; font-size: 0.85rem; line-height: 1;">×</button>
          </div>`
      )
      .join("");

    grid.querySelectorAll("[data-img-delete]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const filename = btn.dataset.imgDelete;
        if (!confirm(`Bild "${filename}" löschen?`)) return;
        try {
          const res = await fetch(
            `/api/admin/galleries/${id}/images/${encodeURIComponent(filename)}`,
            { method: "DELETE" }
          );
          if (!res.ok) throw new Error("Löschen fehlgeschlagen");
          loadGalleryImages(id);
          loadGalleries();
          window.showToast("Bild gelöscht", "success");
        } catch (err) {
          window.showToast("Fehler: " + err.message, "error");
        }
      });
    });
  }

  // ---------- Upload ----------
  const uploadZone = document.getElementById("galleryUploadZone");
  const fileInput = document.getElementById("galleryFileInput");
  const progressBox = document.getElementById("galleryUploadProgress");

  uploadZone.addEventListener("click", () => fileInput.click());
  uploadZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    uploadZone.style.borderColor = "var(--neon-cyan)";
  });
  uploadZone.addEventListener("dragleave", () => {
    uploadZone.style.borderColor = "";
  });
  uploadZone.addEventListener("drop", (e) => {
    e.preventDefault();
    uploadZone.style.borderColor = "";
    handleFiles(e.dataTransfer.files);
  });
  fileInput.addEventListener("change", (e) => {
    handleFiles(e.target.files);
    fileInput.value = "";
  });

  async function handleFiles(files) {
    if (!currentGalleryId) {
      window.showToast("Galerie zuerst speichern.", "error");
      return;
    }
    if (!files.length) return;
    const arr = Array.from(files);
    const total = arr.length;
    progressBox.style.display = "block";
    progressBox.textContent = `Lade ${total} Bild${total === 1 ? "" : "er"} hoch...`;

    const formData = new FormData();
    arr.forEach((f) => formData.append("images", f));

    try {
      const res = await fetch(`/api/admin/galleries/${currentGalleryId}/upload`, {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Upload fehlgeschlagen");
      progressBox.style.display = "none";
      loadGalleryImages(currentGalleryId);
      loadGalleries();
      window.showToast(`${json.uploaded.length} Bild${json.uploaded.length === 1 ? "" : "er"} hochgeladen`, "success");
    } catch (err) {
      progressBox.style.display = "none";
      window.showToast("Fehler: " + err.message, "error");
    }
  }

  // ---------- Copy Share Link ----------
  document.getElementById("copyShareLinkBtn").addEventListener("click", async () => {
    if (!currentGalleryId) return;
    const g = galleries.find((x) => x.id === currentGalleryId);
    if (!g) return;
    const text = `Hier sind deine Event-Bilder:\n${location.origin}/galerie.html?id=${g.id}\n\nPasswort: ${g.password}`;
    try {
      await navigator.clipboard.writeText(text);
      window.showToast("Link + Passwort kopiert", "success");
    } catch (err) {
      window.showToast("Konnte nicht kopieren — bitte manuell markieren.", "error");
    }
  });
})();
