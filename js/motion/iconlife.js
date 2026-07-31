/* ==========================================================================
   APMS.ai — iconlife.js
   Brings the site's icon chips to life, cheaply and calmly.

   Does three things:
     1 · tags every icon chip with .ico-live and a stagger index (--i), so no
         two neighbours pulse together
     2 · gates the animations per section with an IntersectionObserver, so we
         only ever animate what is on screen
     3 · leaves bespoke instruments alone (.fgi, .mico, .bfx, .mc, .aloop,
         .modflow already have their own choreography)

   Reduced-motion: bails out entirely, leaving every icon static.
   ========================================================================== */
(function () {
  "use strict";

  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  /* icon chips worth animating, across every page */
  var CHIPS = [
    ".tile__ico", ".cap__ico", ".mod__ico", ".bento__ico", ".fstrip__ico",
    ".ag-ind__ico", ".ag-cap__ico", ".mpanel__ico", ".irow__ico", ".fpanel__ico",
    ".arch__layer > svg", ".step__ico"
  ].join(",");

  /* these carry their own animation already */
  var SKIP = ".fgi, .mico, .bfx, .mc, .aloop, .modflow, .bnum, .agf, .bstep";

  var chips = Array.prototype.slice.call(document.querySelectorAll(CHIPS));
  var n = 0;
  chips.forEach(function (el) {
    if (el.querySelector && el.querySelector(SKIP)) return;   // bespoke glyph inside
    if (el.closest && el.closest(SKIP)) return;               // inside a bespoke block
    if (el.classList.contains("ico-live")) return;
    el.classList.add("ico-live");
    /* 8 phases is enough variety to break up any visible rhythm */
    el.style.setProperty("--i", String(n % 8));
    n++;
  });

  if (!n) return;

  /* ---------- gate the motion to sections that are actually on screen ---------- */
  var hosts = [];
  chips.forEach(function (el) {
    var host = el.closest("section") || document.body;
    if (hosts.indexOf(host) === -1) hosts.push(host);
  });

  if (!("IntersectionObserver" in window)) {
    hosts.forEach(function (h) { h.classList.add("ico-run"); });
    return;
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      e.target.classList.toggle("ico-run", e.isIntersecting);
    });
  }, { rootMargin: "120px 0px" });

  hosts.forEach(function (h) { io.observe(h); });
})();
