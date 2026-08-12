/* ==========================================================================
   APMS.ai — legal.js
   Marks the current section in the privacy policy's contents list.

   Progressive enhancement: the list is plain anchor links and works with this
   file absent. All this adds is knowing where you are in sixteen sections.

   It tracks the LAST heading to have crossed the top of the reading area
   rather than whichever section is most visible. Most-visible flickers between
   two entries when a short section sits next to a long one, and picks the
   wrong one entirely while a two-column pair is on screen.
   ========================================================================== */
(function () {
  "use strict";

  var toc = document.querySelector(".legal__toc");
  if (!toc) return;

  var links = Array.prototype.slice.call(toc.querySelectorAll('a[href^="#"]'));
  if (!links.length) return;

  var secs = links
    .map(function (a) {
      var el = document.getElementById(a.getAttribute("href").slice(1));
      return el ? { a: a, el: el } : null;
    })
    .filter(Boolean);
  if (!secs.length) return;

  /* The contents list ships with `open` so it is there without JS and open on
     a desktop, where it is the sidebar. On a phone it is a disclosure and an
     open one costs most of a screen before the policy starts, so close it. The
     media query has to be read here: HTML cannot carry a conditional
     attribute, and CSS cannot open or close a <details>. */
  var narrow = window.matchMedia("(max-width: 899px)");
  function fit() { if (narrow.matches && toc.open) toc.open = false; }
  fit();
  if (narrow.addEventListener) narrow.addEventListener("change", fit);

  var current = null;

  /* A clicked entry stays marked until the reader scrolls for themselves. The
     last section is short and sits at the end of the page, so it can never
     reach the reading line: clicking "Contact us" would scroll to it and then
     mark section 15, which reads as the link not having worked. Cleared by a
     real gesture, not by the scroll the click itself causes. */
  var locked = null;
  ["wheel", "touchstart", "keydown"].forEach(function (ev) {
    window.addEventListener(ev, function () { locked = null; }, { passive: true });
  });

  function mark() {
    /* the line the header clears, plus a little, is what counts as "here" */
    var line = (parseFloat(getComputedStyle(document.documentElement)
      .getPropertyValue("--header-h")) || 74) + 40;

    var pick = secs[0];
    for (var i = 0; i < secs.length; i++) {
      if (secs[i].el.getBoundingClientRect().top <= line) pick = secs[i];
    }
    if (locked) pick = locked;
    /* at the very bottom the last section may never reach the line, so the
       reader would be looking at section 16 with 15 marked */
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
      pick = secs[secs.length - 1];
    }
    if (pick === current) return;
    if (current) current.a.classList.remove("is-here");
    pick.a.classList.add("is-here");
    /* keep the marked entry inside its own scroller without moving the page */
    if (toc.scrollHeight > toc.clientHeight + 4) {
      var r = pick.a.getBoundingClientRect(), t = toc.getBoundingClientRect();
      if (r.top < t.top + 8) toc.scrollTop -= t.top + 8 - r.top;
      else if (r.bottom > t.bottom - 8) toc.scrollTop += r.bottom - (t.bottom - 8);
    }
    current = pick;
  }

  var queued = false;
  function onScroll() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () { queued = false; mark(); });
  }

  /* Lenis drives the scroll, so listen on the window rather than hooking it:
     Lenis still updates scrollY and still emits scroll events. */
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);

  /* Clicking an entry has to land the heading clear of the fixed header.
     scroll-margin-top alone did not: reveals firing in the sections above the
     target change their height a moment after the jump, and the heading ended
     up 26 to 54 pixels high, i.e. partly behind the header. So scroll, then
     re-measure and correct once the layout has settled. Two passes, not a
     loop: a loop that keeps chasing a moving target never stops. */
  function headerGap() {
    return (parseFloat(getComputedStyle(document.documentElement)
      .getPropertyValue("--header-h")) || 74) + 40;   /* header, plus air */
  }

  function jump(el) {
    var gap = headerGap();
    function once() {
      var y = el.getBoundingClientRect().top + window.scrollY - gap;
      if (window.lenis) window.lenis.scrollTo(y, { immediate: true });
      else window.scrollTo(0, y);
    }
    once();
    /* The reveal animations in the sections above the target keep changing
       their height for the better part of a second after the jump, so one
       correction was not enough: three of sixteen headings still came to rest
       under the header, the worst 20px under it. Correct on a short schedule
       instead, stopping as soon as the position is stable or the reader
       touches the page. A fixed schedule, not a loop, so it always ends.
         Each entry aborts if `locked` has been cleared, which is exactly the
       "the reader has scrolled" signal. */
    [90, 240, 500, 900, 1400].forEach(function (ms) {
      setTimeout(function () {
        if (!locked || locked.el !== el) return;
        if (Math.abs(el.getBoundingClientRect().top - gap) > 3) once();
      }, ms);
    });
  }

  links.forEach(function (a) {
    a.addEventListener("click", function (e) {
      var el = document.getElementById(a.getAttribute("href").slice(1));
      if (!el) return;
      e.preventDefault();
      locked = secs.filter(function (x) { return x.el === el; })[0] || null;
      if (locked) mark();
      /* keep the address bar honest so the section is linkable */
      if (window.history && history.replaceState) {
        history.replaceState(null, "", a.getAttribute("href"));
      }
      jump(el);
    });
  });

  /* the same correction for arriving on a #section link from elsewhere */
  if (location.hash) {
    var target = document.getElementById(location.hash.slice(1));
    if (target && secs.some(function (x) { return x.el === target; })) {
      setTimeout(function () { jump(target); }, 60);
    }
  }

  mark();
})();
