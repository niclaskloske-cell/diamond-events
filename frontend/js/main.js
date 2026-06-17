/**
 * Shared frontend JS
 * - Navbar scroll state
 * - Mobile menu
 * - Reveal animations on scroll
 * - Year in footer
 */

(function () {
  // Year in footer(s)
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Navbar scroll
  const nav = document.getElementById("nav");
  if (nav) {
    const onScroll = () => {
      if (window.scrollY > 50) nav.classList.add("scrolled");
      else nav.classList.remove("scrolled");
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  // Mobile menu
  const toggle = document.getElementById("menuToggle");
  const links = document.getElementById("navLinks");
  if (toggle && links) {
    toggle.addEventListener("click", () => {
      toggle.classList.toggle("active");
      links.classList.toggle("open");
    });
    links.querySelectorAll("a").forEach((a) =>
      a.addEventListener("click", () => {
        toggle.classList.remove("active");
        links.classList.remove("open");
      })
    );
  }

  // Reveal on scroll (generic)
  const reveals = document.querySelectorAll(".reveal");
  if (reveals.length) {
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            obs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -60px 0px" }
    );
    reveals.forEach((el) => obs.observe(el));
  }

  // Package cards staggered reveal
  const packageCards = document.querySelectorAll(".package-card");
  if (packageCards.length) {
    const pObs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const delay = entry.target.dataset.delay || "0";
            entry.target.style.setProperty("--anim-delay", delay + "s");
            entry.target.classList.add("visible");
            pObs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.2, rootMargin: "0px 0px -50px 0px" }
    );
    packageCards.forEach((card) => pObs.observe(card));
  }

  // Smooth anchor scroll w/ offset
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener("click", function (e) {
      const targetId = this.getAttribute("href");
      if (targetId.length <= 1) return;
      const target = document.querySelector(targetId);
      if (!target) return;
      e.preventDefault();
      const top = target.getBoundingClientRect().top + window.scrollY - 70;
      window.scrollTo({ top, behavior: "smooth" });
    });
  });

  // Timeline scroll animation — fills the line + reveals steps
  const timeline = document.getElementById("timeline");
  const timelineFill = document.getElementById("timelineFill");
  const timelineSteps = document.querySelectorAll(".timeline-step");

  if (timeline && timelineFill && timelineSteps.length) {
    // Reveal steps with IntersectionObserver
    const stepObs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            stepObs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.4, rootMargin: "0px 0px -80px 0px" }
    );
    timelineSteps.forEach((s) => stepObs.observe(s));

    // Fill the gradient line based on scroll position within timeline
    const updateFill = () => {
      const rect = timeline.getBoundingClientRect();
      const viewportH = window.innerHeight;
      const start = viewportH * 0.7; // line starts filling when timeline top is 70% down viewport
      const distance = rect.height;
      const scrolled = start - rect.top;
      const progress = Math.max(0, Math.min(1, scrolled / distance));
      timelineFill.style.height = (progress * 100).toFixed(1) + "%";
    };
    window.addEventListener("scroll", updateFill, { passive: true });
    updateFill();
  }

  // Hero parallax
  const heroBg = document.querySelector(".hero-bg");
  if (heroBg) {
    window.addEventListener(
      "scroll",
      () => {
        const y = window.scrollY;
        if (y < window.innerHeight) {
          heroBg.style.transform = `scale(1.05) translateY(${y * 0.25}px)`;
        }
      },
      { passive: true }
    );
  }

  // Special-offer countdown: number drops from data-from to data-to and turns colored at end
  const specialNumbers = document.querySelectorAll("[data-from][data-to]");
  if (specialNumbers.length) {
    const animateSpecial = (el) => {
      const from = parseInt(el.dataset.from, 10);
      const to = parseInt(el.dataset.to, 10);
      if (isNaN(from) || isNaN(to)) return;
      const duration = 1300;
      const startTime = performance.now();
      const formatter = new Intl.NumberFormat("de-DE");
      el.textContent = formatter.format(from);

      function tick(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const value = Math.round(from + (to - from) * eased);
        el.textContent = formatter.format(value);
        if (progress < 1) {
          requestAnimationFrame(tick);
        } else {
          el.textContent = formatter.format(to);
          el.classList.add("colored");
        }
      }
      requestAnimationFrame(tick);
    };

    const specialObs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            // small delay so card-reveal animation plays first
            setTimeout(() => animateSpecial(entry.target), 350);
            specialObs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.4 }
    );
    specialNumbers.forEach((c) => specialObs.observe(c));
  }

  // Counter animation for prices (numbers count up when visible)
  const counters = document.querySelectorAll("[data-target]");
  if (counters.length) {
    const animateCounter = (el) => {
      const target = parseInt(el.dataset.target, 10);
      if (isNaN(target)) return;
      const duration = 1500;
      const startTime = performance.now();
      const formatter = new Intl.NumberFormat("de-DE");

      function tick(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // easeOutCubic
        const eased = 1 - Math.pow(1 - progress, 3);
        const value = Math.floor(target * eased);
        el.textContent = formatter.format(value);
        if (progress < 1) requestAnimationFrame(tick);
        else el.textContent = formatter.format(target);
      }
      requestAnimationFrame(tick);
    };

    const counterObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            animateCounter(entry.target);
            counterObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.4 }
    );
    counters.forEach((c) => counterObserver.observe(c));
  }
})();

// =========================================================
// PUBLIC AVAILABILITY CALENDAR (index.html)
// =========================================================
(function () {
  const grid = document.getElementById("availCalGrid");
  const label = document.getElementById("availMonthLabel");
  if (!grid || !label) return;

  const today = new Date();
  let calYear = today.getFullYear();
  let calMonth = today.getMonth();
  let availData = [];

  const monthNames = [
    "Januar", "Februar", "März", "April", "Mai", "Juni",
    "Juli", "August", "September", "Oktober", "November", "Dezember"
  ];

  async function loadAvailability() {
    try {
      const res = await fetch("/api/availability");
      if (res.ok) availData = await res.json();
    } catch (e) {
      availData = [];
    }
    renderCalendar();
  }

  function renderCalendar() {
    label.textContent = `${monthNames[calMonth]} ${calYear}`;

    const firstDay = new Date(calYear, calMonth, 1);
    const lastDay = new Date(calYear, calMonth + 1, 0);
    const daysInMonth = lastDay.getDate();
    const leading = (firstDay.getDay() + 6) % 7; // Mon-first

    const weekdays = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
    let html = weekdays.map((w) => `<div class="avail-weekday">${w}</div>`).join("");

    for (let i = 0; i < leading; i++) {
      html += `<div class="avail-day empty"></div>`;
    }

    const todayStr = today.toISOString().split("T")[0];

    for (let d = 1; d <= daysInMonth; d++) {
      const mm = String(calMonth + 1).padStart(2, "0");
      const dd = String(d).padStart(2, "0");
      const dateStr = `${calYear}-${mm}-${dd}`;

      const entry = availData.find((x) => x.date === dateStr);
      const isPast = dateStr < todayStr;
      const isToday = dateStr === todayStr;

      let cls = "avail-day";
      if (isPast) cls += " past";
      if (isToday) cls += " today";

      if (entry && (entry.type === "blockiert" || entry.type === "belegt")) {
        cls += ` ${entry.type}`;
      } else if (entry && entry.type === "special") {
        cls += " special";
      } else if (!isPast) {
        cls += " frei";
      }

      let title = "Verfügbar — Klicken zum Buchen";
      if (entry && entry.type === "blockiert") title = "Nicht verfügbar" + (entry.note ? ` — ${entry.note}` : "");
      if (entry && entry.type === "belegt") title = "Belegt" + (entry.note ? ` — ${entry.note}` : "");
      if (entry && entry.type === "special") title = "⭐ Special" + (entry.note ? ` — ${entry.note}` : "");
      if (isPast) title = "";

      const isBookable = !isPast && (!entry || entry.type === "frei");
      html += `<div class="${cls}" title="${title}" ${isBookable ? `data-date="${dateStr}"` : ""}>${d}</div>`;
    }

    grid.innerHTML = html;

    // Clicking any available (frei) day goes to booking page
    grid.querySelectorAll(".avail-day.frei:not(.past)").forEach((el) => {
      el.addEventListener("click", () => {
        const mm = String(calMonth + 1).padStart(2, "0");
        const d = el.textContent.trim().padStart(2, "0");
        const dateStr = `${calYear}-${mm}-${d}`;
        window.location.href = `/booking.html?date=${dateStr}`;
      });
    });
  }

  document.getElementById("availPrev").addEventListener("click", () => {
    calMonth--;
    if (calMonth < 0) { calMonth = 11; calYear--; }
    renderCalendar();
  });

  document.getElementById("availNext").addEventListener("click", () => {
    calMonth++;
    if (calMonth > 11) { calMonth = 0; calYear++; }
    renderCalendar();
  });

  loadAvailability();
})();

// Simple toast helper (used across pages)
window.showToast = function (msg, type = "success") {
  let toast = document.querySelector(".toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.className = "toast " + type;
  requestAnimationFrame(() => toast.classList.add("visible"));
  setTimeout(() => toast.classList.remove("visible"), 3500);
};
