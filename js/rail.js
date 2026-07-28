/* ==========================================================================
   APMS.ai — rail.js
   Pinned horizontal card rail. Pins the section and converts vertical scroll
   into sideways travel; cards fade and shrink as they leave the centre, so
   only the one you're "on" reads at full strength.

   Card-class agnostic: the stage declares its own card selector with
   data-agp-cards (defaults to the track's direct children), so the same
   mechanic drives the AI Agents pattern cards and both Industrial IoT rails.

   Every [data-agp] on the page gets its own instance, with its own progress
   bar and counter resolved within its enclosing <section>.

   Degrades to native swipe-scroll when GSAP/ScrollTrigger are missing,
   under reduced-motion, on coarse pointers, or on narrow viewports.
   ========================================================================== */
(function () {
  "use strict";

  var stages = document.querySelectorAll("[data-agp]");
  if (!stages.length) return;
  Array.prototype.forEach.call(stages, initRail);

function initRail(stage) {
  var track = stage.querySelector(".agp__track");
  if (!track) return;
  var sel   = stage.getAttribute("data-agp-cards");
  var cards = Array.prototype.slice.call(sel ? stage.querySelectorAll(sel) : track.children);
  var scope = stage.closest("section") || document;
  var fill  = scope.querySelector(".agp__bar i");
  var count = scope.querySelector(".agp__count b");
  if (!cards.length) return;

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var narrow = window.matchMedia && window.matchMedia("(max-width: 900px)").matches;
  /* Pinning buys a cinematic reveal but costs page length: the pin adds scroll
     distance equal to the rail's travel. That pays off when it replaces a very
     tall stack, and backfires on an already-compact grid. data-agp-native opts
     a stage out, keeping the horizontal scroller with no added height. */
  var forceNative = stage.hasAttribute("data-agp-native");
  var canPin = !!(window.gsap && window.ScrollTrigger) && !reduce && !narrow && !forceNative;

  /* ---------- fallback: native horizontal scroll ---------- */
  function goNative() {
    stage.classList.add("agp--native");
    stage.classList.remove("agp--pinned");
    if (fill) {
      var onScroll = function () {
        var max = stage.scrollWidth - stage.clientWidth;
        var p = max > 0 ? stage.scrollLeft / max : 0;
        fill.style.transform = "scaleX(" + p + ")";
        if (count) count.textContent = String(Math.min(cards.length, Math.round(p * (cards.length - 1)) + 1));
      };
      stage.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
    }
    if (count) count.textContent = "1";

    /* Cards 2..n sit off to the right inside the scroller, so a viewport
       observer never sees them and their [data-reveal] would stay at
       opacity 0 until swiped. Reveal the whole rail once it comes into
       view vertically instead. */
    var showAll = function () { cards.forEach(function (c) { c.classList.add("in"); }); };
    if (window.IntersectionObserver) {
      var ro = new IntersectionObserver(function (es) {
        if (es[0].isIntersecting) { showAll(); ro.disconnect(); }
      }, { threshold: 0.05 });
      ro.observe(stage);
    } else { showAll(); }

    /* ---- carry the rail forward on its own ----
       A horizontal scroller inside a vertical page is easy to miss, so the
       cards advance themselves while the rail is on screen. Any human input
       (pointer, wheel, touch, keyboard, or scrolling the rail by hand) stops
       the auto-advance for good: it should never fight the visitor. */
    var auto = null, held = false, onScreen = false;

    function step() {
      if (held || !onScreen) return;
      var max = stage.scrollWidth - stage.clientWidth;
      if (max <= 0) return;
      var card = cards[0].getBoundingClientRect().width + 18;   /* + track gap */
      var next = stage.scrollLeft + card;
      /* Where the rail overflows by less than one card, a full card step always
         overshoots the end. Wrapping on overshoot meant those rails reset to 0
         on every tick and so never moved at all. Land on the end first, and only
         wrap once there is genuinely nothing left to show. */
      if (next > max) next = stage.scrollLeft >= max - 4 ? 0 : max;
      stage.scrollTo({ left: next, behavior: "smooth" });
    }
    function start() { if (!auto && !held) auto = setInterval(step, 3200); }
    function stop()  { if (auto) { clearInterval(auto); auto = null; } }
    function surrender() { held = true; stop(); }

    ["pointerdown", "wheel", "touchstart", "keydown"].forEach(function (ev) {
      stage.addEventListener(ev, surrender, { passive: true });
    });
    stage.addEventListener("mouseenter", stop);
    stage.addEventListener("mouseleave", start);
    stage.addEventListener("focusin", surrender);

    if (!reduce && window.IntersectionObserver) {
      new IntersectionObserver(function (es) {
        onScreen = es[0].isIntersecting;
        onScreen ? start() : stop();
      }, { threshold: 0.35 }).observe(stage);
    }
  }

  if (!canPin) { goNative(); return; }

  /* ---------- pinned horizontal rail ---------- */
  stage.classList.add("agp--pinned");
  var gsap = window.gsap, ST = window.ScrollTrigger;
  gsap.registerPlugin(ST);

  var trigger = null;

  function distance() {
    return Math.max(0, track.scrollWidth - stage.clientWidth);
  }

  /* Resting state: no inline opacity/transform at all, so the cards look
     normal whenever the rail is not being actively scrubbed. Without this they
     keep whatever paint() last computed and sit half-faded, both before you
     first reach the section and after you have scrolled past it. */
  function rest() {
    cards.forEach(function (c) {
      c.style.opacity = "";
      c.style.transform = "";
      c.classList.remove("is-live");
    });
    if (count) count.textContent = "1";
  }

  /* Card presence: full strength at the centre of the viewport, fading out
     toward both edges. Rect-based so it stays true whatever the easing does. */
  function paint() {
    var mid = window.innerWidth / 2;
    var nearest = 0, best = Infinity;
    for (var i = 0; i < cards.length; i++) {
      var r = cards[i].getBoundingClientRect();
      var d = Math.abs(r.left + r.width / 2 - mid) / window.innerWidth;
      if (d < best) { best = d; nearest = i; }
      var o = Math.max(0.16, 1 - d * 1.9);
      var s = Math.max(0.9, 1 - d * 0.22);
      var y = d * 26;
      cards[i].style.opacity = o.toFixed(3);
      cards[i].style.transform = "translate3d(0," + y.toFixed(1) + "px,0) scale(" + s.toFixed(3) + ")";
      cards[i].classList.toggle("is-live", false);
    }
    cards[nearest].classList.add("is-live");
    if (count) count.textContent = String(nearest + 1);
  }

  function build() {
    if (trigger) { trigger.kill(true); trigger = null; }
    gsap.set(track, { x: 0 });

    var dist = distance();
    if (dist <= 0) { goNative(); return; }

    var tween = gsap.to(track, { x: -dist, ease: "none" });

    trigger = ST.create({
      trigger: stage,
      start: "center center",
      end: "+=" + Math.round(dist * 1.15),
      pin: true,
      pinSpacing: true,
      scrub: 0.8,
      animation: tween,
      invalidateOnRefresh: true,
      onUpdate: function (self) {
        if (fill) fill.style.transform = "scaleX(" + self.progress + ")";
        paint();
      },
      /* hand the cards back when the rail is not in play */
      onEnter: paint,
      onEnterBack: paint,
      onLeave: rest,
      onLeaveBack: rest,
      onRefresh: function (self) { self.isActive ? paint() : rest(); }
    });

    /* only paint if we have loaded straight into the pinned range */
    trigger.isActive ? paint() : rest();
  }

  build();

  /* Rebuild on resize; drop to native if the viewport gets too narrow. */
  var t;
  window.addEventListener("resize", function () {
    clearTimeout(t);
    t = setTimeout(function () {
      var nowNarrow = window.matchMedia("(max-width: 900px)").matches;
      if (nowNarrow) {
        if (trigger) { trigger.kill(true); trigger = null; }
        gsap.set(track, { clearProps: "transform" });
        cards.forEach(function (c) { c.style.opacity = ""; c.style.transform = ""; });
        goNative();
      } else {
        stage.classList.remove("agp--native");
        stage.classList.add("agp--pinned");
        build();
        ST.refresh();
      }
    }, 220);
  });

  /* Fonts/images settling can change card heights and throw off the pin. */
  window.addEventListener("load", function () { ST.refresh(); });
}
})();

