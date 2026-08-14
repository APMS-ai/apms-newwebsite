/* ==========================================================================
   APMS.ai — site-fx.js
   Premium hero effects using vendored GSAP + Vanta (three.js).
   Loads after the vendor libs. Fully guarded: reduced-motion, WebGL,
   and library-presence checks. Degrades silently to the base design.
   ========================================================================== */
(function () {
  "use strict";

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var fine   = window.matchMedia && window.matchMedia("(pointer: fine)").matches;

  /* ---------- 1 · Vanta NET — subtle teal network behind the hero ---------- */
  function hasWebGL() {
    try {
      var c = document.createElement("canvas");
      return !!(window.WebGLRenderingContext && (c.getContext("webgl") || c.getContext("experimental-webgl")));
    } catch (e) { return false; }
  }

  /* A full-viewport WebGL background is the single most expensive thing on the
     page. Phones and tablets pay the most for it and benefit the least, so they
     get the static hero instead: smooth scrolling matters more than a decorative
     particle mesh. perf.js pauses it on desktop once the hero scrolls away. */
  var heavyOk = fine && window.innerWidth >= 900;

  /* three.min.js is 601 KB and vanta another 12. They used to be script tags on
     every page, which meant every phone downloaded and parsed 613 KB for a hero
     effect that is switched off below 900px. They are fetched here instead, and
     only once we already know the effect will run. */
  function need(srcs, done) {
    var left = srcs.length;
    srcs.forEach(function (src) {
      var el = document.createElement("script");
      el.src = src; el.async = false;
      el.onload = function () { if (--left === 0) done(); };
      el.onerror = function () { left = -1; };   /* give up quietly */
      document.head.appendChild(el);
    });
  }

  var hero = document.querySelector(".phero") || document.querySelector(".hero");
  if (hero && !reduce && heavyOk && hasWebGL()) {
    /* After the page has loaded, and then only when the browser is idle.
       three.js is 601 KB, 148 KB of it over the wire, and it was being fetched
       while the page was still assembling itself: measured, it pushed
       DOMContentLoaded out to 2.34s on a local server with nothing else
       competing. It decorates the hero. It can wait for everything that does
       not.

       The 2500ms cap is there because requestIdleCallback can be a long time
       coming on a busy page, and a hero that never fills in is worse than one
       that fills in late. */
    var started = false;
    var kick = function () {
      if (started) return; started = true;
      need(["js/vendor/three.min.js", "js/vendor/vanta.net.min.js"], startVanta);
    };
    var queue = function () {
      if (window.requestIdleCallback) requestIdleCallback(kick, { timeout: 2500 });
      else setTimeout(kick, 900);
    };
    if (document.readyState === "complete") queue();
    else window.addEventListener("load", queue, { once: true });
  }

  function startVanta() {
    if (!window.VANTA || !window.VANTA.NET || !window.THREE) return;
    hero.classList.add("has-vanta"); // CSS mutes the static grid + lifts content above the canvas
    // Dedicated background layer so the canvas sits BEHIND hero content, never over it.
    var bg = document.createElement("div");
    bg.className = "vanta-bg";
    bg.setAttribute("aria-hidden", "true");
    hero.insertBefore(bg, hero.firstChild);
    try {
      var fx = window.VANTA.NET({
        el: bg,
        THREE: window.THREE,
        mouseControls: fine,
        touchControls: false,
        gyroControls: false,
        minHeight: 200.0,
        minWidth: 200.0,
        scale: 1.0,
        scaleMobile: 1.0,
        color: 0x2ee0b4,          // APMS teal-bright
        backgroundColor: 0x070f19, // --ink-900
        points: 9.0,
        maxDistance: 21.0,
        spacing: 18.0,
        showDots: true
      });
      /* perf.js pauses this when the hero scrolls away: a full-screen WebGL
         canvas rendering behind content nobody is looking at was costing
         frames on every page. */
      /* Vanta renders at full devicePixelRatio by default, which quadruples the
         fragment work on a retina panel for a background that is deliberately
         soft. 1 is plenty for a particle mesh. */
      try {
        if (fx && fx.renderer && fx.renderer.setPixelRatio) {
          fx.renderer.setPixelRatio(1);
          if (fx.resize) fx.resize();
        }
      } catch (e) {}
      window.__vanta = fx;
      window.addEventListener("beforeunload", function () { if (fx && fx.destroy) fx.destroy(); });
    } catch (e) { hero.classList.remove("has-vanta"); if (bg && bg.parentNode) bg.parentNode.removeChild(bg); }
  }

  /* ---------- 2 · GSAP — gentle scroll parallax on hero content ---------- */
  if (!reduce && window.gsap) {
    var g = window.gsap;
    if (window.ScrollTrigger) g.registerPlugin(window.ScrollTrigger);

    /* NOTE: no opacity/transform tween on the hero content — it owns [data-reveal],
       and a scrub tween would fight that and can pin the text invisible. */

    /* opt-in continuous parallax for any element tagged .fx-float (decorative) */
    g.utils.toArray(".fx-float").forEach(function (el) {
      var depth = parseFloat(el.getAttribute("data-fx-depth")) || 20;
      if (!window.ScrollTrigger) return;
      g.to(el, {
        yPercent: -depth,
        ease: "none",
        scrollTrigger: { trigger: el, start: "top bottom", end: "bottom top", scrub: true }
      });
    });
  }
})();
