/* ==========================================================================
   APMS.ai — drumrail.js
   "One platform, end to end" as a horizontal rail.

   The rail scrolls natively (touch swipe, trackpad, keyboard, the scrollbar
   that CSS hides). What this file adds is the pace: every horizontal gesture
   and every arrow press moves exactly ONE card, animated over 300ms, instead
   of the instant jump the browser would do. A card that slides is a card that
   tells you the row scrolls; a card that teleports tells you nothing.

   Three things fall out of that:

   · A gesture lock. Trackpads fire dozens of wheel events per swipe, so
     without one, a single flick would queue six steps. While a step is
     running, further wheel events are swallowed.
   · Snapping is switched off for the length of the tween. scroll-snap and a
     per-frame scrollLeft write are two things steering the same value, and
     the browser wins the argument halfway through.
   · Vertical wheel is never touched. Turning page scroll into sideways travel
     traps the visitor in the section, which is the opposite of the point.

   Under reduced motion the step is instant and the opening nudge never runs.
   Lenis must not eat the gesture, so the ring carries data-scrollable, which
   is on smooth.js's exemption list (CLAUDE.md #4).
   ========================================================================== */
(function () {
  "use strict";

  var rails = document.querySelectorAll("[data-drumrail]");
  if (!rails.length) return;

  var STEP_MS = 300;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  Array.prototype.forEach.call(rails, init);

  function init(drum) {
    var ring = drum.querySelector(".drum__ring");
    if (!ring) return;
    var cards = Array.prototype.slice.call(ring.querySelectorAll(".drum__card"));
    if (cards.length < 2) return;

    var dots   = Array.prototype.slice.call(drum.querySelectorAll(".drum__dots li"));
    var arrows = Array.prototype.slice.call(drum.querySelectorAll("[data-drum-dir]"));
    var busy = false, raf = 0;

    function maxLeft() { return ring.scrollWidth - ring.clientWidth; }

    /* Which card is at the left edge right now. Rounded to the nearest, so a
       rail left mid-swipe still reports the card the visitor is looking at. */
    function current() {
      var x = ring.scrollLeft, best = 0, dist = Infinity;
      for (var i = 0; i < cards.length; i++) {
        var d = Math.abs(cards[i].offsetLeft - ring.offsetLeft - x);
        if (d < dist) { dist = d; best = i; }
      }
      return best;
    }

    function targetOf(i) {
      i = Math.max(0, Math.min(cards.length - 1, i));
      return Math.max(0, Math.min(maxLeft(), cards[i].offsetLeft - ring.offsetLeft));
    }

    /* ---------- the 300ms step ---------- */
    function glide(to, done) {
      cancelAnimationFrame(raf);
      var from = ring.scrollLeft, delta = to - from;
      if (Math.abs(delta) < 1) { if (done) done(); return; }
      if (reduce) { ring.scrollLeft = to; sync(); if (done) done(); return; }

      busy = true;
      var snap = ring.style.scrollSnapType;
      ring.style.scrollSnapType = "none";
      var t0 = performance.now();

      (function frame(now) {
        var p = Math.min(1, (now - t0) / STEP_MS);
        /* easeOutCubic: leaves quickly, settles softly, so the movement is
           legible at 300ms rather than reading as a glitch */
        ring.scrollLeft = from + delta * (1 - Math.pow(1 - p, 3));
        if (p < 1) { raf = requestAnimationFrame(frame); }
        else {
          ring.style.scrollSnapType = snap;
          busy = false; sync(); if (done) done();
        }
      })(t0);
    }

    function step(dir) { glide(targetOf(current() + dir)); }

    /* ---------- indicators ----------
       There is one dot per STOP, not per card. Three and a bit cards are on
       screen at 1440, so the rail only has four resting positions and six dots
       would leave two that never light whatever you do. Recomputed on resize,
       because the visible count changes with the viewport. */
    var stops = cards.length;
    function measure() {
      var one = cards.length > 1
        ? cards[1].offsetLeft - cards[0].offsetLeft
        : cards[0].getBoundingClientRect().width;
      stops = one > 0 ? Math.min(cards.length, Math.ceil(maxLeft() / one) + 1) : 1;
      dots.forEach(function (li, n) { li.hidden = n >= stops; });
    }

    function sync() {
      var end = ring.scrollLeft >= maxLeft() - 2;
      var i = end ? stops - 1 : Math.min(current(), stops - 1);
      dots.forEach(function (li, n) { li.classList.toggle("is-on", n === i); });
      ring.classList.toggle("is-end", end);
      arrows.forEach(function (b) {
        var d = Number(b.getAttribute("data-drum-dir"));
        b.disabled = d < 0 ? ring.scrollLeft <= 2 : end;
      });
    }

    /* ---------- input ---------- */
    arrows.forEach(function (b) {
      b.addEventListener("click", function () { step(Number(b.getAttribute("data-drum-dir"))); });
    });

    /* Horizontal intent only. A trackpad swipe or a tilt wheel is one step;
       anything vertical belongs to the page. */
    ring.addEventListener("wheel", function (e) {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      if (busy) return;
      step(e.deltaX > 0 ? 1 : -1);
    }, { passive: false });

    ring.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.preventDefault();
      if (!busy) step(e.key === "ArrowRight" ? 1 : -1);
    });

    /* a swipe or a drag on the scrollbar still updates the dots */
    ring.addEventListener("scroll", function () { if (!busy) sync(); }, { passive: true });
    var rt;
    window.addEventListener("resize", function () {
      clearTimeout(rt);
      rt = setTimeout(function () { measure(); sync(); }, 160);
    });
    measure(); sync();
    /* card heights settle once the fonts land, which moves nothing sideways,
       but the widths can change with a fallback font */
    window.addEventListener("load", function () { measure(); sync(); });

    /* ---------- the opening nudge ----------
       One 300ms move to the second card and back, the first time the rail is
       on screen. It is the same motion a gesture produces, which is the point:
       it shows what the row does before anyone has to guess. Any real input
       cancels it, and it never runs twice. */
    if (reduce || !window.IntersectionObserver) return;
    var nudged = false;
    ["pointerdown", "wheel", "touchstart", "keydown"].forEach(function (ev) {
      ring.addEventListener(ev, function () { nudged = true; }, { passive: true, once: true });
    });
    var io = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting || nudged) return;
      nudged = true; io.disconnect();
      setTimeout(function () {
        var back = ring.scrollLeft;
        glide(targetOf(1), function () {
          setTimeout(function () { glide(back); }, 460);
        });
      }, 520);
    }, { threshold: 0.45 });
    io.observe(drum);
  }
})();
