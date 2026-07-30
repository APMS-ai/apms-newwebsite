/* ==========================================================================
   APMS.ai — drum.js
   Six cards on a cylinder, turned by the scroll. Six steps, six cards.

   This is the only pinned ScrollTrigger on the site. Pinning was removed
   everywhere else because it added scroll length to pages that did not need it,
   so the rules here are deliberately strict:

     · desktop only, and only with reduced motion off. Everywhere else the
       markup stays the plain six-card grid it degrades to
     · the pin has a fixed, finite length and always releases
     · motion.js is told to leave these cards alone: a card cannot have its
       transform written by a tilt and by the drum at the same time
     · rotation is transform-only, so it composites and never triggers layout

   The snap is deliberately absent. GSAP's snap scrolls the page itself, and
   Lenis already owns the scroll position; the two fight and the result is a
   section that jitters at the boundaries. Scrubbing across six facets gives the
   stepped feel without a second thing writing scrollTop.
   ========================================================================== */
(function () {
  "use strict";

  var drum = document.querySelector("[data-drum]");
  if (!drum) return;

  var gsap = window.gsap, ST = window.ScrollTrigger;
  if (!gsap || !ST) return;

  var cards = Array.prototype.slice.call(drum.querySelectorAll(".drum__card"));
  var dots = Array.prototype.slice.call(drum.querySelectorAll(".drum__dots li"));
  var ring = drum.querySelector(".drum__ring");
  var stage = drum.querySelector(".drum__stage");
  if (!ring || !stage || cards.length < 2) return;

  var N = cards.length;
  var STEP = 360 / N;

  gsap.registerPlugin(ST);

  gsap.matchMedia().add(
    "(min-width: 901px) and (prefers-reduced-motion: no-preference)",
    function () {
      drum.classList.add("is-drum");

      /* seat each card on its own facet */
      cards.forEach(function (c, i) {
        c.style.setProperty("--a", (i * STEP) + "deg");
        c.setAttribute("data-no-tilt", "");   /* keep motion.js off these */
        c.removeAttribute("data-tilt3d");
      });

      var current = -1;
      function face(idx) {
        if (idx === current) return;
        current = idx;
        for (var i = 0; i < N; i++) {
          cards[i].classList.toggle("is-front", i === idx);
          if (dots[i]) dots[i].classList.toggle("is-on", i === idx);
        }
      }
      face(0);

      var st = ST.create({
        trigger: drum,
        start: "center center",
        /* one viewport-ish of scroll per card after the first: finite, and it
           always ends */
        end: "+=" + Math.round(window.innerHeight * 0.62 * (N - 1)),
        /* the whole block is pinned, not just the stage, so the six labels
           stay on screen and tell you where you are in the sequence */
        pin: drum,
        pinSpacing: true,
        scrub: 0.6,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onUpdate: function (self) {
          var p = self.progress;                 /* 0 .. 1 */
          ring.style.transform = "rotateY(" + (-p * STEP * (N - 1)).toFixed(2) + "deg)";
          face(Math.round(p * (N - 1)));
        }
      });

      /* matchMedia cleanup: leaving a pin behind on a resize past the
         breakpoint strands the section at the wrong scroll position */
      return function () {
        st.kill(true);
        drum.classList.remove("is-drum");
        ring.style.transform = "";
        cards.forEach(function (c) {
          c.classList.remove("is-front");
          c.style.removeProperty("--a");
          c.removeAttribute("data-no-tilt");
        });
        dots.forEach(function (d, i) { d.classList.toggle("is-on", i === 0); });
      };
    }
  );

  /* the pin's length depends on viewport height, so it has to be recomputed */
  window.addEventListener("load", function () { ST.refresh(); });
})();
