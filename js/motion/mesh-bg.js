/* ==========================================================================
   APMS.ai — mesh-bg.js
   Stripe-style animated mesh gradient (Whatamesh) behind flat CTA sections.
   Teal-family palette, dark enough to keep white copy readable.
   Reduced-motion / missing-lib / WebGL safe.
   ========================================================================== */
(function () {
  "use strict";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) return;

  function hasWebGL() {
    try { var c = document.createElement("canvas"); return !!(window.WebGLRenderingContext && (c.getContext("webgl") || c.getContext("experimental-webgl"))); }
    catch (e) { return false; }
  }
  if (!hasWebGL()) return;

  /* Same reasoning as the hero canvas in site-fx.js: skip touch and small
     screens entirely. And only ever one of these per page. Each is its own
     WebGL context, and browsers cap how many a document may hold before they
     start evicting the oldest, which shows up as a background that silently
     stops animating. */
  var fine = window.matchMedia && window.matchMedia("(pointer: fine)").matches;
  if (!fine || window.innerWidth < 900) return;

  var sections = Array.prototype.slice.call(document.querySelectorAll(".cta, [data-mesh]"), 0, 1);
  if (!sections.length) return;

  /* 24 KB fetched only where a mesh will actually be drawn, for the same
     reason three.js is no longer a script tag: a phone should not pay for it. */
  if (!window.Gradient) {
    var lib = document.createElement("script");
    lib.src = "js/vendor/mesh-gradient.js";
    lib.onload = draw;
    lib.onerror = function () {};
    document.head.appendChild(lib);
  } else { draw(); }

  function draw() {
  Array.prototype.forEach.call(sections, function (sec, i) {
    if (getComputedStyle(sec).position === "static") sec.style.position = "relative";
    var canvas = document.createElement("canvas");
    canvas.className = "mesh-canvas";
    canvas.id = "apms-mesh-" + i;
    canvas.setAttribute("aria-hidden", "true");
    // Whatamesh reads these CSS custom props for its 4 gradient colors.
    canvas.style.setProperty("--gradient-color-1", "#063d31");
    canvas.style.setProperty("--gradient-color-2", "#0b8368");
    canvas.style.setProperty("--gradient-color-3", "#0b1826");
    canvas.style.setProperty("--gradient-color-4", "#17c99b");
    sec.insertBefore(canvas, sec.firstChild);
    sec.classList.add("has-mesh");
    try {
      var g = new window.Gradient();
      g.initGradient("#" + canvas.id);
    } catch (e) {
      sec.classList.remove("has-mesh");
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    }
  });
  }
})();
