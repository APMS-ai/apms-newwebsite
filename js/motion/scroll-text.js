/* ==========================================================================
   APMS.ai — scroll-text.js
   Anime.js powered heading reveals on scroll. Each PAGE gets a different
   style, chosen by <body data-fx="...">. Splits headings into word units
   (preserving nested spans like .accent) and staggers them into view.
   Fully guarded: reduced-motion, missing-anime, and errors fall back to
   plain visible text.
   ========================================================================== */
(function () {
  "use strict";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || !window.anime) return;

  var anime = window.anime;
  var STYLE = (document.body && document.body.getAttribute("data-fx")) || "fadeup";

  // per-page animation recipes (properties fed to anime for each word unit)
  var RECIPES = {
    fadeup: { opacity: [0, 1], translateY: [26, 0], duration: 720, easing: "easeOutQuint", stagger: 55 },
    slide:  { opacity: [0, 1], translateX: [-34, 0], duration: 700, easing: "easeOutQuint", stagger: 45 },
    blur:   { opacity: [0, 1], filter: ["blur(12px)", "blur(0px)"], translateY: [14, 0], duration: 780, easing: "easeOutCubic", stagger: 60 },
    scale:  { opacity: [0, 1], scale: [0.7, 1], duration: 700, easing: "easeOutBack", stagger: 50 },
    rotate: { opacity: [0, 1], rotate: [-7, 0], translateY: [22, 0], duration: 720, easing: "easeOutQuint", stagger: 50 },
    wave:   { opacity: [0, 1], translateY: [30, 0], duration: 760, easing: "easeOutElastic(1, .7)", stagger: 42 },
    glow:   { opacity: [0, 1], translateY: [16, 0], duration: 820, easing: "easeOutSine", stagger: 55 },
    char:   { opacity: [0, 1], translateY: [20, 0], duration: 560, easing: "easeOutQuint", stagger: 22, chars: true }
  };
  var recipe = RECIPES[STYLE] || RECIPES.fadeup;

  /* [data-clip] is in this list because enhance.js no longer animates those
     headings; without it the handful that sit outside a .sec__head would not
     animate at all. */
  var targets = document.querySelectorAll(
    ".phero h1, .hero h1, .sec__head h2, [data-clip], [data-fx-text]");

  function splitUnits(el, byChar) {
    var frag = document.createDocumentFragment();
    var nodes = Array.prototype.slice.call(el.childNodes);
    nodes.forEach(function (node) {
      if (node.nodeType === 3) {                         // text node
        /* Always split on whitespace FIRST, even when animating per character.
           Every unit becomes an inline-block, and a line may break between any
           two of them, so a bare character split lets the browser break inside
           a word: "Everything it takes t" / "o run a smart factory" is what
           about.html actually rendered, and "Transforming factorie" / "s into".
           Characters are therefore nested inside a per-word wrapper that
           carries white-space: nowrap, so a break can only land at a real
           space. */
        node.textContent.split(/(\s+)/).forEach(function (word) {
          if (word === "") return;
          if (/^\s+$/.test(word)) { frag.appendChild(document.createTextNode(word)); return; }
          if (!byChar) {
            var one = document.createElement("span");
            one.className = "st-w";
            one.textContent = word;
            frag.appendChild(one);
            return;
          }
          var wrap = document.createElement("span");
          wrap.className = "st-word";
          word.split("").forEach(function (ch) {
            var s = document.createElement("span");
            s.className = "st-w";
            s.textContent = ch;
            wrap.appendChild(s);
          });
          frag.appendChild(wrap);
        });
      } else if (node.nodeType === 1 && node.tagName === "BR") {
        frag.appendChild(node.cloneNode(true));          // keep line breaks intact
      } else if (node.nodeType === 1) {
        node.classList.add("st-w");                      // treat inline element (e.g. .accent) as one unit
        frag.appendChild(node);
      } else {
        frag.appendChild(node.cloneNode(true));
      }
    });
    el.textContent = "";
    el.appendChild(frag);
  }

  /* A heading already on screen when the page opens must not start invisible.

     Largest Contentful Paint is only recorded once the largest text is
     actually painted, and text at opacity 0 is not painted. The hero headline
     is the LCP element on every page here, so fading it in from nothing meant
     LCP was not the moment the page drew the headline, it was the moment the
     reveal finished: measured, 2.36 seconds of pure render delay behind an
     11ms server response.

     So the first screen's headings keep their opacity and move instead. Same
     reveal to look at, drawn from the first frame. Everything below the fold
     is unchanged: by the time it is scrolled to, the fade costs nothing. */
  function onFirstScreen(el) {
    var r = el.getBoundingClientRect();
    return r.top < (window.innerHeight || 0);
  }

  function prep(el) {
    try {
      var above = onFirstScreen(el);
      splitUnits(el, !!recipe.chars);
      el.classList.add("st-split");
      if (above) el.setAttribute("data-st-solid", "");
      var units = el.querySelectorAll(".st-w");
      if (!above) {
        for (var i = 0; i < units.length; i++) units[i].style.opacity = "0";
      }
      return units.length ? el : null;
    } catch (e) { el.classList.remove("st-split"); return null; }
  }

  function play(el) {
    var solid = el.hasAttribute("data-st-solid");
    var props = {
      targets: el.querySelectorAll(".st-w"),
      duration: recipe.duration,
      easing: recipe.easing,
      delay: anime.stagger(recipe.stagger)
    };
    if (!solid) props.opacity = recipe.opacity;
    if (recipe.translateY) props.translateY = recipe.translateY;
    if (recipe.translateX) props.translateX = recipe.translateX;
    if (recipe.scale)      props.scale = recipe.scale;
    if (recipe.rotate)     props.rotate = recipe.rotate;
    if (recipe.filter)     props.filter = recipe.filter;
    /* Promise the layers only while the run is actually happening. .st-w used
       to carry a permanent will-change (transform, opacity and filter) from
       fx.css: 41 promoted layers on index alone, held for the life of the page
       because headings re-arm rather than unobserve. */
    el.classList.add("st-run");
    props.complete = function () { el.classList.remove("st-run"); };
    anime(props);
  }

  /* Put a heading back to its pre-animation state. anime.remove() first, or a
     run still in flight would keep writing over the reset. */
  function rearm(el) {
    var units = el.querySelectorAll(".st-w");
    anime.remove(units);
    if (el.hasAttribute("data-st-solid")) {
      /* re-arm the movement but never the opacity: this one is on the first
         screen and is allowed to disappear only when it is scrolled away */
      for (var s0 = 0; s0 < units.length; s0++) units[s0].style.transform = "";
      return;
    }
    el.classList.remove("st-run");   /* and give the layers back */
    for (var i = 0; i < units.length; i++) {
      units[i].style.opacity = "0";
      units[i].style.transform = "";
      units[i].style.filter = "";
    }
  }

  var prepared = [];
  for (var t = 0; t < targets.length; t++) { var p = prep(targets[t]); if (p) prepared.push(p); }

  if ("IntersectionObserver" in window) {
    /* Kept observed rather than unobserved after the first play, so the heading
       animates again on the way back up. Leaving the view resets its units to
       the hidden state; anime() is called fresh on each entry, so an
       interrupted run is simply replaced rather than queued behind. */
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { play(e.target); }
        else { rearm(e.target); }
      });
    }, { threshold: 0.25, rootMargin: "0px 0px -8% 0px" });
    prepared.forEach(function (el) { io.observe(el); });
  } else {
    prepared.forEach(play);
  }
})();
