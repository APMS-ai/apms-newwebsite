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
  var OWN_SCROLL = [
    ".agp--native", ".agp__viewport", "[data-agp]", ".ptabs__scroll",
    "pre", "textarea", ".chatbot__log", "[data-scrollable]"
  ].join(",");

  /* Every write in here happens at the end, and the cheap test comes before
     the expensive one. Both matter, and the first one is not obvious:
     setAttribute invalidates style, so a setAttribute *inside* the read loop
     means the next getComputedStyle cannot use the cached recalc and the
     browser re-does layout for every element in turn. Measured on the platform
     page, which has about eighteen hundred elements under main, that thrash
     was 704ms of a single blocking task - the largest one on the page.

     The ordering is the other half. scrollWidth/clientWidth are layout reads
     against a layout that is already clean, whereas getComputedStyle on a
     fresh element is a style resolve; the overwhelming majority of divs are
     not scrollable, so testing the dimensions first lets nearly all of them
     out before anyone asks for their computed overflow. */
  function exempt() {
    var mark = [];

    var own = document.querySelectorAll(OWN_SCROLL);
    for (var i = 0; i < own.length; i++) mark.push(own[i]);

    /* Catch anything a stylesheet has made scrollable that is not on the list
       above. A container that scrolls but is not exempt is invisible to the
       visitor: Lenis consumes the gesture and it never moves. This is how the
       "Four modules" diagram ended up stuck showing only its left third. */
    var all = document.querySelectorAll("main div, main section, main ul, main table");
    for (var j = 0; j < all.length; j++) {
      var el = all[j];
      if (el.hasAttribute("data-lenis-prevent")) continue;
      if (el.scrollWidth <= el.clientWidth + 4) continue;
      var ox = getComputedStyle(el).overflowX;
      if (ox === "auto" || ox === "scroll") mark.push(el);
    }

    for (var k = 0; k < mark.length; k++) mark[k].setAttribute("data-lenis-prevent", "");
  }
  /* exempt() is called from drive(), not here: none of it matters until Lenis
     is actually intercepting gestures, and Lenis does not start until the
     visitor does, so the sweep goes with it.

     Lenis itself is constructed there too, and not at load.

     Lenis's Dimensions constructor ends in an unconditional this.resize(),
     which reads content.scrollHeight. On a short page that is nothing; on this
     one it forces a full layout of every element in the document, including
     the nine screens nobody has scrolled to yet. Measured, that single read
     was a 728ms blocking task sitting right after first paint, and it was the
     reason the page stayed unresponsive for three seconds after it looked
     finished - the visitor's first mousemove could not be handled until it
     was done, so everything gated on that first interaction started late.

     Nothing here is needed before the first gesture, which is the same
     reasoning the rAF loop below already followed; the object just had to
     follow it too. */
  var lenis = null;

  function build() {
    if (lenis) return lenis;
    lenis = new window.Lenis({
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

    /* Content added later (rails cloning cards, the chatbot opening) needs a
       fresh height. Observed from here so the observer does not exist, and
       cannot fire, before Lenis does. */
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(function () { lenis.resize(); });
      ro.observe(document.documentElement);
    }

    /* gscroll.js and pseq.js both read this. Neither can run before the first
       interaction, and both already test for it, so publishing it here rather
       than at load is safe. */
    window.__lenis = lenis;
    return lenis;
  }

  /* One rAF loop for the whole page. GSAP already runs one, so Lenis rides on
     it instead of starting a second: two loops means two layout reads per
     frame and they fight over which one wins.

     And it does not start until the visitor does. Attaching at load meant a
     rAF loop from the first paint onwards, so the main thread never went idle
     for as long as the tab was open. Lighthouse attributed 23 seconds of work
     to GSAP for a page that was, as far as anyone could see, standing still,
     and Speed Index went with it. Nothing needs smoothing before the first
     scroll, so nothing runs before the first scroll: until then the browser's
     own scrolling is what you get, which is what you would have had anyway. */
  var driving = false;
  function drive() {
    if (driving) return;
    driving = true;
    build();
    exempt();
    /* gsap arrives on the same signal this does, so ask for it rather than
       testing for it: whichever of the two lands second runs this. */
    if (window.APMSGsap && !window.gsap) { window.APMSGsap(attach); return; }
    attach();
  }
  function attach() {
    if (window.gsap && window.ScrollTrigger) {
      lenis.on("scroll", window.ScrollTrigger.update);
      window.gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
      window.gsap.ticker.lagSmoothing(0);
    } else {
      var raf = function (t) { lenis.raf(t); requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
    }
  }
  if (window.APMSWake) window.APMSWake(drive); else drive();

  /* scrollTo is the one thing that needs the loop running whether or not the
     visitor has touched anything yet, so it builds and starts Lenis first. */
  function scrollTo(target, opts) {
    drive();
    return lenis.scrollTo(target, opts);
  }

  /* In-page anchors glide instead of jumping. */
  document.addEventListener("click", function (e) {
    var a = e.target.closest ? e.target.closest('a[href^="#"]') : null;
    if (!a) return;
    var id = a.getAttribute("href");
    if (!id || id.length < 2) return;
    var el = document.querySelector(id);
    if (el) { e.preventDefault(); scrollTo(el, { offset: -80 }); }
  });

  var totop = document.querySelector(".totop");
  if (totop) totop.addEventListener("click", function (e) { e.preventDefault(); scrollTo(0); }, true);

  /* Re-measure on load only if the visitor has already arrived. This line used
     to call exempt() and lenis.resize() unconditionally, which quietly undid
     the deferral above: the sweep was skipped at startup and then run in full
     on `load` anyway, for every visitor, including the ones who never touch
     the page. If Lenis does not exist yet, drive() does both when it is
     built. */
  window.addEventListener("load", function () {
    if (!lenis) return;
    if (driving) exempt();
    lenis.resize();
  });
})();
