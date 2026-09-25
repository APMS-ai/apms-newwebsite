/* ==========================================================================
   APMS.ai — site-fx.js
   Hero scroll parallax, on GSAP. Guarded for reduced motion, and it asks
   gsap-late.js for gsap rather than assuming it is present, so it degrades
   silently to the base design when gsap never arrives.
   ========================================================================== */
(function () {
  "use strict";

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- 1 · the hero's particle network ----------
     Moved to js/motion/netbg.js, which draws the same picture on a 2D canvas,
     ships inside the page bundle and starts with the headline instead of six
     seconds after it. What used to live here fetched three.min.js and
     vanta.net.min.js on the first interaction - 152 KB gzipped, arriving last,
     and 601 KB to parse once it did. The WebGL and viewport-width gates went
     with it, since nothing else in this file needed them. */

  /* ---------- 2 · GSAP — gentle scroll parallax on hero content ---------- */
  /* gsap is fetched on the first interaction now, so this asks for it rather
     than testing once at load and giving up. See js/core/gsap-late.js. */
  if (!reduce) { if (window.APMSGsap) window.APMSGsap(heroParallax); else heroParallax(); }
  function heroParallax() {
    if (!window.gsap) return;
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
