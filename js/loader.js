/* ==========================================================================
   APMS.ai — loader.js

   Rules this follows, because a loader is the easiest thing to get wrong:
     · it can never trap anyone. A 2.2s ceiling dismisses it whatever the
       network is doing, and any error dismisses it immediately
     · once per tab. sessionStorage, so moving around the site does not replay it
     · reduced motion gets no curtain at all
     · it never blocks input: pointer-events go away the moment it starts leaving
   ========================================================================== */
(function () {
  "use strict";

  var root = document.documentElement;
  var el = document.getElementById("apms-loader");
  if (!el) return;

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var seen = false;
  try { seen = sessionStorage.getItem("apms-seen") === "1"; } catch (e) {}

  /* Already seen this tab, or motion is unwanted: take it away now. */
  if (seen || reduce) {
    el.parentNode && el.parentNode.removeChild(el);
    root.classList.remove("is-loading");
    return;
  }

  var bar = el.querySelector(".ldr__bar");
  var done = false;
  var started = Date.now();
  var progress = 0;

  function grow(to) {
    progress = Math.max(progress, Math.min(to, 1));
    if (bar) bar.style.transform = "scaleX(" + progress + ")";
  }

  /* Creep forward so the bar reflects that something is happening, but never
     reach the end on its own: the end means loaded. */
  grow(0.15);
  var creep = setInterval(function () {
    grow(progress + (1 - progress) * 0.12);
  }, 180);

  function finish() {
    if (done) return;
    done = true;
    clearInterval(creep);
    grow(1);

    /* Hold only long enough for the bar to visibly complete. On a fast
       connection that is the whole loader, which is the correct outcome. */
    var minimum = 380;
    var waited = Date.now() - started;
    var wait = Math.max(0, minimum - waited);

    setTimeout(function () {
      el.style.pointerEvents = "none";     /* input works during the curtain */
      el.classList.add("is-done");
      root.classList.remove("is-loading");
      try { sessionStorage.setItem("apms-seen", "1"); } catch (e) {}

      /* Remove it once the curtain has left, so it costs nothing afterwards. */
      var gone = function () { el.parentNode && el.parentNode.removeChild(el); };
      el.addEventListener("transitionend", gone, { once: true });
      setTimeout(gone, 1200);              /* in case the transition never fires */

      window.dispatchEvent(new Event("apms:loaded"));
    }, wait);
  }

  if (document.readyState === "complete") finish();
  else window.addEventListener("load", finish);

  /* Hard ceiling and error escape: the page is never held hostage. */
  setTimeout(finish, 2200);
  window.addEventListener("error", finish, true);
})();
