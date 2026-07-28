/* ==========================================================================
   APMS.ai — polish.js
   Premium reveal cascade. Staggers the entrance of grouped [data-reveal]
   children so sections resolve in sequence instead of all at once.
   Runs after redesign.js / enhance.js. Reduced-motion safe.
   ========================================================================== */
(function () {
  "use strict";
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  // Containers whose direct [data-reveal] children should cascade.
  var GROUPS = ".caps,.mods,.tiles,.grid2,.grid3,.grid4,.inds,.steps,.cases,.faq,.stats,.logos,.bento,.split";
  var STEP = 0.06;   // seconds between siblings
  var CAP  = 0.42;   // never delay more than this

  function cascade(group) {
    var kids = group.children, i = 0;
    for (var n = 0; n < kids.length; n++) {
      var k = kids[n];
      if (k.nodeType !== 1 || !k.hasAttribute("data-reveal")) continue;
      if (k.hasAttribute("data-reveal-delay")) { i++; continue; } // respect authored delays
      var d = Math.min(i * STEP, CAP);
      k.style.transitionDelay = d.toFixed(2) + "s";
      i++;
    }
  }

  var groups = document.querySelectorAll(GROUPS);
  for (var g = 0; g < groups.length; g++) cascade(groups[g]);
})();
