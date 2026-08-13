/* ==========================================================================
   APMS.ai — drift.js
   Every horizontal card rail on the site, drifting slowly and continuously.

   One engine, one rAF loop, all rails. It drives whatever scrolls sideways and
   holds cards:

     .drum--rail .drum__ring      the platform rail on index
     [data-agp].agp--native       the pattern, floor, feature and Vision rails

   Rules it plays by:

   · 24px a second. A rail that moves at reading pace is a rail you notice
     without it demanding anything. Sub-pixel position is kept in JS, because
     scrollLeft rounds and a 0.4px-per-frame step would round to zero forever.
   · It bounces. These rails have real ends, so at each end it holds for a
     beat and drifts back the other way. A rail that jumped to the start would
     read as a glitch, and cloning the cards to fake an infinite loop would
     duplicate every link and heading in the page.
   · It yields. A gesture or a scrollbar drag stops it for 1.6s; hover and
     focus stop it for as long as they last, because someone with a cursor on
     a card is reading it. It never fights the visitor for the same scrollLeft.
   · It sleeps. Off screen or on a hidden tab it does nothing at all, so it
     costs nothing while you are reading the rest of the page.
   · It does not run under reduced motion. Continuous travel is exactly the
     category CLAUDE.md #4 says never to re-enable.

   Snapping is off on any rail this drives (see rail.css / drum.css). scroll
   snap plus a per-frame scrollLeft write are two things steering one value,
   and every pause would end with the browser yanking the rail to the nearest
   card.

   Other scripts that move the same rails (drumrail.js's 300ms card step) call
   window.APMSDrift.hold(el, ms) so there is only ever one writer.
   ========================================================================== */
(function () {
  "use strict";

  var SELECTOR = ".drum--rail .drum__ring, [data-agp].agp--native";
  var SPEED    = 24;     /* px per second */
  var END_HOLD = 1100;   /* ms paused at each end before turning back */
  var RESUME   = 1600;   /* ms after the visitor lets go */

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var items = [], loop = 0, last = 0;

  /* --------------------------------------------------------------------
     public: pause a rail while something else owns its scrollLeft
     -------------------------------------------------------------------- */
  window.APMSDrift = {
    hold: function (el, ms) {
      var it = find(el);
      if (it) suspend(it, ms || RESUME);
    },
    /* rails that only exist after another script has run (rail.js adds
       .agp--native on scroll-in) are picked up by calling this again */
    scan: scan,
    /* every rail this is driving, for checking one from the console */
    rails: function () { return items; }
  };

  if (reduce) return;
  scan();
  window.addEventListener("load", scan);
  document.addEventListener("visibilitychange", function () {
    document.hidden ? stop() : start();
  });

  function find(el) {
    for (var i = 0; i < items.length; i++) if (items[i].el === el) return items[i];
    return null;
  }

  function scan() {
    if (reduce) return;
    var found = document.querySelectorAll(SELECTOR);
    for (var i = 0; i < found.length; i++) if (!find(found[i])) add(found[i]);
    start();
  }

  function add(el) {
    var it = {
      el: el,
      pos: el.scrollLeft,
      dir: 1,
      held: 0,          /* timestamp until which it stays still */
      last: -1,         /* last whole pixel written to scrollLeft */
      hover: false,
      focus: false,
      onScreen: false
    };
    items.push(it);

    /* Anything the visitor does owns the rail for the next moment. wheel and
       touchstart are passive: this only steps out of the way, it never
       preventDefault()s a gesture. */
    ["pointerdown", "wheel", "touchstart", "keydown"].forEach(function (ev) {
      el.addEventListener(ev, function () { suspend(it, RESUME); }, { passive: true });
    });
    /* Hover and focus are states, not moments: a timed suspend would start the
       rail moving again under a cursor that never left, which is exactly the
       moment someone is trying to read a card. */
    el.addEventListener("mouseenter", function () { it.hover = true; }, { passive: true });
    el.addEventListener("mouseleave", function () { it.hover = false; suspend(it, 240); }, { passive: true });
    el.addEventListener("focusin",  function () { it.focus = true; }, { passive: true });
    el.addEventListener("focusout", function () { it.focus = false; suspend(it, 600); }, { passive: true });

    if (window.IntersectionObserver) {
      new IntersectionObserver(function (es) {
        it.onScreen = es[0].isIntersecting;
        /* the rail may have been scrolled by hand while it was away */
        it.pos = el.scrollLeft;
      }, { threshold: 0.15 }).observe(el);
    } else { it.onScreen = true; }
  }

  function suspend(it, ms) {
    it.held = performance.now() + ms;
    /* a gesture may land the rail anywhere; carry on from wherever it is */
    it.pos = it.el.scrollLeft;
    it.last = -1;
  }

  function start() { if (!loop && !document.hidden) { last = 0; loop = requestAnimationFrame(tick); } }
  function stop()  { if (loop) { cancelAnimationFrame(loop); loop = 0; } }

  function tick(now) {
    loop = requestAnimationFrame(tick);
    var dt = last ? Math.min(64, now - last) : 16;   /* a tab that was busy must not jump */
    last = now;

    for (var i = 0; i < items.length; i++) {
      var it = items[i], el = it.el;
      if (!it.onScreen || it.hover || it.focus || now < it.held) continue;

      var max = el.scrollWidth - el.clientWidth;
      if (max <= 1) continue;

      /* Somebody else moved it (a card step, an anchor, a swipe with inertia
         still running): follow rather than argue. */
      if (Math.abs(el.scrollLeft - it.pos) > 2) { it.pos = el.scrollLeft; it.last = -1; }

      it.pos += it.dir * SPEED * dt / 1000;

      if (it.pos >= max) { it.pos = max; it.dir = -1; it.held = now + END_HOLD; }
      else if (it.pos <= 0) { it.pos = 0; it.dir = 1; it.held = now + END_HOLD; }

      /* Whole pixels only. At 24px/s roughly two frames in five land on the
         pixel already written, and writing scrollLeft is the part that can
         cost a frame, so those writes are skipped. The sub-pixel position
         still lives in it.pos, so the speed is unchanged.
         Honest note on the measurement: in headless software rendering the
         drift was not distinguishable from the rail held still (33.3ms median
         either way), so this is a precaution, not a measured fix. */
      var px = Math.round(it.pos);
      if (px !== it.last) { el.scrollLeft = px; it.last = px; }
    }
  }
})();
