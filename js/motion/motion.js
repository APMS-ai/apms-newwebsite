/* ==========================================================================
   APMS.ai — motion.js
   Pointer-driven interaction: card tilt and magnetic buttons.

   The performance shape of this file matters more than the effects in it. The
   site holds a 16.7ms median frame while scrolling and that is not negotiable,
   so:

     · one rAF loop for everything, not one per element
     · pointer handlers only ever store coordinates. All reading of layout is
       done once on enter and cached; all writing happens in the frame. Nothing
       reads and writes in the same breath, which is what causes layout thrash
     · nothing is bound at all on touch or coarse pointers, or under reduced
       motion, or below 900px
     · will-change is set on enter and released on leave, never left on

   Applied by selector so no page markup needs editing.
   ========================================================================== */
(function () {
  "use strict";

  var mqFine = window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)");
  var mqReduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
  if (!mqFine || !mqFine.matches) return;
  if (mqReduce && mqReduce.matches) return;
  if (window.innerWidth < 900) return;

  /* ------------------------------------------------------------------
     one frame loop, shared
     ------------------------------------------------------------------ */
  var jobs = [];
  var running = false;
  function tick() {
    running = false;
    for (var i = 0; i < jobs.length; i++) jobs[i]();
    jobs.length = 0;
  }
  function schedule(fn) {
    jobs.push(fn);
    if (!running) { running = true; requestAnimationFrame(tick); }
  }

  /* ==================================================================
     1 · card tilt
     ================================================================== */
  var TILT = [
    ".tile", ".mod", ".bento__c", ".arc__card", ".ag-cap", ".ag-pat", ".ag-ind",
    ".mpanel", ".problem__card", ".case", ".fstrip__cell", ".icard", ".istep__pts span"
  ].join(",");

  var MAX = 6;   /* degrees. Past about 8 the type edges start to shimmer. */

  /* Checked live, not once at bind time.
     drum.js marks its cards [data-no-tilt] because the drum is the only writer
     of transform on them, but drum.js loads AFTER this file. A bind-time-only
     skip therefore attached the tilt anyway, and from then on hovering a drum
     card wrote a tilt over the ring's own positioning: the card jittered while
     the pointer sat still, and pointerleave's `transform = ""` cleared the
     ring transform outright, so the card jumped to the centre until the next
     scroll frame put it back. That is the flicker and the overwrite. */
  function tiltBlocked(card) {
    return !!(card.closest && card.closest("[data-no-tilt]"));
  }

  Array.prototype.forEach.call(document.querySelectorAll(TILT), function (card) {
    if (tiltBlocked(card)) return;

    /* js/enhance.js tags these same cards with the legacy `data-tilt`, and
       enhance.css then does two things we do not want: it kills the transform
       outright (`[data-tilt] { transform: none !important }`, left behind when
       that tilt was retired) and it pins `will-change: transform` permanently,
       which this project's performance rules forbid. Dropping the attribute
       retires it properly and leaves this implementation a clean field. */
    card.removeAttribute("data-tilt");
    card.setAttribute("data-tilt3d", "");
    if (getComputedStyle(card).position === "static") card.style.position = "relative";

    var box = null;          /* measured once per enter, never during move */
    var px = 0, py = 0;

    card.addEventListener("pointerenter", function () {
      if (tiltBlocked(card)) return;
      box = card.getBoundingClientRect();
      card.classList.add("is-tilting");
      card.style.willChange = "transform";
    });

    card.addEventListener("pointermove", function (e) {
      if (!box || tiltBlocked(card)) return;
      px = e.clientX; py = e.clientY;
      schedule(function () {
        if (!box) return;
        var x = (px - box.left) / box.width;
        var y = (py - box.top) / box.height;
        /* The transform is written in full rather than through custom
           properties. `rotateX(var(--rx))` kept resolving to the 0deg fallback
           even with the property set inline on the same element, so the card
           lifted but never rotated. Writing the whole value removes the
           substitution from the equation. The sheen still uses properties,
           because those are only read by a background-image. */
        card.style.transform =
          "perspective(1000px) rotateX(" + ((.5 - y) * 2 * MAX).toFixed(2) + "deg)" +
          " rotateY(" + ((x - .5) * 2 * MAX).toFixed(2) + "deg)" +
          " translate3d(0,-6px,0)";
        card.style.setProperty("--px", (x * 100).toFixed(1) + "%");
        card.style.setProperty("--py", (y * 100).toFixed(1) + "%");
      });
    });

    card.addEventListener("pointerleave", function () {
      /* bail before the reset: clearing transform on a drum card throws away
         the ring's positioning, which is the jump-to-centre bug */
      if (tiltBlocked(card)) { box = null; return; }
      box = null;
      card.classList.remove("is-tilting");
      card.style.transform = "";
      /* release the layer once the card has settled back */
      setTimeout(function () { card.style.willChange = "auto"; }, 520);
    });
  });

  /* ==================================================================
     2 · magnetic buttons
     A small pull toward the pointer. 6px is enough to feel intentional
     and small enough that the button never leaves its own hit area.
     ================================================================== */
  var PULL = 6;
  Array.prototype.forEach.call(
    document.querySelectorAll(".btn--primary, .btn--lg, .totop, .ptab"),
    function (btn) {
      btn.setAttribute("data-magnetic", "");
      var box = null, mx = 0, my = 0;

      btn.addEventListener("pointerenter", function () {
        box = btn.getBoundingClientRect();
        btn.style.willChange = "transform";
      });
      btn.addEventListener("pointermove", function (e) {
        if (!box) return;
        mx = e.clientX; my = e.clientY;
        schedule(function () {
          if (!box) return;
          var dx = (mx - (box.left + box.width / 2)) / box.width;
          var dy = (my - (box.top + box.height / 2)) / box.height;
          btn.style.transform = "translate3d(" + (dx * PULL).toFixed(2) + "px," +
                                (dy * PULL).toFixed(2) + "px,0)";
        });
      });
      btn.addEventListener("pointerleave", function () {
        box = null;
        btn.style.transform = "";
        setTimeout(function () { btn.style.willChange = "auto"; }, 480);
      });
    }
  );

  /* ==================================================================
     3 · the cursor ring: removed
     A teal ring used to trail the pointer and swell over anything
     interactive. In a screenshot it read as a stray circle sitting on the
     page rather than as part of the cursor, so it is gone and the real
     cursor is the only cursor. The .cursor styles went with it.
     Removing it also drops a document-level pointermove listener and its
     rAF loop, so the pointer costs nothing at all when nothing is hovered.
     ================================================================== */
})();
