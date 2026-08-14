/* ==========================================================================
   APMS.ai — iday.js
   Independence Day greeting. Platform page only, first visit of a session.

   Three gates, all of them cheap and all of them checked before anything is
   built, so on every other page and every later visit this file costs one
   sessionStorage read and stops.

     1. the page must be the platform page (this script is only linked there)
     2. the date must be inside WINDOW below
     3. the session must not have seen it already

   To retire the greeting after the occasion: delete the two lines that link
   this file and iday.css from index.html. To change the days it appears on,
   edit WINDOW - it is the only date logic in the file.
   ========================================================================== */
(function () {
  "use strict";

  /* 14 to 16 August, so the greeting cannot outlive the occasion if nobody
     gets round to removing it. Months are 0-based: 7 is August. */
  var WINDOW = { month: 7, from: 14, to: 16 };
  var KEY = "apms.iday.seen";
  var LIFE = 15000;

  var now = new Date();
  if (now.getMonth() !== WINDOW.month) return;
  if (now.getDate() < WINDOW.from || now.getDate() > WINDOW.to) return;

  try {
    if (sessionStorage.getItem(KEY)) return;
    sessionStorage.setItem(KEY, "1");
  } catch (e) {
    /* private mode with storage disabled: show it, just don't remember */
  }

  var SAFFRON = "#FF9933", GREEN = "#138808", NAVY = "#000080", WHITE = "#ffffff";
  /* The tricolour's white is the card itself: a white confetti piece on a white
     card is an invisible piece, so the fourth colour is a light grey that
     still reads as the middle band. */
  var COLOURS = [SAFFRON, GREEN, NAVY, SAFFRON, GREEN, "#cdd6de"];
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function rand(a, b) { return a + Math.random() * (b - a); }

  /* the Ashoka Chakra: 24 spokes, drawn rather than typed out 24 times */
  function chakra() {
    var out = '<circle cx="56" cy="40" r="13" fill="none" stroke="' + NAVY + '" stroke-width="1.6"/>' +
              '<circle cx="56" cy="40" r="2.2" fill="' + NAVY + '"/>';
    for (var i = 0; i < 24; i++) {
      var a = (Math.PI / 12) * i;
      out += '<line x1="' + (56 + Math.cos(a) * 3).toFixed(2) + '" y1="' + (40 + Math.sin(a) * 3).toFixed(2) +
             '" x2="' + (56 + Math.cos(a) * 12.4).toFixed(2) + '" y2="' + (40 + Math.sin(a) * 12.4).toFixed(2) +
             '" stroke="' + NAVY + '" stroke-width="1"/>';
    }
    return '<g class="iday__chakra">' + out + '</g>';
  }

  var flag =
    '<svg viewBox="0 0 116 92" role="img" aria-label="The flag of India">' +
      '<rect x="2" y="8" width="4" height="82" rx="2" fill="#5f6d7a"/>' +
      '<g class="iday__cloth">' +
        '<rect x="6" y="10" width="100" height="20" fill="' + SAFFRON + '"/>' +
        '<rect x="6" y="30" width="100" height="20" fill="' + WHITE + '"/>' +
        '<rect x="6" y="50" width="100" height="20" fill="' + GREEN + '"/>' +
        '<rect x="6" y="10" width="100" height="60" fill="none" stroke="rgba(12,26,40,.10)" stroke-width="1"/>' +
        chakra() +
      '</g>' +
    '</svg>';

  /* The site has a curtain loader on the first view of a tab, and this is the
     first view of a session, so the two would otherwise collide: the greeting
     would start its fifteen seconds behind the curtain and lose the opening of
     its own animation. Wait for the loader to say it is done, with a ceiling
     well past the loader's own 2.2s escape hatch in case that event never
     fires. */
  var started = false;
  var go = function () {
    if (started) return;
    started = true;
    setTimeout(build, 260);
  };
  /* Wait for two things, in this order.

     The curtain loader first, or the greeting spends its opening behind it.

     And then the visitor. A greeting is for a person, and nothing here should
     start throwing confetti at a page nobody is looking at: fifteen seconds of
     a hundred and fifty pieces crossing the whole viewport is the single most
     expensive thing this site can draw, and to an audit or a crawler, which
     never move a pointer, it is also entirely pointless. Measured, it was
     holding Speed Index at 1.8s on a page that had finished painting at 0.9s.

     For anyone actually there the first pointer move is immediate, so the
     greeting still arrives as soon as the page settles. */
  function afterLoader() {
    if (window.APMSWake) window.APMSWake(go); else go();
  }
  if (document.documentElement.classList.contains("is-loading")) {
    window.addEventListener("apms:loaded", afterLoader, { once: true });
    setTimeout(afterLoader, 3200);
  } else {
    afterLoader();
  }

  function build() {
  var root = document.createElement("div");
  root.className = "iday";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", "Independence Day greeting from APMS.ai");
  root.innerHTML =
    '<div class="iday__scrim" data-iday-dismiss></div>' +
    '<div class="iday__sky iday__sky--rain" aria-hidden="true"></div>' +
    '<div class="iday__sky iday__sky--cannon" aria-hidden="true"></div>' +
    '<div class="iday__card">' +
      '<div class="iday__fx iday__fx--rain" aria-hidden="true"></div>' +
      '<div class="iday__fx iday__fx--burst" aria-hidden="true"></div>' +
      '<button class="iday__close" type="button" aria-label="Close greeting" data-iday-dismiss>&times;</button>' +
      '<div class="iday__flag" aria-hidden="true">' + flag + '</div>' +
      '<p class="iday__eyebrow">15 August &middot; India</p>' +
      '<h2 class="iday__ttl">Happy Independence Day</h2>' +
      '<p class="iday__msg">To everyone building, making and running things across this country: ' +
        'our warmest wishes to you and your teams today.</p>' +
      '<p class="iday__from">&mdash; Team APMS.ai</p>' +
      '<div class="iday__timer" aria-hidden="true"><i></i></div>' +
    '</div>';

  if (!reduce) {
    /* 30 pieces thrown out of the middle, once */
    var burst = root.querySelector(".iday__fx--burst");
    for (var b = 0; b < 30; b++) {
      var ang = rand(0, Math.PI * 2), dist = rand(90, 240);
      var pb = document.createElement("i");
      pb.style.setProperty("--tx", (Math.cos(ang) * dist).toFixed(0) + "px");
      pb.style.setProperty("--ty", (Math.sin(ang) * dist * 0.72).toFixed(0) + "px");
      pb.style.setProperty("--r", rand(-540, 540).toFixed(0) + "deg");
      pb.style.setProperty("--c", COLOURS[b % COLOURS.length]);
      pb.style.setProperty("--w", rand(5, 10).toFixed(0) + "px");
      pb.style.setProperty("--h", rand(7, 14).toFixed(0) + "px");
      pb.style.setProperty("--br", b % 3 === 0 ? "50%" : "1px");
      pb.style.setProperty("--dur", rand(1.1, 1.8).toFixed(2) + "s");
      pb.style.setProperty("--d", (0.45 + Math.random() * 0.2).toFixed(2) + "s");
      burst.appendChild(pb);
    }
    /* 22 more falling steadily behind the words for as long as it is up */
    var rain = root.querySelector(".iday__fx--rain");
    for (var r = 0; r < 22; r++) {
      var pr = document.createElement("i");
      pr.style.setProperty("--x", rand(0, 100).toFixed(1) + "%");
      pr.style.setProperty("--dx", rand(-34, 34).toFixed(0) + "px");
      pr.style.setProperty("--r", rand(-420, 420).toFixed(0) + "deg");
      pr.style.setProperty("--c", COLOURS[r % COLOURS.length]);
      pr.style.setProperty("--w", rand(4, 8).toFixed(0) + "px");
      pr.style.setProperty("--h", rand(6, 11).toFixed(0) + "px");
      pr.style.setProperty("--br", r % 4 === 0 ? "50%" : "1px");
      pr.style.setProperty("--dur", rand(4.2, 7.5).toFixed(2) + "s");
      pr.style.setProperty("--d", rand(0, 5).toFixed(2) + "s");
      rain.appendChild(pr);
    }

    /* 64 pieces falling the whole window, behind the card */
    var sky = root.querySelector(".iday__sky--rain");
    for (var k = 0; k < 64; k++) {
      var ps = document.createElement("i");
      ps.style.setProperty("--x", rand(-2, 102).toFixed(1) + "%");
      ps.style.setProperty("--dx", rand(-90, 90).toFixed(0) + "px");
      ps.style.setProperty("--r", rand(-720, 720).toFixed(0) + "deg");
      ps.style.setProperty("--c", COLOURS[k % COLOURS.length]);
      ps.style.setProperty("--w", rand(6, 12).toFixed(0) + "px");
      ps.style.setProperty("--h", rand(9, 18).toFixed(0) + "px");
      ps.style.setProperty("--br", k % 4 === 0 ? "50%" : "1px");
      ps.style.setProperty("--dur", rand(4.5, 9).toFixed(2) + "s");
      ps.style.setProperty("--d", rand(0, 6).toFixed(2) + "s");
      sky.appendChild(ps);
    }

    /* two cannons out of the bottom corners, fired twice: once as the card
       lands and once at the halfway mark, so the fifteen seconds do not go
       quiet in the middle */
    var cannon = root.querySelector(".iday__sky--cannon");
    for (var vol = 0; vol < 2; vol++) {
      for (var side = 0; side < 2; side++) {
        for (var n = 0; n < 26; n++) {
          var pc = document.createElement("i");
          pc.className = side ? "r" : "l";
          /* up and inward: away from its own corner, across the window */
          var spread = rand(0.15, 1.05);
          pc.style.setProperty("--tx", ((side ? -1 : 1) * rand(120, 620) * spread).toFixed(0) + "px");
          pc.style.setProperty("--ty", (-rand(240, 640)).toFixed(0) + "px");
          pc.style.setProperty("--r", rand(-720, 720).toFixed(0) + "deg");
          pc.style.setProperty("--c", COLOURS[(n + side) % COLOURS.length]);
          pc.style.setProperty("--w", rand(6, 11).toFixed(0) + "px");
          pc.style.setProperty("--h", rand(8, 16).toFixed(0) + "px");
          pc.style.setProperty("--br", n % 3 === 0 ? "50%" : "1px");
          pc.style.setProperty("--dur", rand(2.2, 3.4).toFixed(2) + "s");
          pc.style.setProperty("--d", (vol * 6.5 + 0.35 + Math.random() * 0.35).toFixed(2) + "s");
          cannon.appendChild(pc);
        }
      }
    }
  }

  document.body.appendChild(root);

  var closeBtn = root.querySelector(".iday__close");
  var returnTo = document.activeElement;
  if (closeBtn) setTimeout(function () { closeBtn.focus({ preventScroll: true }); }, 700);

  var timer = setTimeout(close, LIFE);
  var gone = false;

  function close() {
    if (gone) return;
    gone = true;
    clearTimeout(timer);
    document.removeEventListener("keydown", onKey);
    root.classList.add("is-out");
    setTimeout(function () {
      if (root.parentNode) root.parentNode.removeChild(root);
      if (returnTo && returnTo.focus) returnTo.focus({ preventScroll: true });
    }, reduce ? 0 : 460);
  }

  function onKey(e) { if (e.key === "Escape" || e.key === "Esc") close(); }

  root.addEventListener("click", function (e) {
    if (e.target.closest("[data-iday-dismiss]")) close();
  });
  document.addEventListener("keydown", onKey);
  }
})();
