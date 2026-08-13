/* ==========================================================================
   APMS.ai — enhancement layer · behaviour (vanilla, dependency-free)
   Ambient backgrounds · card tilt · magnetic buttons · parallax ·
   SVG draw · radial gauges · live ticker · pill tabs.
   Additive to redesign.js. All motion respects prefers-reduced-motion.
   ========================================================================== */
(function () {
  "use strict";
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var isTouch = matchMedia("(hover: none)").matches;

  function each(sel, root, fn) { Array.prototype.forEach.call((root || document).querySelectorAll(sel), fn); }

  /* theme toggle removed — site runs in its single (dark-led) theme.
     Clear any previously-saved preference so no one is stranded in light mode. */
  try {
    localStorage.removeItem("apms-theme");
    document.documentElement.removeAttribute("data-theme");
  } catch (e) {}

  /* ---------- 1 · ambient backgrounds injected into dark sections ---------- */
  each(".sec--dark, .sec--darker", document, function (sec) {
    if (sec.querySelector(":scope > .aurora")) return;
    if (!reduce) {
      var a = document.createElement("div");
      a.className = "aurora"; a.setAttribute("aria-hidden", "true");
      a.innerHTML = "<span></span><span></span><span></span>";
      sec.insertBefore(a, sec.firstChild);
      var g = document.createElement("div");
      g.className = "gridfield"; g.setAttribute("aria-hidden", "true");
      sec.insertBefore(g, sec.firstChild);
    }
    var sp = document.createElement("div");
    sp.className = "spotlight"; sp.setAttribute("aria-hidden", "true");
    sec.insertBefore(sp, sec.firstChild);
    if (!isTouch && !reduce) {
      sec.addEventListener("pointermove", function (e) {
        var r = sec.getBoundingClientRect();
        sp.style.setProperty("--mx", ((e.clientX - r.left) / r.width) * 100 + "%");
        sp.style.setProperty("--my", ((e.clientY - r.top) / r.height) * 100 + "%");
      }, { passive: true });
    }
  });

  /* ---------- 2 · heading reveals ----------
     Owned entirely by js/motion/scroll-text.js. There used to be a second
     system here: a [data-clip] hook that wrapped a heading into .clip-line
     spans and slid them up. scroll-text.js already animates `.sec__head h2`
     and hero h1s with the page's own data-fx recipe, so any heading carrying
     data-clip was animated twice, and two headings on the same page looked
     different purely by whether they had the attribute. The hook, its observer
     and the .clip-line CSS are all gone; scroll-text.js now also matches
     [data-clip] so the few such headings outside a .sec__head still animate. */

  /* ---------- auto-hook: magnetic on the primary hero/CTA buttons only ----------
     (3D tilt removed site-wide in favour of a restrained, premium clean-lift on hover) */
  each(".cta .btn--primary, .hero .btn--primary", document, function (el) {
    el.classList.add("magnetic");
  });

  /* ---------- 3 · card 3D tilt ---------- */
  if (!reduce && !isTouch) {
    each("[data-tilt]", document, function (card) {
      var max = parseFloat(card.dataset.tilt) || 7;
      card.addEventListener("pointermove", function (e) {
        var r = card.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width - 0.5;
        var py = (e.clientY - r.top) / r.height - 0.5;
        card.classList.add("tilting");
        card.style.transform = "perspective(760px) rotateX(" + (-py * max).toFixed(2) + "deg) rotateY(" + (px * max).toFixed(2) + "deg) translateY(-4px)";
      }, { passive: true });
      card.addEventListener("pointerleave", function () {
        card.classList.remove("tilting");
        card.style.transform = "";
      });
    });
  }

  /* ---------- 4 · magnetic buttons ---------- */
  if (!reduce && !isTouch) {
    each(".magnetic", document, function (btn) {
      btn.addEventListener("pointermove", function (e) {
        var r = btn.getBoundingClientRect();
        var x = (e.clientX - r.left - r.width / 2) * 0.3;
        var y = (e.clientY - r.top - r.height / 2) * 0.4;
        btn.style.transform = "translate(" + x.toFixed(1) + "px," + y.toFixed(1) + "px)";
      }, { passive: true });
      btn.addEventListener("pointerleave", function () { btn.style.transform = ""; });
    });
  }

  /* 5 was a [data-parallax] scroll handler. No page carries that attribute,
     so it was a scroll listener and a rAF that ran on every page to move
     nothing; it went in the cleanup audit. */

  /* ---------- 6 · radial gauges (draw ring + count value on view) ---------- */
  var gauges = Array.prototype.slice.call(document.querySelectorAll(".gauge"));
  if (gauges.length && "IntersectionObserver" in window) {
    var go = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        var g = e.target;
        var pct = parseFloat(g.dataset.val) || 0;
        var circ = 2 * Math.PI * 54;               // r = 54
        var fg = g.querySelector(".gauge__fg");
        var bg = g.querySelector(".gauge__bg");
        if (fg) { fg.style.setProperty("--circ", circ); fg.style.setProperty("--target", circ * (1 - pct / 100)); }
        if (bg) bg.style.setProperty("--circ", circ);
        g.classList.add("in");
        var valEl = g.querySelector(".gauge__val");
        if (valEl) {
          var suf = valEl.dataset.suffix || "%";
          if (reduce) { valEl.textContent = pct + suf; }
          else {
            var t0 = null;
            var frame = function (t) {
              if (t0 === null) t0 = t;
              var p = Math.min((t - t0) / 1500, 1);
              var eased = 1 - Math.pow(1 - p, 4);
              valEl.textContent = Math.round(pct * eased) + suf;
              if (p < 1) requestAnimationFrame(frame);
            };
            requestAnimationFrame(frame);
          }
        }
        go.unobserve(g);
      });
    }, { threshold: 0.5 });
    gauges.forEach(function (g) { go.observe(g); });
  }

  /* ---------- 7 · SVG stroke draw on view ---------- */
  each(".draw-svg path, path.draw", document, function (p) {
    try {
      var len = p.getTotalLength();
      p.style.strokeDasharray = len; p.style.strokeDashoffset = reduce ? 0 : len;
      p.style.transition = "stroke-dashoffset 1.8s var(--ease-out, ease)";
    } catch (err) {}
  });
  if (!reduce && "IntersectionObserver" in window) {
    var dObs = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        each("path", e.target, function (p) { if (p.style.strokeDashoffset) p.style.strokeDashoffset = "0"; });
        dObs.unobserve(e.target);
      });
    }, { threshold: 0.35 });
    each(".draw-svg", document, function (s) { dObs.observe(s); });
  }

  /* ---------- 8 · timeline items reveal ---------- */
  if ("IntersectionObserver" in window) {
    var tObs = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); tObs.unobserve(e.target); } });
    }, { threshold: 0.4 });
    each(".tl__item, .rule", document, function (el) { reduce ? el.classList.add("in") : tObs.observe(el); });
  } else {
    each(".tl__item, .rule", document, function (el) { el.classList.add("in"); });
  }

  /* ---------- 9 · live ticker (gently nudges KPI numbers) ---------- */
  var tickers = Array.prototype.slice.call(document.querySelectorAll("[data-ticker]"));
  if (tickers.length && !reduce) {
    tickers.forEach(function (cell) {
      var base = parseFloat(cell.dataset.ticker);
      var dec = parseInt(cell.dataset.dec, 10) || 0;
      var swing = parseFloat(cell.dataset.swing) || Math.max(1, base * 0.01);
      var suf = cell.dataset.suffix || "";
      setInterval(function () {
        var v = base + (Math.sin(Date.now() / 3200 + base) * swing) * 0.6 + (Math.random() - 0.5) * swing * 0.4;
        cell.textContent = v.toFixed(dec) + suf;
      }, 2000);
    });
  }

  /* ---------- 10 · pill tabs (product tour) ----------
     Removed. The product tour's four tab buttons repeated, word for word, the
     four labelled nodes in the diagram directly above them, so the strip is
     gone and the nodes are the tabs. js/sections/loop.js owns that, including
     the roles, the arrow keys and the auto-advance. Nothing else on the site
     uses .ptab. */

  /* ---------- 11 · to-top button reveal (redesign.js handles primary; guard) ---------- */
  /* handled in redesign.js — nothing to do here */

})();
