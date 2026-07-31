/* ==========================================================================
   APMS.ai — ui-fx.js
   Signature interactions inspired by Inspira UI / Animate UI, in vanilla JS:
   a cursor-follow spotlight glow on cards. Reduced-motion / touch safe.
   ========================================================================== */
(function () {
  "use strict";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var fine   = window.matchMedia && window.matchMedia("(pointer: fine)").matches;
  if (reduce || !fine) return;

  var cards = document.querySelectorAll(".tile, .cap, .mod, .ind, .case");
  Array.prototype.forEach.call(cards, function (card) {
    var raf = null;
    card.addEventListener("pointermove", function (e) {
      if (raf) return;
      raf = requestAnimationFrame(function () {
        raf = null;
        var r = card.getBoundingClientRect();
        card.style.setProperty("--mx", (((e.clientX - r.left) / r.width) * 100).toFixed(1) + "%");
        card.style.setProperty("--my", (((e.clientY - r.top) / r.height) * 100).toFixed(1) + "%");
      });
    }, { passive: true });
  });
})();
