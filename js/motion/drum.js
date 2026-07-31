/* ==========================================================================
   APMS.ai — drum.js
   Six cards orbiting a ring, turned by the scroll. Six steps, six cards.

   Geometry: each card sits at an angle on a circle seen almost edge on. Its
   angle gives a horizontal position and a depth; depth gives scale, opacity and
   stacking order. The card itself is never rotated, so the text stays square to
   the reader while the ring turns around behind it. That is what keeps all six
   readable at once rather than half of them facing away.

   The whole section is pinned, heading included, so nothing travels up the
   screen while the ring turns. The pin has a fixed length and always releases.

   Fenced in deliberately, because this is the only pinned trigger on the site:
     · desktop only, reduced motion off. Everywhere else it stays a plain grid
     · motion.js is kept off these cards: one owner of transform, not two
     · matchMedia cleanup kills the pin on a resize past the breakpoint
     · no snap. GSAP's snap writes scrollTop and Lenis already owns it; the two
       fight at the boundaries
   ========================================================================== */
(function () {
  "use strict";

  var drums = Array.prototype.slice.call(document.querySelectorAll("[data-drum]"));
  if (!drums.length) return;

  var gsap = window.gsap, ST = window.ScrollTrigger;
  if (!gsap || !ST) return;

  gsap.registerPlugin(ST);
  drums.forEach(build);

  /* Each drum owns its own pin, ring and cleanup. Written as a function per
     drum rather than one shared closure, because the page now has two and a
     shared `current` would have made one section drive the other. */
  function build(drum) {
  var section = drum.closest("section") || drum.parentElement;
  var ring = drum.querySelector(".drum__ring");
  var stage = drum.querySelector(".drum__stage");
  var cards = Array.prototype.slice.call(drum.querySelectorAll(".drum__card"));
  var dots = Array.prototype.slice.call(drum.querySelectorAll(".drum__dots li"));
  if (!ring || !stage || cards.length < 2) return;

  var N = cards.length;

  gsap.matchMedia().add(
    "(min-width: 901px) and (prefers-reduced-motion: no-preference)",
    function () {
      drum.classList.add("is-drum");
      /* the pinned section has to fit one screen, or the ring is clipped at
         the bottom while the heading sits alone at the top */
      section.classList.add("is-drumsec");
      cards.forEach(function (c) {
        c.setAttribute("data-no-tilt", "");
        c.removeAttribute("data-tilt3d");
        c.style.transformStyle = "preserve-3d";
      });

      /* how wide the orbit is. Half the stage, capped so six cards at the
         front of a 1440 screen never run into the gutters. */
      function radius() { return Math.min(430, Math.max(300, stage.offsetWidth * 0.32)); }

      var R = radius();
      var current = -1;

      function place(rot) {
        for (var i = 0; i < N; i++) {
          var a = ((i / N) * 360 + rot) * Math.PI / 180;
          var x = Math.sin(a) * R;
          var z = Math.cos(a);                  /* 1 at the front, -1 at the back */
          var depth = (z + 1) / 2;              /* 0 .. 1 */

          /* Scale and fade with depth so the ring reads as a ring. The floor
             values matter: nothing drops below 0.66 scale or 0.32 opacity, so
             every card stays legible rather than disappearing behind. */
          var scale = 0.66 + depth * 0.34;
          var op = 0.32 + depth * 0.68;

          var c = cards[i];
          c.style.transform = "translate3d(" + x.toFixed(1) + "px,0," +
                              (z * R * 0.55).toFixed(1) + "px) scale(" + scale.toFixed(3) + ")";
          c.style.opacity = op.toFixed(3);
          c.style.zIndex = String(100 + Math.round(z * 100));
        }
        var front = ((Math.round(-rot / (360 / N)) % N) + N) % N;
        if (front !== current) {
          current = front;
          for (var k = 0; k < N; k++) {
            cards[k].classList.toggle("is-front", k === front);
            if (dots[k]) dots[k].classList.toggle("is-on", k === front);
          }
        }
      }

      place(0);

      var st = ST.create({
        trigger: section,
        start: "top top",
        /* finite, and always ends: roughly two thirds of a screen per step */
        end: "+=" + Math.round(window.innerHeight * 0.66 * (N - 1)),
        pin: section,          /* the heading is held still too */
        pinSpacing: true,
        scrub: 0.55,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onRefresh: function () { R = radius(); place(-current * (360 / N) || 0); },
        onUpdate: function (self) {
          /* 0 at card one, -300deg at card six: five intervals for six cards */
          place(-self.progress * (360 / N) * (N - 1));
        }
      });

      return function () {
        st.kill(true);
        drum.classList.remove("is-drum");
        section.classList.remove("is-drumsec");
        cards.forEach(function (c) {
          c.classList.remove("is-front");
          c.removeAttribute("data-no-tilt");
          c.style.transform = "";
          c.style.opacity = "";
          c.style.zIndex = "";
          c.style.transformStyle = "";
        });
        dots.forEach(function (d, i) { d.classList.toggle("is-on", i === 0); });
      };
    }
  );

  }

  window.addEventListener("load", function () { ST.refresh(); });
})();
