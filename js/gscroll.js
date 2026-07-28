/* ==========================================================================
   APMS.ai — gscroll.js
   The GSAP ScrollTrigger layer, on every page.

   Why this sits alongside the existing reveal system rather than replacing it:
   IntersectionObserver answers one question, "is it on screen yet", and that is
   all an entrance needs. ScrollTrigger answers a different one, "how far
   through this element is the scroll", which is the only way to get motion that
   tracks the scrollbar rather than firing once. So the two are split by job:

     reveal.js / redesign.js  entrances     (fire once, then stop costing anything)
     this file                scroll-linked (scrub: parallax, draw, progress)

   Doubling them up on the same element would mean two owners writing the same
   transform, so everything here targets either inner elements that no reveal
   touches, or elements tagged specifically for it.

   Integration notes:
   · Lenis drives ScrollTrigger.update from smooth.js, so there is one scroll
     source and one rAF loop for the whole page.
   · gsap.matchMedia() keeps the heavier scrubs off phones, where the frame
     budget is tightest and a parallax nobody asked for is the first thing to cut.
   · Every trigger is registered once and refreshed when the page resizes; there
     are no per-frame scroll listeners added here.
   ========================================================================== */
(function () {
  "use strict";

  var gsap = window.gsap, ST = window.ScrollTrigger;
  if (!gsap || !ST) return;
  gsap.registerPlugin(ST);

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Tell redesign.js to stop writing the progress bar: ScrollTrigger owns it
     now, and two writers per frame is one too many. */
  document.documentElement.classList.add("gs-on");

  /* ------------------------------------------------------------------
     1 · reading progress, driven by the scroll position itself
     ------------------------------------------------------------------ */
  var bar = document.querySelector(".progress");
  if (bar) {
    gsap.set(bar, { width: "0%" });
    ST.create({
      start: 0,
      end: function () { return document.documentElement.scrollHeight - window.innerHeight; },
      onUpdate: function (self) { bar.style.width = (self.progress * 100).toFixed(2) + "%"; }
    });
  }

  if (reduce) { ST.refresh(); return; }

  /* ------------------------------------------------------------------
     2 · the scrubbed effects, scaled to the viewport
     ------------------------------------------------------------------ */
  gsap.matchMedia().add("(min-width: 900px)", function () {

    /* --- parallax on the instrument panels -----------------------------
       These SVGs sit inside a [data-reveal] card but are not themselves
       revealed, so nothing else is writing their transform. A small drift
       against the card gives the consoles some depth as they pass. */
    var panels = gsap.utils.toArray([
      ".mpanel__console svg", ".mfx svg", ".arc__viz svg", ".cvcmp svg",
      ".vcon", ".aorb svg", ".loopwrap svg", ".modflow svg"
    ].join(","));

    panels.forEach(function (el) {
      gsap.fromTo(el, { yPercent: 4 }, {
        yPercent: -4, ease: "none",
        scrollTrigger: { trigger: el, start: "top bottom", end: "bottom top", scrub: 0.6 }
      });
    });

    /* --- section eyebrows drift in from the scroll ---------------------
       The kicker is a small element with no reveal of its own on most
       pages, so it can carry a little scroll-linked movement. */
    gsap.utils.toArray(".sec__head .kicker").forEach(function (el) {
      gsap.fromTo(el, { x: -14 }, {
        x: 0, ease: "none",
        scrollTrigger: { trigger: el, start: "top bottom", end: "top 55%", scrub: 0.5 }
      });
    });

    /* --- long decorative strokes draw as you pass them -----------------
       Opt in with data-gs-draw so it is never guessing which paths are
       structural and which are decoration. */
    gsap.utils.toArray("[data-gs-draw]").forEach(function (el) {
      var len = 0;
      try { len = el.getTotalLength(); } catch (e) { return; }
      if (!len) return;
      gsap.set(el, { strokeDasharray: len, strokeDashoffset: len });
      gsap.to(el, {
        strokeDashoffset: 0, ease: "none",
        scrollTrigger: { trigger: el, start: "top 85%", end: "bottom 45%", scrub: 0.5 }
      });
    });

    return function () {
      /* matchMedia cleanup: leaving stale triggers behind on a resize past
         the breakpoint is how scroll positions drift out of sync */
      ST.getAll().forEach(function (t) { if (t.vars && t.vars.scrub) t.kill(); });
      gsap.set(panels, { clearProps: "transform" });
    };
  });

  /* ------------------------------------------------------------------
     3 · counters that count while you scroll to them
     redesign.js counts on intersection; this makes the number track the
     scroll instead, so scrolling back up rewinds it.
     ------------------------------------------------------------------ */
  gsap.utils.toArray("[data-gs-count]").forEach(function (el) {
    var to = parseFloat(el.getAttribute("data-gs-count")) || 0;
    var suffix = el.getAttribute("data-gs-suffix") || "";
    var obj = { v: 0 };
    gsap.to(obj, {
      v: to, ease: "none",
      onUpdate: function () { el.textContent = Math.round(obj.v) + suffix; },
      scrollTrigger: { trigger: el, start: "top 90%", end: "top 45%", scrub: 0.4 }
    });
  });

  /* ------------------------------------------------------------------
     4 · keep measurements honest
     Fonts landing and images decoding both change element heights after
     the triggers were calculated.
     ------------------------------------------------------------------ */
  window.addEventListener("load", function () { ST.refresh(); });
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { ST.refresh(); });
  }
  if (window.__lenis) window.__lenis.on("scroll", ST.update);
})();
