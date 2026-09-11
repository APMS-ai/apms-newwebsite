/* ==========================================================================
   APMS.ai — appvid.js
   The dashboard section's app recording: the one thing markup cannot say
   about a <video>.

   Off-screen. A looping 22-second decode that nobody is looking at is a fan
   spinning up for nothing, and on a phone it is battery. The clip plays while
   it is in view and pauses when it is not. currentTime is left alone, so
   scrolling back picks it up where it was rather than restarting the
   walkthrough from the top.

   It does NOT stop for prefers-reduced-motion, which is a deliberate
   exception and the only one on this site. An earlier version held the first
   frame and put controls on it, which is the correct default for looping
   video - but this clip is the section's whole claim, the heading says the
   app is live, and a still frame of a phone makes that an assertion again.
   Everything else on the page still honours the setting.

   No IntersectionObserver (very old browser): the video keeps the plain
   autoplay-and-loop behaviour the attributes already give it.
   ========================================================================== */
(function () {
  var wrap = document.querySelector("[data-app-video]");
  if (!wrap) return;
  var vid = wrap.querySelector("video");
  if (!vid) return;

  if (!("IntersectionObserver" in window)) return;

  new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) {
        // play() rejects if the tab autoplay policy says no; there is nothing
        // useful to do about that here, and an unhandled rejection is noise.
        var p = vid.play();
        if (p && p.catch) p.catch(function () {});
      } else {
        vid.pause();
      }
    });
  }, { threshold: 0.2 }).observe(vid);
})();
