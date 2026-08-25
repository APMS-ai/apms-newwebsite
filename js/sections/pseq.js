/* ==========================================================================
   APMS.ai — pseq.js
   Drives the pipeline sequence: maps scroll progress through .pseq__track to
   an active step; also adds prev/next buttons and clickable dots that scroll
   to a step. Works with native scroll and Lenis. rAF-throttled.
   ========================================================================== */
(function () {
  "use strict";
  var root = document.querySelector("[data-pseq]");
  if (!root) return;

  var track = root.querySelector(".pseq__track");
  var steps = Array.prototype.slice.call(root.querySelectorAll(".pstep"));
  var prog  = root.querySelector(".pseq__progress");
  var dots  = prog ? Array.prototype.slice.call(prog.querySelectorAll("span")) : [];
  if (!track || !steps.length) return;

  var n = steps.length;
  var current = -1;
  var ticking = false;

  /* ---- build prev/next controls around the dots ---- */
  function iconBtn(dir, label) {
    var b = document.createElement("button");
    b.className = "pseq__btn";
    b.type = "button";
    b.setAttribute("aria-label", label);
    b.innerHTML = dir === "prev"
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';
    return b;
  }
  var prevBtn, nextBtn;
  if (prog) {
    var ctrl = document.createElement("div");
    ctrl.className = "pseq__ctrl";
    prog.parentNode.insertBefore(ctrl, prog);
    prevBtn = iconBtn("prev", "Previous step");
    nextBtn = iconBtn("next", "Next step");
    ctrl.appendChild(prevBtn);
    ctrl.appendChild(prog);
    ctrl.appendChild(nextBtn);
    prevBtn.addEventListener("click", function () { goToStep(current - 1); });
    nextBtn.addEventListener("click", function () { goToStep(current + 1); });
    dots.forEach(function (d, i) { d.addEventListener("click", function () { goToStep(i); }); });
  }

  function setActive(idx) {
    if (idx === current) return;
    current = idx;
    for (var i = 0; i < n; i++) {
      steps[i].classList.toggle("is-active", i === idx);
      steps[i].classList.toggle("is-prev", i < idx);
    }
    for (var d = 0; d < dots.length; d++) dots[d].classList.toggle("is-on", d === idx);
    if (prevBtn) prevBtn.disabled = idx <= 0;
    if (nextBtn) nextBtn.disabled = idx >= n - 1;
  }

  function metrics() {
    var trackTop = track.getBoundingClientRect().top + window.pageYOffset;
    var total = track.offsetHeight - window.innerHeight;
    return { trackTop: trackTop, total: total > 0 ? total : 0 };
  }

  function goToStep(i) {
    if (i < 0 || i >= n) return;
    var m = metrics();
    var y = m.trackTop + ((i + 0.5) / n) * m.total;
    if (window.__lenis && window.__lenis.scrollTo) window.__lenis.scrollTo(y);
    else window.scrollTo({ top: y, behavior: "smooth" });
  }

  function update() {
    ticking = false;
    var m = metrics();
    var scrolled = Math.min(Math.max(window.pageYOffset - m.trackTop, 0), m.total);
    var p = m.total > 0 ? scrolled / m.total : 0;
    var idx = Math.floor(p * n);
    if (idx >= n) idx = n - 1;
    if (idx < 0) idx = 0;
    setActive(idx);
  }

  function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }

  /* ------------------------------------------------------------------
     The unit turns towards the cursor (motion-ai.html only; on the other
     two pages there is no .unit3d and this returns immediately). One angle
     drives all four slides - only the active one is on screen, and keeping
     them in step means arriving at the next unit already turned the way
     you were looking.

     The slides are photographs staged on planes in 3D, so the yaw has to
     stay small - past roughly 16 degrees the eye stops reading a machine
     turning and starts reading a picture tilting. While the pointer is
     over the stage it drives the angle and the idle animation is off;
     when the pointer leaves, the angle eases back to zero and the idle
     animation takes over again. Its keyframes rest at zero for exactly
     that handover, so there is nothing to jump.

     Mouse only: a coarse pointer has no hover to follow, and reduced
     motion gets the still frame the rest of the section gets.
     ------------------------------------------------------------------ */
  (function pointerTurn() {
    var scenes = Array.prototype.slice.call(root.querySelectorAll(".unit3d__scene"));
    if (!scenes.length || !window.matchMedia) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    var stage = root.querySelector(".pseq__sticky") || root;
    var MAX_YAW = 16, MAX_PITCH = 7, EASE = 0.09;
    var toY = 0, toX = 0, atY = 0, atX = 0, raf = 0, holding = false;

    function frame() {
      raf = 0;
      atY += (toY - atY) * EASE;
      atX += (toX - atX) * EASE;
      var t = "rotateY(" + atY.toFixed(2) + "deg) rotateX(" + atX.toFixed(2) + "deg)";
      for (var i = 0; i < scenes.length; i++) scenes[i].style.transform = t;
      if (Math.abs(toY - atY) > 0.05 || Math.abs(toX - atX) > 0.05) raf = requestAnimationFrame(frame);
      else if (!holding) {
        for (var j = 0; j < scenes.length; j++) {
          scenes[j].classList.remove("is-pointing");
          scenes[j].style.transform = "";
        }
      }
    }
    function tick() { if (!raf) raf = requestAnimationFrame(frame); }

    stage.addEventListener("pointermove", function (e) {
      if (e.pointerType && e.pointerType !== "mouse") return;
      var r = stage.getBoundingClientRect();
      if (!r.width || !r.height) return;
      toY = ((e.clientX - r.left) / r.width - 0.5) * 2 * MAX_YAW;
      toX = -((e.clientY - r.top) / r.height - 0.5) * 2 * MAX_PITCH;
      holding = true;
      for (var i = 0; i < scenes.length; i++) scenes[i].classList.add("is-pointing");
      tick();
    }, { passive: true });

    stage.addEventListener("pointerleave", function () {
      holding = false; toY = 0; toX = 0; tick();
    }, { passive: true });
  })();

  setActive(0);
  update();
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
})();
