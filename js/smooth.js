/* ==========================================================================
   APMS.ai — smooth.js
   Lenis smooth scroll, on both desktop and touch, driven from GSAP's ticker.
   Skips entirely under reduced-motion (falls back to native scroll).

   Two notes worth keeping:

   · Touch is smoothed too (syncTouch). Lenis leaves touch alone by default
     and lets the OS provide momentum, which is why mobile felt different to
     desktop. Turning it on means the same easing everywhere, at the cost of
     replacing the platform's own inertia, so the inertia multiplier and lerp
     below are tuned to land close to what a phone does natively rather than
     feeling floaty.

   · Anything that scrolls in its own right, the horizontal card rails above
     all, is marked data-lenis-prevent. Without that, Lenis swallows the
     gesture and the rails cannot be swiped on a phone.
   ========================================================================== */
(function () {
  "use strict";
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (!window.Lenis) return;

  var coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;

  /* Let the rails keep their own gestures. Done here rather than in the
     markup so every page gets it without touching ten HTML files. */
  function exempt() {
    var own = document.querySelectorAll(
      ".agp--native, .agp__viewport, [data-agp], .ptabs__scroll, pre, textarea, .chatbot__log, [data-scrollable]"
    );
    for (var i = 0; i < own.length; i++) {
      own[i].setAttribute("data-lenis-prevent", "");
    }
  }
  exempt();

  var lenis = new window.Lenis({
    /* lerp rather than a fixed duration: a duration always finishes late on a
       long throw, where a lerp keeps closing the gap at a constant rate and
       stays glued to fast flicks */
    lerp: 0.1,
    smoothWheel: true,
    wheelMultiplier: 1,

    /* --- touch --- */
    syncTouch: true,
    /* the drag itself follows the finger almost exactly; only the release
       glides, which is what makes it read as native rather than laggy */
    syncTouchLerp: 0.075,
    touchInertiaMultiplier: 28,
    touchMultiplier: 1.35,

    gestureOrientation: "vertical",
    orientation: "vertical",
    overscroll: true,
    autoResize: true,
    infinite: false
  });

  /* One rAF loop for the whole page. GSAP already runs one, so Lenis rides on
     it instead of starting a second: two loops means two layout reads per
     frame and they fight over which one wins. */
  if (window.gsap && window.ScrollTrigger) {
    lenis.on("scroll", window.ScrollTrigger.update);
    window.gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
    window.gsap.ticker.lagSmoothing(0);
  } else {
    var raf = function (t) { lenis.raf(t); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
  }

  /* In-page anchors glide instead of jumping. */
  document.addEventListener("click", function (e) {
    var a = e.target.closest ? e.target.closest('a[href^="#"]') : null;
    if (!a) return;
    var id = a.getAttribute("href");
    if (!id || id.length < 2) return;
    var el = document.querySelector(id);
    if (el) { e.preventDefault(); lenis.scrollTo(el, { offset: -80 }); }
  });

  var totop = document.querySelector(".totop");
  if (totop) totop.addEventListener("click", function (e) { e.preventDefault(); lenis.scrollTo(0); }, true);

  /* Content added later (rails cloning cards, the chatbot opening) needs the
     same exemptions and a fresh height. */
  if (window.ResizeObserver) {
    var ro = new ResizeObserver(function () { lenis.resize(); });
    ro.observe(document.documentElement);
  }
  window.addEventListener("load", function () { exempt(); lenis.resize(); });

  window.__lenis = lenis;
})();
