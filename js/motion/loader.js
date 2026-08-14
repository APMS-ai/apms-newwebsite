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

  /* Only show it if the page is actually slow.

     A loader may only exist for as long as the page genuinely needs, which is
     what the top of this file already says; it just used to say it and then
     show the curtain anyway. On a warm cache and a decent connection this page
     is painted and its fonts are ready inside 300ms, and a curtain that lifts
     off a page which was never unfinished is half a second of nothing, twice:
     once for the visitor and once in Speed Index, which is measured from the
     pixels and cannot tell a deliberate curtain from a slow page.

     So the element starts invisible. If the page is ready before GRACE, it is
     taken away having never been seen. If it is not, the curtain appears and
     does its job. Fast visitors stop paying for slow ones. */
  var GRACE = 260;
  var shown = false;
  var graceTimer = setTimeout(function () {
    if (done) return;
    shown = true;
    el.classList.add("is-shown");
  }, GRACE);

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

    clearTimeout(graceTimer);

    /* Never shown: remove it now, with no curtain and no hold. */
    if (!shown) {
      el.parentNode && el.parentNode.removeChild(el);
      root.classList.remove("is-loading");
      try { sessionStorage.setItem("apms-seen", "1"); } catch (e) {}
      window.dispatchEvent(new Event("apms:loaded"));
      return;
    }

    /* Shown, so hold long enough for the bar to visibly complete rather than
       flashing on and straight back off. */
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

  /* `load` was the wrong signal. It waits for every script, image and font on
     the page, and the curtain is only hiding the assembly of what you can see:
     measured, load landed at 1.70s while the largest text had been painted at
     0.69s, so the page sat finished behind a curtain for a full second and
     Speed Index paid for all of it.

     What the curtain is actually waiting for is the stylesheet and the fonts,
     because those are what would make the page flash if it were revealed too
     early. document.fonts.ready is exactly that signal, and the stylesheet is
     already parsed by the time any of this runs. `load` stays as a backstop
     for browsers without the Font Loading API, and the 2.2s ceiling stays
     because a font that never arrives must not trap anyone. */
  if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
    document.fonts.ready.then(finish);
  }
  if (document.readyState === "complete") finish();
  else window.addEventListener("load", finish);

  /* Hard ceiling and error escape: the page is never held hostage. */
  setTimeout(finish, 2200);
  window.addEventListener("error", finish, true);
})();
