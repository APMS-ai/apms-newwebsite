/* ==========================================================================
   APMS.ai — reveal.js
   Tags content blocks across every page so they fade and rise into view,
   staggered within their group. The hero plays on load; everything else
   waits for the scroll.

   Deliberately additive: elements that already animate themselves
   (data-reveal, the pinned pattern rail, the tab panels, marquees, the
   loop diagram, the stepper) are skipped so nothing fights for the same
   transform.
   ========================================================================== */
(function () {
  "use strict";

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) return;

  /* Anything inside these keeps its own choreography. */
  var SKIP_WITHIN = [
    "[data-reveal]", "[data-agp]", ".agp", ".ag-flow", ".ag-arch", ".aloop",
    ".bstep", ".inds", ".qmarq", ".marq", ".words", ".ticker", ".ppane",
    ".faq__a", ".pipe__sticky", ".pseq", ".hdr", ".mnav", ".vanta-bg", ".aurora",
    "svg", ".gauges", "[data-ptabs]"
  ].join(",");

  /* What earns an entrance. Ordered loosely outside-in. */
  var TARGETS = [
    ".sec__head",
    ".tile", ".mod", ".ag-cap", ".ag-pat", ".card", ".why__item", ".arch__layer",
    ".vs__card", ".stat", ".faq__item", ".ind", ".quote", ".step", ".fstrip__cell",
    ".bento__c", ".glass", ".pbody", ".ticks > li",
    ".grid3 > *", ".grid4 > *", ".grid2 > *",
    "main > section > .container > h2",
    "main > section > .container > p",
    ".cta__actions", ".sec__lead"
  ].join(",");

  var HERO = ".phero__wrap, .hero__wrap, .phero__actions, .hero__inner";

  var main = document.querySelector("main");
  if (!main) return;

  document.documentElement.classList.add("has-reveal");

  function tag(el, kind, delay) {
    if (el.hasAttribute("data-r")) return false;
    el.setAttribute("data-r", kind);
    if (delay) el.style.setProperty("--r-delay", delay + "ms");
    return true;
  }

  /* ---------- hero: plays immediately ---------- */
  var heroBits = [];
  Array.prototype.forEach.call(document.querySelectorAll(HERO), function (wrap) {
    var kids = wrap.matches(".phero__actions") ? [wrap]
             : Array.prototype.slice.call(wrap.children);
    kids.forEach(function (k) { if (tag(k, "hero", heroBits.length * 90)) heroBits.push(k); });
  });

  /* ---------- everything else: on scroll ---------- */
  var groups = new Map();
  var items = [];

  Array.prototype.forEach.call(main.querySelectorAll(TARGETS), function (el) {
    if (el.closest(SKIP_WITHIN)) return;
    if (el.hasAttribute("data-r")) return;
    if (!el.getClientRects().length && !el.offsetParent && el.offsetHeight === 0) return;

    /* stagger against siblings that are also revealing */
    var p = el.parentElement || main;
    var n = groups.get(p) || 0;
    groups.set(p, n + 1);

    var kind = el.matches(".sec__head") ? "head"
             : el.matches(".ticks > li, .sec__lead") ? "soft"
             : el.matches(".tile, .mod, .ag-cap, .ag-pat, .vs__card, .faq__item, .ind, .bento__c, .arch__layer, .why__item, .stat") ? "card"
             : "up";

    if (tag(el, kind, Math.min(n * 70, 350))) items.push(el);
  });

  /* ---------- observers ---------- */
  function play(el) {
    el.classList.add("r-in");
    var done = function () { el.classList.add("r-done"); el.removeEventListener("transitionend", done); };
    el.addEventListener("transitionend", done);
    setTimeout(done, 1800);
  }

  if (!("IntersectionObserver" in window)) {
    items.concat(heroBits).forEach(play);
    return;
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      play(e.target);
      io.unobserve(e.target);
    });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });

  items.forEach(function (el) {
    /* already on screen at load: play it with the hero rather than on scroll */
    var r = el.getBoundingClientRect();
    if (r.top < window.innerHeight * 0.92) { heroBits.push(el); return; }
    io.observe(el);
  });

  /* fire the above-the-fold set once styles have settled */
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      heroBits.forEach(play);
    });
  });

  /* A pinned ScrollTrigger measures the page at load; revealing shifts
     nothing (opacity/transform only) but refresh anyway once it settles. */
  window.addEventListener("load", function () {
    if (window.ScrollTrigger) setTimeout(function () { window.ScrollTrigger.refresh(); }, 400);
  });
})();
