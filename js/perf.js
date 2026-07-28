/* ==========================================================================
   APMS.ai — perf.js
   Keeps the frame budget free so the smooth scrolling actually feels smooth.

   The problem this solves, measured with a rAF profiler while scrolling:

     page            median frame   frames over 20ms   running animations
     index.html          33.4ms         78%                  181
     solutions.html      33.6ms         84%                  174
     ai-agents.html      33.2ms         56%                  138
     signin.html         16.7ms          0%                    0

   180 concurrent animations is 30fps, and about 80% of them were in sections
   scrolled well out of view. Nothing about the Lenis configuration can rescue
   a compositor that is already late; the work itself has to go away.

   Three things happen here:
     1 · CSS animations pause for any section outside the viewport
     2 · SMIL (<animate>) pauses too, since animation-play-state cannot touch it
     3 · the Vanta WebGL hero canvas stops rendering once the hero is gone

   Everything resumes a screen before it comes back, so nothing is ever seen
   frozen or caught halfway through an entrance.
   ========================================================================== */
(function () {
  "use strict";

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!("IntersectionObserver" in window)) return;

  /* ------------------------------------------------------------------
     1 + 2 · pause offscreen sections
     ------------------------------------------------------------------ */
  var zones = [];
  Array.prototype.push.apply(zones, document.querySelectorAll("section"));
  /* the footer animates its own bits and sits outside any section */
  Array.prototype.push.apply(zones, document.querySelectorAll(".ft"));

  if (zones.length) {
    var zoneObserver = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        var el = entries[i].target;
        var idle = !entries[i].isIntersecting;
        el.classList.toggle("fx-idle", idle);

        /* SMIL lives on its own timeline and ignores animation-play-state */
        var svgs = el.__svgs || (el.__svgs = el.querySelectorAll("svg"));
        for (var s = 0; s < svgs.length; s++) {
          var svg = svgs[s];
          if (typeof svg.pauseAnimations !== "function") continue;
          try { idle ? svg.pauseAnimations() : svg.unpauseAnimations(); } catch (e) {}
        }
      }
    }, {
      /* a full screen of slack either side: sections wake up before they
         are reached, so a fast flick never lands on a frozen console */
      rootMargin: "100% 0px 100% 0px",
      threshold: 0
    });

    for (var z = 0; z < zones.length; z++) zoneObserver.observe(zones[z]);
  }

  /* ------------------------------------------------------------------
     3 · the hero's WebGL canvas
     Vanta keeps its rAF id on `.req` and re-arms it at the end of
     animationLoop, so cancelling the pending frame stops it dead and
     calling the loop once starts it again.
     ------------------------------------------------------------------ */
  var heroBg = document.querySelector(".vanta-bg");
  if (heroBg && !reduce) {
    var vantaPaused = false;
    var heroObserver = new IntersectionObserver(function (entries) {
      var fx = window.__vanta;
      if (!fx) return;
      var visible = entries[0].isIntersecting;
      if (!visible && !vantaPaused) {
        if (fx.req) window.cancelAnimationFrame(fx.req);
        vantaPaused = true;
      } else if (visible && vantaPaused) {
        vantaPaused = false;
        if (typeof fx.animationLoop === "function") fx.animationLoop();
      }
    }, { rootMargin: "0px", threshold: 0 });
    heroObserver.observe(heroBg);

    /* a background tab should never render either */
    document.addEventListener("visibilitychange", function () {
      var fx = window.__vanta;
      if (!fx) return;
      if (document.hidden) {
        if (fx.req) window.cancelAnimationFrame(fx.req);
        vantaPaused = true;
      } else if (vantaPaused && heroBg.getBoundingClientRect().bottom > 0) {
        vantaPaused = false;
        if (typeof fx.animationLoop === "function") fx.animationLoop();
      }
    });
  }
})();
