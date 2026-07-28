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

  setActive(0);
  update();
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
})();
