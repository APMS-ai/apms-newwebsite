/* ==========================================================================
   APMS.ai — loop.js
   Keeps the "four moves, one loop" diagram in step with the tab strip below
   it, and lets the nodes act as tabs themselves. CSS :has() already handles
   the highlight in modern browsers; this covers everything else and adds the
   click behaviour.
   ========================================================================== */
(function () {
  "use strict";

  var wrap = document.querySelector("[data-ptabs]");
  if (!wrap) return;

  var loop = wrap.querySelector(".aloop");
  if (!loop) return;

  var nodes = Array.prototype.slice.call(loop.querySelectorAll(".aloop__n"));
  var tabs  = Array.prototype.slice.call(wrap.querySelectorAll(".ptab"));
  if (!nodes.length || !tabs.length) return;

  function sync() {
    var live = wrap.querySelector(".ppane.is-active");
    var key = live && live.dataset ? live.dataset.pane : null;
    nodes.forEach(function (n) {
      n.classList.toggle("is-live", n.dataset.goto === key);
    });
  }

  /* Clicking a node selects the matching tab. */
  nodes.forEach(function (n) {
    n.addEventListener("click", function () {
      var key = n.dataset.goto;
      var tab = tabs.filter(function (t) { return t.dataset.tab === key; })[0];
      if (tab) tab.click();
    });
    /* keyboard reachable, same as the tabs themselves */
    n.setAttribute("tabindex", "0");
    n.setAttribute("role", "button");
    n.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); n.click(); }
    });
  });

  /* enhance.js owns the tab switching, so just follow whatever it does. */
  tabs.forEach(function (t) { t.addEventListener("click", function () { setTimeout(sync, 0); }); });
  sync();
})();
