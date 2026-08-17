/* ==========================================================================
   APMS.ai — netbg.js
   The hero's particle network. Replaces VANTA.NET and three.js.

   Why this file exists, measured on a 4 Mbit connection with the CPU throttled
   to a mid-range laptop:

     dist/js/index.js        47 KB gz     arrives  1.1s
     dist/css/index.css      34 KB gz     arrives  0.2s
     index.html              28 KB gz     arrives  0.1s
     three.min.js           148 KB gz     arrives  8.0s   <-- one file
     vanta.net.min.js         4 KB gz     arrives  7.0s

   three.js alone was larger than the entire rest of the page put together, it
   was fetched last, and the hero background therefore appeared 8.8s after
   navigation - 5.4s after the visitor moved the mouse and woke the site. That
   is the lag, and none of it was buying anything a general-purpose 3D engine
   is for: VANTA.NET draws dots, joins the near ones with lines, and drifts.

   So it is drawn directly on a 2D canvas instead. Same picture, same colours,
   same mouse parallax, ~4 KB, and it lives inside the page bundle - no request
   at all, so the background is up on the first frame after wake instead of
   five seconds later.

   Compatibility kept deliberately:
     · the element is still .vanta-bg and the hero still gets .has-vanta, so
       every rule in css/base/polish.css applies unchanged, including the
       scrim that keeps the headline readable
     · window.__vanta still exposes .req and .animationLoop(), which is the
       exact surface js/core/perf.js cancels and re-arms to pause the hero when
       it scrolls away or the tab is hidden

   js/vendor/three.min.js and js/vendor/vanta.net.min.js are now unreferenced.
   ========================================================================== */
(function () {
  "use strict";

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) return;

  /* Same gate the WebGL version used: a phone gets the static hero, because
     smooth scrolling is worth more there than a decorative mesh. */
  var fine = window.matchMedia && window.matchMedia("(pointer: fine)").matches;
  if (!fine || window.innerWidth < 900) return;

  var hero = document.querySelector(".phero") || document.querySelector(".hero");
  if (!hero) return;

  var TEAL = [46, 224, 180];          /* #2ee0b4, as VANTA was configured */
  var INK = "#070f19";                /* --ink-900, the old backgroundColor */

  var canvas, ctx, w = 0, h = 0, pts = [], spacing = 0, maxDist = 0;
  var cx = 0, cy = 0;                   /* hero centre, the roll's axis */
  function byX(a, b) { return a.x - b.x; }
  var mx = 0, my = 0, tx = 0, ty = 0;   /* mouse parallax, eased */
  var t = 0;

  function build() {
    var rect = hero.getBoundingClientRect();
    w = Math.max(1, Math.round(rect.width));
    h = Math.max(1, Math.round(rect.height));

    /* Pixel ratio 1, exactly as the WebGL version was forced to. A soft
       background does not repay four times the fragment work on a retina
       panel, and this is fill-rate bound, not detail bound. */
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";

    /* A grid, jittered. A purely random field clumps and leaves holes; the
       grid is what makes it read as a *network* rather than as noise, and it
       is what VANTA.NET's `spacing` was doing too.

       The grid is built larger than the hero by MARGIN on every side. The
       whole field drifts now (see frame()), so points have to exist outside
       the visible box or the edges would empty out as it moved. */
    var cols = Math.max(4, Math.round(w / 128));
    var rows = Math.max(3, Math.round(h / 128));
    spacing = Math.max(w / cols, h / rows);

    /* Sized from what the drift in frame() can actually do, with slack:
         drift      (78 + 34) * max par 1.6      = 179px
         roll       ((h + 2*MARGIN)/2) * 0.055   =  ~38px
         wobble     spacing * 0.09               =  ~12px
                                                   -------
                                                    229px
       2.1 * spacing is ~275px at a 1440-wide hero, so there is real slack
       rather than the 7px the first pass left. Points outside the box cost
       almost nothing now that the pair loop breaks on x. */
    var MARGIN = spacing * 2.1;
    var fw = w + MARGIN * 2, fh = h + MARGIN * 2;
    cols = Math.round(fw / spacing);
    rows = Math.round(fh / spacing);
    cx = w / 2;
    cy = h / 2;

    /* Reach, not VANTA's literal maxDistance/spacing ratio of 1.17. That ratio
       is in its own 3D world units, and copying the number rather than the
       result gave a web where each point only ever reached its immediate
       neighbours: short segments, few of them, and nothing like the long lines
       that cross the real hero. At 1.6 a point links to everything within
       about two cells, which is what produces the long diagonals and the
       triangular cells the original is made of. */
    maxDist = spacing * 1.6;

    pts = [];
    for (var i = 0; i <= cols; i++) {
      for (var j = 0; j <= rows; j++) {
        /* Depth stands in for the perspective camera: far points are smaller,
           dimmer, and drift less. It is the whole of what the third dimension
           was contributing to this picture. Floored well above zero - at 0.45
           the far half of the field faded almost to nothing and the web looked
           thin, where the original keeps every point clearly drawn. */
        var z = 0.70 + Math.random() * 0.30;
        pts.push({
          bx: -MARGIN + (i / cols) * fw + (Math.random() - 0.5) * spacing * 0.7,
          by: -MARGIN + (j / rows) * fh + (Math.random() - 0.5) * spacing * 0.7,
          z: z,

          /* How far this point is carried by the field's drift. This is the
             parallax, and it is the thing that makes the motion read as a
             camera moving through a cloud rather than as dots wobbling: near
             points sweep noticeably further than far ones, so the web appears
             to have depth while keeping its shape. */
          par: 0.45 + z * 1.15,

          /* A small residual wobble on top, so the field is not perfectly
             rigid. Deliberately about a tenth of what it used to be - when
             this was the *only* motion, each point orbited its own ellipse and
             the web pulsed in place instead of flowing anywhere. */
          p1: Math.random() * Math.PI * 2,
          p2: Math.random() * Math.PI * 2,
          s1: 0.00022 + Math.random() * 0.00018,
          s2: 0.00019 + Math.random() * 0.00016,
          a: spacing * (0.04 + Math.random() * 0.05),
          x: 0, y: 0
        });
      }
    }
  }

  /* Clock read from the frame timestamp, not incremented by a constant.

     This used to be `t += 16`, which silently assumes every display runs at
     60Hz. On a 120Hz or 144Hz panel rAF fires twice as often, so the field
     drifted at double or triple speed and the parallax snapped - the effect
     was tied to the monitor rather than to time. Elapsed milliseconds make
     every rate below mean the same thing everywhere.

     `first` also absorbs the gap after perf.js pauses the loop offscreen:
     without it the field would jump forward by however long the hero spent
     out of view when it resumed. */
  var t0 = 0, last = 0;
  function frame(now) {
    if (typeof now !== "number") now = performance.now();
    if (!t0) { t0 = now; last = now; }
    var dt = now - last;
    /* a backgrounded tab can hand back a gap of seconds; clamp so the field
       eases on rather than teleporting */
    if (dt > 100) { t0 += dt - 16; dt = 16; }
    last = now;
    t = now - t0;

    /* Ease the parallax rather than tracking the cursor exactly: the old
       version moved a camera, and a hard-tracked field feels twitchy. Scaled
       by dt for the same reason the drift is - at a fixed 0.045 per frame
       this settled twice as fast on a 120Hz screen. */
    var k = Math.min(1, 0.045 * (dt / 16.667));
    tx += (mx - tx) * k;
    ty += (my - ty) * k;

    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, w, h);

    var i, j, n = pts.length, p, q;

    /* The field moves as one, which is the whole point.

       VANTA flew a camera through a cloud of points that were themselves
       nearly fixed, so the web held its shape and swept across the frame, with
       near points crossing further than far ones. The first version of this
       gave every point its own little orbit instead: a still frame looked
       right, but nothing ever went anywhere - the web pulsed in place.

       So: one drift vector for the entire field, scaled per point by `par`,
       plus a slow roll about the centre. Both are slow sines with periods that
       do not divide into each other, so the field keeps arriving somewhere new
       for minutes without ever repeating visibly, and - unlike a constant
       velocity - it never has to wrap a point around the edge, which would
       snap every line attached to it. */
    /* Amplitudes are bounded by the margin the grid was built with. Peak
       displacement is (78+34) * the largest `par`, which is 1.6, so 179px
       against a margin of 1.8 * spacing - about 236px at this width. Raising
       these without raising MARGIN in build() is how you get the field
       drifting far enough to expose an empty edge. */
    var gx = Math.sin(t * 0.000165) * 78 + Math.sin(t * 0.000071) * 34;
    var gy = Math.cos(t * 0.000217) * 60 + Math.cos(t * 0.000053) * 28;

    /* the camera roll. Tiny - a few degrees - but it is what stops the drift
       from reading as a flat slide, and it is why the web appears to turn. */
    var rot = Math.sin(t * 0.0000581) * 0.055;
    var cosR = Math.cos(rot), sinR = Math.sin(rot);

    for (i = 0; i < n; i++) {
      p = pts[i];

      /* rigid roll about the hero's centre, so the network keeps its shape */
      var rx = p.bx - cx, ry = p.by - cy;
      var bx = cx + rx * cosR - ry * sinR;
      var by = cy + rx * sinR + ry * cosR;

      p.x = bx + gx * p.par + Math.cos(t * p.s1 + p.p1) * p.a + tx * p.z;
      p.y = by + gy * p.par + Math.sin(t * p.s2 + p.p2) * p.a + ty * p.z;
    }

    /* Sorted by x so the pair loop can stop instead of scanning.

       Growing the grid past the visible box, which the drift requires, took
       the point count at 2560x1440 from 144 to 384 - and the naive pair loop
       is quadratic, so that is 73k pairs a frame and it cost 6fps. Sorted, the
       inner loop breaks the moment q is further right than p's reach, which
       makes the work proportional to the number of points actually within
       range of each other rather than to n squared.

       Array.sort on a nearly-sorted array of a few hundred is cheap, and this
       one is nearly sorted every frame: the field drifts as a unit, so the
       left-to-right order of points barely changes between frames. */
    pts.sort(byX);

    /* Lines first, dots over them: a dot half-covered by the lines meeting it
       looks like a smudge. */
    ctx.lineWidth = 1.1;
    for (i = 0; i < n; i++) {
      p = pts[i];
      for (j = i + 1; j < n; j++) {
        q = pts[j];
        var dx = q.x - p.x;
        if (dx > maxDist) break;              /* sorted: nothing further right is in range */
        var dy = p.y - q.y;
        if (dy > maxDist || dy < -maxDist) continue;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d > maxDist) continue;
        /* Fade with distance so links form and dissolve rather than snapping
           on and off at the threshold.

           Depth is averaged, not multiplied. Multiplying two depths squares
           the dimming - two mid-depth points at 0.7 gave 0.49 of an already
           low base, which is how the whole web ended up a barely-visible
           grey-green. Averaging keeps a line as bright as the points it
           joins, which is what the original does. */
        var a = (1 - d / maxDist) * 1.05 * ((p.z + q.z) * 0.5);
        if (a < 0.012) continue;
        ctx.strokeStyle = "rgba(" + TEAL[0] + "," + TEAL[1] + "," + TEAL[2] + "," + a.toFixed(3) + ")";
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(q.x, q.y);
        ctx.stroke();
      }
    }

    /* The dots are the thing the eye actually reads as "nodes", so they sit
       near full opacity and are a touch larger than the line weight. At half
       this they disappeared against the lines and the hero read as a bare
       wireframe rather than a network. */
    for (i = 0; i < n; i++) {
      p = pts[i];
      ctx.fillStyle = "rgba(" + TEAL[0] + "," + TEAL[1] + "," + TEAL[2] + "," + (0.95 * p.z).toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.0 * p.z + 0.6, 0, Math.PI * 2);
      ctx.fill();
    }

    fx.req = window.requestAnimationFrame(frame);
  }

  /* The shape perf.js drives: it cancels .req to pause and calls
     .animationLoop() to resume, so both have to keep meaning what they did. */
  var fx = {
    req: 0,
    animationLoop: function () {
      window.cancelAnimationFrame(fx.req);
      fx.req = window.requestAnimationFrame(frame);
    },
    destroy: function () {
      window.cancelAnimationFrame(fx.req);
      if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
    }
  };

  function start() {
    var bg = document.createElement("div");
    bg.className = "vanta-bg";
    bg.setAttribute("aria-hidden", "true");

    canvas = document.createElement("canvas");
    canvas.style.display = "block";
    bg.appendChild(canvas);

    ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;                         /* nothing to fall back from: the static hero stays */

    hero.classList.add("has-vanta");          /* CSS mutes the static grid and lifts the copy */
    hero.insertBefore(bg, hero.firstChild);

    build();
    window.__vanta = fx;

    var rt;
    window.addEventListener("resize", function () {
      clearTimeout(rt);
      rt = setTimeout(build, 200);
    }, { passive: true });

    window.addEventListener("mousemove", function (e) {
      /* ±26px across the viewport, scaled per point by depth */
      mx = (e.clientX / window.innerWidth - 0.5) * 52;
      my = (e.clientY / window.innerHeight - 0.5) * 52;
    }, { passive: true });

    window.addEventListener("beforeunload", fx.destroy);

    fx.req = window.requestAnimationFrame(frame);
  }

  /* Started immediately, not on the first interaction - this is the one effect
     on the site that deliberately does not wait.

     Everything else here is gated on APMSWake because a tab nobody has touched
     should not be doing decorative work. That was right for the old hero for a
     second reason too: it was 601 KB of three.js, and starting it at load put
     a 148 KB download and a WebGL context inside the window Lighthouse
     measures. But it also meant the network only began appearing when the
     visitor moved the mouse, and then only after the download - measured, six
     seconds after the headline was already readable, which is a hero that
     visibly assembles itself in front of you.

     This version is ~4 KB in the page bundle with nothing to fetch, so the
     reason for the gate is gone: the first frame costs one canvas clear and
     about a hundred points. It draws on the next frame after this script runs,
     which is the frame right after the headline paints, so the two arrive
     together.

     What still applies: reduced motion, coarse pointers and narrow screens all
     returned at the top of this file and never get here, and perf.js stops the
     loop the moment the hero scrolls off or the tab is hidden. */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
