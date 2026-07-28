/* ==========================================================================
   APMS.ai — agentic.js
   Page behaviour for ai-agents.html. The horizontal pattern rail that used
   to live here now lives in js/rail.js, shared with solutions.html.
   ========================================================================== */

/* ==========================================================================
   Build-process stepper: seven phases sharing one panel. Auto-advances while
   on screen, pauses on hover/focus, and every node is clickable.
   ========================================================================== */
(function () {
  "use strict";

  var root = document.querySelector("[data-bstep]");
  if (!root) return;

  var nodes  = Array.prototype.slice.call(root.querySelectorAll(".bstep__n"));
  var panels = Array.prototype.slice.call(root.querySelectorAll(".bstep__p"));
  var fill   = root.querySelector(".bstep__line i");
  if (!nodes.length || nodes.length !== panels.length) return;

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  /* the section is meant to walk itself through all six steps, so this is
     short and the hover pause is gone; only keyboard focus holds it. */
  var DWELL = 2000;
  var i = 0, timer = null, visible = false, held = false;

  function show(n, restartRing) {
    i = (n + nodes.length) % nodes.length;
    nodes.forEach(function (el, k) {
      el.classList.toggle("is-live", k === i);
      el.classList.toggle("is-done", k < i);
      el.setAttribute("aria-selected", k === i ? "true" : "false");
      if (restartRing && k === i) {
        /* re-trigger the countdown ring from zero */
        var r = el.querySelector(".bstep__ring-fg");
        if (r) { r.style.animation = "none"; void r.offsetWidth; r.style.animation = ""; }
      }
    });
    panels.forEach(function (el, k) { el.classList.toggle("is-live", k === i); });
    if (fill) fill.style.width = (nodes.length > 1 ? (i / (nodes.length - 1)) * 100 : 0) + "%";
  }

  function stop() { if (timer) { clearTimeout(timer); timer = null; } }
  function tick() {
    stop();
    if (reduce || !visible || held) return;
    timer = setTimeout(function () { show(i + 1, true); tick(); }, DWELL);
  }

  nodes.forEach(function (el, k) {
    el.addEventListener("click", function () { show(k, true); tick(); });
  });

  function hold(state) {
    held = state;
    root.classList.toggle("is-paused", state);
    if (state) stop(); else tick();
  }
  root.addEventListener("focusin",  function () { hold(true); });
  root.addEventListener("focusout", function () { hold(false); });

  /* only run the carousel while the section is actually on screen */
  if (window.IntersectionObserver) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (visible) tick(); else stop();
    }, { threshold: 0.25 }).observe(root);
  } else {
    visible = true; tick();
  }

  show(0, false);
})();
