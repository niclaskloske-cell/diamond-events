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
