/* ==========================================================================
   APMS.ai — gsap-late.js
   GSAP and ScrollTrigger, fetched when the visitor arrives rather than at load.

   Between them they are 114 KB of script whose entire job is scroll-linked
   motion: parallax, draws, scrubbed progress. None of that can happen before
   the first scroll, and yet both were parsed and evaluated on every page load,
   inside the window Lighthouse measures blocking time in. Measured, they were
   the two largest remaining tasks on the main thread after everything else had
   been moved off it.

   So they load on the first pointer, wheel, touch or key, and then the four
   files that need them are told. Every one of those already bails cleanly when
   gsap is absent, so the shape of this is: give them a second chance later
   instead of only one chance too early.

     window.APMSGsap(fn)   run fn once gsap and ScrollTrigger exist,
                           immediately if they already do, never if the
                           visitor never arrives or the fetch fails.

   Loaded before its consumers so the queue exists when they call it.
   ========================================================================== */
(function () {
  "use strict";

  var queue = [];
  var ready = false;
  var loading = false;

  function flush() {
    ready = true;
    for (var i = 0; i < queue.length; i++) {
      try { queue[i](); } catch (e) { /* one broken consumer must not stop the rest */ }
    }
    queue.length = 0;
    window.dispatchEvent(new Event("apms:gsap"));
  }

  function load() {
    if (loading || ready) return;
    loading = true;

    if (window.gsap && window.ScrollTrigger) { flush(); return; }

    /* async=false on a dynamically inserted script still guarantees order,
       which matters: ScrollTrigger registers itself against gsap. */
    var srcs = ["js/vendor/gsap.min.js", "js/vendor/ScrollTrigger.min.js"];
    var left = srcs.length;
    srcs.forEach(function (src) {
      var el = document.createElement("script");
      el.src = src;
      el.async = false;
      el.onload = function () { if (--left === 0) flush(); };
      el.onerror = function () { left = -1; };   /* give up quietly: everything degrades */
      document.head.appendChild(el);
    });
  }

  window.APMSGsap = function (fn) {
    if (ready) { fn(); return; }
    queue.push(fn);
  };

  if (window.gsap && window.ScrollTrigger) flush();
  else if (window.APMSWake) window.APMSWake(load);
  else load();
})();
