/* ==========================================================================
   APMS.ai — loop.js
   The "one loop, always turning" diagram on index.html.

   It used to be a static diagram plus a strip of four tab buttons below it,
   and a comet on a 7-second SMIL loop that had nothing to do with which step
   was selected. Two problems with that:

     · the tab strip read "01 · Monitor / 02 · Analyse / 03 · Predict /
       04 · Act", which is exactly what the four labelled nodes above it
       already said. The same four words twice, one on top of the other.
     · the loop was called a loop but never travelled. Nothing connected the
       highlighted node to the pulse going round the track.

   So the nodes ARE the tabs now, and the diagram advances by itself: the
   teal fill grows along the track from the live node to the next one, the
   comet rides its leading edge, and the copy panel changes when it arrives.
   Click a node to jump to it; that also stops the auto-advance, because
   something that keeps moving under a reader who has just chosen where to
   look is a nuisance rather than a feature.

   Position along the track is measured, not hand-written: each node's centre
   is matched to its nearest point on the flow path by sampling. That way the
   three responsive layouts (wide racetrack, tall ring, phone strip) all work
   from their own geometry with no per-layout constants to keep in sync.
   ========================================================================== */
(function () {
  "use strict";

  var wrap = document.querySelector("[data-ptabs]");
  if (!wrap) return;

  var loop = wrap.querySelector(".aloop");
  if (!loop) return;

  var panes = Array.prototype.slice.call(wrap.querySelectorAll(".ppane"));
  if (!panes.length) return;

  /* the order the loop runs in, taken from the panes so the markup stays the
     single source of truth for how many steps there are */
  var order = panes.map(function (p) { return p.dataset.pane; });

  var reduce = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;

  var DWELL = 3200;   /* how long a step holds before moving on */
  var TRAVEL = 780;   /* how long the fill takes to reach the next node */

  /* --------------------------------------------------------------- booting
     None of the below runs until the diagram is nearly on screen.

     Measuring is the expensive part: three responsive layouts, each sampled
     600 times along its flow path with getPointAtLength to find where the
     nodes sit. Doing that at load put a single 673ms task on the main thread
     for a diagram that is well below the fold and may never be scrolled to.
     An IntersectionObserver with 400px of margin has it measured before it can
     be seen, and the first pointer or wheel is a second trigger for the same
     work in case the observer never fires.
     ------------------------------------------------------------------------ */
  var booted = false;
  function boot() {
    if (booted) return;
    booted = true;

    /* ---------------------------------------------------------------- layouts
       One entry per responsive SVG. Only one is displayed at a time, but they
       are all measured up front: getTotalLength works on a display:none path,
       and measuring lazily would mean measuring during a resize. */
    var layouts = Array.prototype.slice.call(loop.querySelectorAll(".aloop__svg"))
      .map(function (svg) {
        var flows = Array.prototype.slice.call(svg.querySelectorAll(".aloop__flow"));
        var nodes = Array.prototype.slice.call(svg.querySelectorAll(".aloop__n"));
        var comets = Array.prototype.slice.call(
          svg.querySelectorAll(".aloop__comet, .aloop__comet-halo"));
        if (!flows.length || !nodes.length) return null;

        var lens = flows.map(function (f) { return f.getTotalLength(); });
        var total = lens.reduce(function (a, b) { return a + b; }, 0);

        /* a point at `d` along the whole flow set, treating the paths as one
           continuous run in document order */
        function pointAt(d) {
          var left = d;
          for (var i = 0; i < flows.length; i++) {
            if (left <= lens[i] || i === flows.length - 1) {
              return flows[i].getPointAtLength(Math.max(0, Math.min(lens[i], left)));
            }
            left -= lens[i];
          }
          return flows[0].getPointAtLength(0);
        }

        /* Where does each node sit along the track? Sample and take the
           nearest point. 600 samples on a ~1850-unit path is about 3 units of
           resolution, which is well inside a 30-unit node. */
        var SAMPLES = 600;
        var at = {};
        nodes.forEach(function (n) {
          var disc = n.querySelector(".aloop__disc");
          var cx = parseFloat(disc.getAttribute("cx"));
          var cy = parseFloat(disc.getAttribute("cy"));
          var best = 0, bestD = Infinity;
          for (var s = 0; s <= SAMPLES; s++) {
            var d = (total * s) / SAMPLES;
            var p = pointAt(d);
            var dist = (p.x - cx) * (p.x - cx) + (p.y - cy) * (p.y - cy);
            if (dist < bestD) { bestD = dist; best = d; }
          }
          at[n.dataset.goto] = best;
        });

        /* The flow is a drawn progress line now, not a marching dash pattern.
           The dash animation in loop.css is switched off by .is-driven. */
        flows.forEach(function (f, i) {
          f.classList.add("is-driven");
          f.style.strokeDasharray = lens[i] + " " + lens[i];
          f.style.strokeDashoffset = lens[i];
        });

        /* fill the combined run up to `d` */
        function fill(d) {
          var left = d;
          for (var i = 0; i < flows.length; i++) {
            var shown = Math.max(0, Math.min(lens[i], left));
            flows[i].style.strokeDashoffset = lens[i] - shown;
            left -= lens[i];
          }
          var p = pointAt(d);
          comets.forEach(function (c) {
            c.setAttribute("cx", p.x);
            c.setAttribute("cy", p.y);
          });
        }

        /* The comets were positioned by SMIL animateMotion, which would fight
           the cx/cy set above. Stop it and let JS own the position. */
        comets.forEach(function (c) {
          Array.prototype.slice.call(c.querySelectorAll("animateMotion, set"))
            .forEach(function (a) { a.parentNode.removeChild(a); });
          c.setAttribute("visibility", "visible");
        });

        return { svg: svg, nodes: nodes, at: at, total: total, fill: fill };
      })
      .filter(Boolean);

    if (!layouts.length) return;

    /* -------------------------------------------------------------- selection */
    var index = 0;
    var timer = null;
    var raf = null;
    var stopped = reduce;   /* reduced motion: never auto-advance */

    function show(key) {
      panes.forEach(function (p) { p.classList.toggle("is-active", p.dataset.pane === key); });
      layouts.forEach(function (L) {
        L.nodes.forEach(function (n) {
          var live = n.dataset.goto === key;
          n.classList.toggle("is-live", live);
          n.setAttribute("aria-selected", live ? "true" : "false");
          n.setAttribute("tabindex", live ? "0" : "-1");
        });
      });
    }

    /* Travel from the live node to the node at `to`, then select it. Wrapping
       past the last node means running to the end of the track (1.0) rather
       than backwards to 0, or the fill would rewind across the whole diagram. */
    function travel(from, to, done) {
      if (raf) { cancelAnimationFrame(raf); raf = null; }
      var wrapRound = to === 0;
      var start = null;
      function frame(t) {
        if (start === null) start = t;
        var k = Math.min(1, (t - start) / TRAVEL);
        var e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;  /* easeInOutQuad */
        layouts.forEach(function (L) {
          var a = L.at[order[from]];
          var b = wrapRound ? L.total : L.at[order[to]];
          L.fill(a + (b - a) * e);
        });
        if (k < 1) { raf = requestAnimationFrame(frame); return; }
        raf = null;
        if (wrapRound) layouts.forEach(function (L) { L.fill(L.at[order[0]]); });
        if (done) done();
      }
      raf = requestAnimationFrame(frame);
    }

    function goTo(next, animate) {
      var from = index;
      index = next;
      if (!animate) {
        layouts.forEach(function (L) { L.fill(L.at[order[index]]); });
        show(order[index]);
        return;
      }
      travel(from, index, function () { show(order[index]); });
    }

    function schedule() {
      clearTimeout(timer);
      if (stopped) return;
      timer = setTimeout(function () {
        goTo((index + 1) % order.length, true);
        schedule();
      }, DWELL);
    }

    /* Auto-advance only matters while the diagram is on screen: a loop turning
       behind the reader is wasted frames, and perf.js cannot pause a rAF. */
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { schedule(); }
        else { clearTimeout(timer); }
      });
    }, { threshold: 0.25 });
    io.observe(loop);

    /* ----------------------------------------------------------- interaction */
    layouts.forEach(function (L) {
      L.svg.setAttribute("role", "tablist");
      L.nodes.forEach(function (n, i) {
        var key = n.dataset.goto;
        var pane = panes.filter(function (p) { return p.dataset.pane === key; })[0];
        n.setAttribute("role", "tab");
        n.setAttribute("tabindex", i === 0 ? "0" : "-1");
        n.setAttribute("aria-selected", i === 0 ? "true" : "false");
        if (pane) {
          pane.id = pane.id || "ploop-" + key;
          pane.setAttribute("role", "tabpanel");
          n.setAttribute("aria-controls", pane.id);
        }
        /* the label is inside the SVG, so give the tab an accessible name */
        var lbl = n.querySelector(".aloop__lbl");
        if (lbl) n.setAttribute("aria-label", lbl.textContent);

        function pick() {
          stopped = true;             /* the reader is steering now */
          clearTimeout(timer);
          var to = order.indexOf(key);
          if (to === index) return;
          goTo(to, !reduce && to === (index + 1) % order.length);
        }
        n.addEventListener("click", pick);
        n.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); return; }
          var step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1
                   : e.key === "ArrowLeft"  || e.key === "ArrowUp"   ? -1 : 0;
          if (!step) return;
          e.preventDefault();
          stopped = true;
          clearTimeout(timer);
          goTo((index + step + order.length) % order.length, false);
          var live = L.nodes.filter(function (m) { return m.dataset.goto === order[index]; })[0];
          if (live) live.focus();
        });
      });
    });

    /* Pointer over the diagram holds the current step, so a reader can look at
       one node without it sliding away. It resumes on leave, unlike a click. */
    loop.addEventListener("pointerenter", function () { clearTimeout(timer); });
    loop.addEventListener("pointerleave", function () { schedule(); });

    goTo(0, false);
  }

  if (window.IntersectionObserver) {
    var bootIo = new IntersectionObserver(function (es) {
      if (es.some(function (e) { return e.isIntersecting; })) { bootIo.disconnect(); boot(); }
    }, { rootMargin: "400px 0px" });
    bootIo.observe(loop);
  } else { boot(); }
  if (window.APMSWake) window.APMSWake(boot);
})();