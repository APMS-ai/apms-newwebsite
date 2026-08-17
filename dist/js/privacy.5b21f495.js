
;/* js/motion/loader.js */
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


;/* js/core/redesign.js */
/* ==========================================================================
   APMS.ai redesign — behaviour layer (vanilla, dependency-free)
   Reveal · counters · sticky pipeline · dashboard · nav · progress
   All motion respects prefers-reduced-motion. Passive listeners, rAF-throttled.
   ========================================================================== */
(function () {
  "use strict";
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- header stuck state + scroll progress + to-top ---------- */
  var hdr = document.querySelector(".hdr");
  var progress = document.querySelector(".progress");
  var totop = document.querySelector(".totop");
  var ticking = false;
  function onScroll() {
    if (ticking) return; ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      var y = scrollY;
      if (hdr) hdr.classList.toggle("is-stuck", y > 40);
      if (totop) totop.classList.toggle("show", y > 700);
      /* gscroll.js drives this off ScrollTrigger when GSAP is present. Two
         writers setting the same width every frame is pure waste, so this
         one stands down. */
      if (progress && !document.documentElement.classList.contains("gs-on")) {
        var h = document.documentElement;
        var max = h.scrollHeight - h.clientHeight;
        progress.style.width = max > 0 ? (y / max) * 100 + "%" : "0%";
      }
    });
  }
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  if (totop) totop.addEventListener("click", function () { scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" }); });

  /* ---------- reveal on scroll ---------- */
  var reveals = document.querySelectorAll("[data-reveal]");
  if ("IntersectionObserver" in window && !reduce) {
    var ro = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); ro.unobserve(e.target); } });
    }, { threshold: 0, rootMargin: "0px 0px 10% 0px" });
    /* threshold 0 so tall sections start as soon as their top edge is near,
       rather than waiting for 8% of a very tall block to be on screen */
    reveals.forEach(function (el) { ro.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add("in"); });
  }

  /* ---------- count-up ---------- */
  function countUp(el) {
    var target = parseFloat(el.dataset.count) || 0;
    var dec = parseInt(el.dataset.decimals, 10) || 0;
    var pre = el.dataset.prefix || "", suf = el.dataset.suffix || "";
    if (reduce) { el.textContent = pre + target.toFixed(dec) + suf; return; }
    var t0 = null, dur = 1600;
    function frame(t) {
      if (!t0) t0 = t;
      var p = Math.min((t - t0) / dur, 1);
      var e = 1 - Math.pow(1 - p, 4);
      el.textContent = pre + (target * e).toFixed(dec) + suf;
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
  var counters = document.querySelectorAll("[data-count]");
  if ("IntersectionObserver" in window) {
    var co = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { countUp(e.target); co.unobserve(e.target); } });
    }, { threshold: 0.6 });
    counters.forEach(function (el) { co.observe(el); });
  } else { counters.forEach(countUp); }

  /* ---------- dashboard bar fills on view ---------- */
  var dash = document.querySelector(".dash");
  if (dash && "IntersectionObserver" in window) {
    var dobs = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        dash.querySelectorAll(".dbar__fill").forEach(function (f) { f.style.width = (f.dataset.w || 0) + "%"; });
        dobs.disconnect();
      });
    }, { threshold: 0.4 });
    dobs.observe(dash);
  }

  /* The Active Machines row stagger used to be here, driven off
     [data-app-list]. That screen is an SVG now and its rows are staggered in
     CSS (css/sections/appsvg.css), so there is nothing for JS to do. The
     counts still animate: they carry data-count, handled above. */

  /* ---------- sticky pipeline sequencing ---------- */
  var pipe = document.querySelector(".pipe");
  if (pipe && !reduce) {
    var nodes = Array.prototype.slice.call(pipe.querySelectorAll(".pipe__node"));
    var arrows = Array.prototype.slice.call(pipe.querySelectorAll(".pipe__arrow"));
    var caption = pipe.querySelector("[data-pipe-caption]");
    var captions = caption ? JSON.parse(caption.dataset.pipeCaption) : [];
    var capEl = pipe.querySelector(".pipe__caption h2");
    var pTick = false;
    function pipeScroll() {
      if (pTick) return; pTick = true;
      requestAnimationFrame(function () {
        pTick = false;
        var r = pipe.getBoundingClientRect();
        var total = pipe.offsetHeight - innerHeight;
        var p = Math.min(Math.max(-r.top / total, 0), 1);       // 0..1 through the section
        var active = Math.round(p * (nodes.length - 1));
        nodes.forEach(function (n, i) { n.classList.toggle("on", i <= active); });
        arrows.forEach(function (a, i) { a.classList.toggle("on", i < active); });
        if (capEl && captions[active] && capEl.textContent !== captions[active]) capEl.textContent = captions[active];
      });
    }
    addEventListener("scroll", pipeScroll, { passive: true });
    pipeScroll();
  } else if (pipe) {
    pipe.querySelectorAll(".pipe__node,.pipe__arrow").forEach(function (n) { n.classList.add("on"); });
  }

  /* ---------- solutions accordion (numbered list + switching visual) ---------- */
  var solacc = document.querySelector("[data-solacc]");
  if (solacc) {
    var sitems = Array.prototype.slice.call(solacc.querySelectorAll(".sitem"));
    var spanels = Array.prototype.slice.call(solacc.querySelectorAll(".spanel"));
    function activate(key) {
      sitems.forEach(function (s) {
        var on = s.getAttribute("data-sol") === key;
        s.classList.toggle("on", on);
        var q = s.querySelector(".sitem__q"); if (q) q.setAttribute("aria-expanded", String(on));
      });
      spanels.forEach(function (p) { p.classList.toggle("on", p.getAttribute("data-spanel") === key); });
    }
    sitems.forEach(function (s) {
      var q = s.querySelector(".sitem__q");
      if (q) q.addEventListener("click", function () { activate(s.getAttribute("data-sol")); });
    });
  }

  /* ---------- mobile nav ---------- */
  var burger = document.querySelector(".burger");
  var mnav = document.querySelector(".mnav");
  function closeNav() { if (mnav) { mnav.classList.remove("open"); document.body.classList.remove("nav-open"); } }
  if (burger && mnav) {
    burger.addEventListener("click", function () { mnav.classList.add("open"); document.body.classList.add("nav-open"); });
    mnav.querySelectorAll("a, .mnav__close").forEach(function (a) { a.addEventListener("click", closeNav); });
    addEventListener("keydown", function (e) { if (e.key === "Escape") closeNav(); });
  }

  /* ---------- hero video: drop if it errors so poster carries the hero ---------- */
  var hv = document.querySelector(".hero__video video");
  if (hv) {
    hv.addEventListener("error", function () { hv.remove(); }, true);
    var s = hv.querySelector("source"); if (s) s.addEventListener("error", function () { hv.remove(); });
    if (reduce) hv.removeAttribute("autoplay"), hv.pause && hv.pause();
  }

  /* ---------- FAQ accordion ----------
     One open at a time WITHIN a .faq, not within the document. It used to close
     every open item on the page, which was the same thing while every page had a
     single .faq; faq.html has four, and closing a question in AI Agents because
     someone opened one in Vision AI reads as a bug. Falls back to the document
     if an item is somehow not inside a .faq. */
  document.querySelectorAll(".faq__item").forEach(function (item) {
    var q = item.querySelector(".faq__q");
    if (!q) return;
    var group = item.closest(".faq") || document;
    q.setAttribute("aria-expanded", "false");
    q.addEventListener("click", function () {
      var open = item.classList.contains("open");
      group.querySelectorAll(".faq__item.open").forEach(function (o) {
        o.classList.remove("open"); var b = o.querySelector(".faq__q"); if (b) b.setAttribute("aria-expanded", "false");
      });
      item.classList.toggle("open", !open);
      q.setAttribute("aria-expanded", String(!open));
    });
  });

  /* ---------- contact form (graceful, no backend key) ---------- */
  var form = document.getElementById("contact-form");
  if (form) {
    var status = document.getElementById("form-status");

    /* Every field is required. The form carries novalidate so that the browser's
       own bubbles do not fight the page styling, which means the checking has to
       happen here. These are shape checks for the person filling the form in;
       whatever receives this eventually still has to validate server side. */
    var CHECKS = [
      /* `max` mirrors the cap submit.php enforces on the same field. Without
         it the only thing that stopped an over-long value was the server, and
         it answers every validation failure with one generic line, so a
         visitor who pasted too much was told their details were "missing or
         do not look right", which is the one thing they were not. */
      { id: "cf-name",    max: 120,  msg: "Tell us your name.",
        ok: function (v) { return v.trim().length > 1; } },
      { id: "cf-email",   max: 190,  msg: "Enter a work email we can reply to.",
        ok: function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()); } },
      /* The phone field is a country select plus a national number
         (js/sections/phone.js), and the rule is whatever that country's is:
         10 digits for India, 8 for Qatar. Both msg and ok defer to it when it
         is loaded, and fall back to the old shape check when it is not, which
         is what any page without that script gets. */
      { id: "cf-phone",   max: 40,
        msg: function () {
          return window.APMSPhone ? window.APMSPhone.msg()
                                  : "Enter a phone number, including country code.";
        },
        ok: function (v) {
          return window.APMSPhone ? window.APMSPhone.ok()
                                  : (v.replace(/\D/g, "").length >= 7);
        } },
      { id: "cf-company", max: 160,  msg: "Which company are you with?",
        ok: function (v) { return v.trim().length > 1; } },
      { id: "cf-msg",     max: 5000, msg: "A line about your machines or lines is enough.",
        ok: function (v) { return v.trim().length > 9; } }
    ];

    function setFieldError(el, msg) {
      var wrap = el.closest ? el.closest(".field") : null;
      var slot = document.getElementById(el.id + "-err");
      if (slot) slot.textContent = msg || "";
      if (wrap) wrap.classList.toggle("is-bad", !!msg);
      el.setAttribute("aria-invalid", msg ? "true" : "false");
      return !msg;
    }

    /* Turning back: the form is already reset by the success handler, so this
       only has to hide the confirmation and put focus somewhere sensible. */
    (function () {
      var card = document.getElementById("contact-card");
      var sent = document.getElementById("contact-sent");
      if (!card || !sent) return;
      var again = sent.querySelector(".fsent__again");
      if (!again) return;
      again.addEventListener("click", function () {
        card.classList.remove("is-flipped");
        sent.setAttribute("aria-hidden", "true");
        var first = document.getElementById("cf-name");
        var status = document.getElementById("form-status");
        if (status) {
          status.textContent = "You'll hear back within one business day.";
          status.style.color = "";
        }
        if (first) { setTimeout(function () { first.focus(); }, reduce ? 0 : 300); }
      });
    }());

    function checkField(spec) {
      var el = document.getElementById(spec.id);
      if (!el) return true;
      var v = el.value;
      /* Length is checked before shape, and says what is actually wrong. */
      if (spec.max && v.trim().length > spec.max) {
        return setFieldError(el, "Please shorten this to " + spec.max +
                                 " characters or fewer.");
      }
      var msg = typeof spec.msg === "function" ? spec.msg() : spec.msg;
      return setFieldError(el, spec.ok(v) ? "" : msg);
    }

    /* clear a complaint as soon as the visitor fixes it, but never raise one
       while they are still mid-answer */
    CHECKS.forEach(function (spec) {
      var el = document.getElementById(spec.id);
      if (!el) return;
      el.addEventListener("blur", function () { if (el.value) checkField(spec); });
      el.addEventListener("input", function () {
        if (el.getAttribute("aria-invalid") === "true") checkField(spec);
      });
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();

      var bad = CHECKS.filter(function (spec) { return !checkField(spec); });
      if (bad.length) {
        var first = document.getElementById(bad[0].id);
        if (first) {
          first.focus();
          first.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
        }
        if (status) {
          status.textContent = bad.length === 1
            ? "One field still needs an answer."
            : bad.length + " fields still need an answer.";
          status.style.color = "#b4453a";
        }
        return;
      }

      /* ---------- send it ----------
         Posts to submit.php on the same host. Sending by fetch rather than
         letting the browser navigate keeps the visitor on the page and keeps
         the inline status message, which is the whole reason this handler
         calls preventDefault at the top.

         The form still works with JS off: it has a real action, so the
         browser posts it, submit.php stores it and redirects back with
         ?sent=1. */
      var btn = form.querySelector('button[type="submit"]');
      var btnText = btn ? btn.textContent : "";
      if (btn) { btn.disabled = true; btn.textContent = "Sending..."; }
      if (status) {
        status.textContent = "Sending...";
        status.style.color = "var(--muted)";
      }

      function say(msg, colour) {
        if (!status) return;
        status.textContent = msg;
        status.style.color = colour;
        status.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "nearest" });
      }
      function restore() {
        if (btn) { btn.disabled = false; btn.textContent = btnText; }
      }

      fetch(form.getAttribute("action") || "submit.php", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          /* submit.php answers JSON rather than redirecting when it sees this */
          "Accept": "application/json",
          "X-Requested-With": "fetch"
        },
        body: new URLSearchParams(new FormData(form)).toString()
      }).then(function (res) {
        return res.json().catch(function () { return { ok: res.ok }; })
          .then(function (data) {
            if (!res.ok || data.ok === false) { throw new Error(data.message || res.status); }
            return data;
          });
      }).then(function (data) {
        restore();
        /* the server's own words if it sent any, so a partial success is
           reported as what it was rather than as a clean success */
        say(data.message || "Thanks. Your enquiry is with us and we'll be in touch shortly.", "var(--teal-deep)");

        /* Turn the card over to the confirmation face. Only here, inside the
           success branch, so it can never claim a send that did not happen:
           submit.php answers 200 only once the enquiry actually reached MySQL,
           the CSV, or a mail server that accepted it. */
        var card = document.getElementById("contact-card");
        var sent = document.getElementById("contact-sent");
        if (card && sent) {
          var who = (document.getElementById("cf-name") || {}).value || "";
          var line = document.getElementById("contact-sent-msg");
          if (line) {
            line.textContent = (who.trim() ? "Thanks " + who.trim().split(/\s+/)[0] + ". " : "")
              + "We have it. You will get a reply as soon as possible, usually within one business day.";
          }
          card.classList.add("is-flipped");
          sent.setAttribute("aria-hidden", "false");
          /* move the reading position onto the confirmation, once the turn has
             landed, so a screen reader and a keyboard both end up on it */
          var head = sent.querySelector(".fsent__h");
          /* just after the 400ms turn lands, so focus does not move mid-rotation */
          if (head) { setTimeout(function () { head.focus(); }, reduce ? 0 : 440); }
        }
        form.reset();
        CHECKS.forEach(function (spec) {
          var el = document.getElementById(spec.id);
          if (el) setFieldError(el, "");
          var wrap = el && el.closest ? el.closest(".field") : null;
          if (wrap) wrap.classList.remove("is-ok");
        });
      }).catch(function (err) {
        restore();
        if (err && err.message && /check and try again/i.test(err.message)) {
          say(err.message, "#b4453a");
          return;
        }
        /* Never swallow a failed send. If it did not go through, the visitor
           needs to know and needs another way to reach us. */
        say("That didn't send. Please email info@apms.ai or call +91 80501 76508 and we'll set up your session.", "#b4453a");
      });
    });
  }

  /* ---------- year ---------- */
  var y = document.getElementById("yr"); if (y) y.textContent = new Date().getFullYear();
})();


;/* js/core/enhance.js */
/* ==========================================================================
   APMS.ai — enhancement layer · behaviour (vanilla, dependency-free)
   Ambient backgrounds · card tilt · magnetic buttons · parallax ·
   SVG draw · radial gauges · live ticker · pill tabs.
   Additive to redesign.js. All motion respects prefers-reduced-motion.
   ========================================================================== */
(function () {
  "use strict";
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var isTouch = matchMedia("(hover: none)").matches;

  function each(sel, root, fn) { Array.prototype.forEach.call((root || document).querySelectorAll(sel), fn); }

  /* theme toggle removed — site runs in its single (dark-led) theme.
     Clear any previously-saved preference so no one is stranded in light mode. */
  try {
    localStorage.removeItem("apms-theme");
    document.documentElement.removeAttribute("data-theme");
  } catch (e) {}

  /* ---------- 1 · ambient backgrounds injected into dark sections ---------- */
  each(".sec--dark, .sec--darker", document, function (sec) {
    if (sec.querySelector(":scope > .aurora")) return;
    if (!reduce) {
      var a = document.createElement("div");
      a.className = "aurora"; a.setAttribute("aria-hidden", "true");
      a.innerHTML = "<span></span><span></span><span></span>";
      sec.insertBefore(a, sec.firstChild);
      var g = document.createElement("div");
      g.className = "gridfield"; g.setAttribute("aria-hidden", "true");
      sec.insertBefore(g, sec.firstChild);
    }
    var sp = document.createElement("div");
    sp.className = "spotlight"; sp.setAttribute("aria-hidden", "true");
    sec.insertBefore(sp, sec.firstChild);
    if (!isTouch && !reduce) {
      sec.addEventListener("pointermove", function (e) {
        var r = sec.getBoundingClientRect();
        sp.style.setProperty("--mx", ((e.clientX - r.left) / r.width) * 100 + "%");
        sp.style.setProperty("--my", ((e.clientY - r.top) / r.height) * 100 + "%");
      }, { passive: true });
    }
  });

  /* ---------- 2 · heading reveals ----------
     Owned entirely by js/motion/scroll-text.js. There used to be a second
     system here: a [data-clip] hook that wrapped a heading into .clip-line
     spans and slid them up. scroll-text.js already animates `.sec__head h2`
     and hero h1s with the page's own data-fx recipe, so any heading carrying
     data-clip was animated twice, and two headings on the same page looked
     different purely by whether they had the attribute. The hook, its observer
     and the .clip-line CSS are all gone; scroll-text.js now also matches
     [data-clip] so the few such headings outside a .sec__head still animate. */

  /* ---------- auto-hook: magnetic on the primary hero/CTA buttons only ----------
     (3D tilt removed site-wide in favour of a restrained, premium clean-lift on hover) */
  each(".cta .btn--primary, .hero .btn--primary", document, function (el) {
    el.classList.add("magnetic");
  });

  /* ---------- 3 · card 3D tilt ---------- */
  if (!reduce && !isTouch) {
    each("[data-tilt]", document, function (card) {
      var max = parseFloat(card.dataset.tilt) || 7;
      card.addEventListener("pointermove", function (e) {
        var r = card.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width - 0.5;
        var py = (e.clientY - r.top) / r.height - 0.5;
        card.classList.add("tilting");
        card.style.transform = "perspective(760px) rotateX(" + (-py * max).toFixed(2) + "deg) rotateY(" + (px * max).toFixed(2) + "deg) translateY(-4px)";
      }, { passive: true });
      card.addEventListener("pointerleave", function () {
        card.classList.remove("tilting");
        card.style.transform = "";
      });
    });
  }

  /* ---------- 4 · magnetic buttons ---------- */
  if (!reduce && !isTouch) {
    each(".magnetic", document, function (btn) {
      btn.addEventListener("pointermove", function (e) {
        var r = btn.getBoundingClientRect();
        var x = (e.clientX - r.left - r.width / 2) * 0.3;
        var y = (e.clientY - r.top - r.height / 2) * 0.4;
        btn.style.transform = "translate(" + x.toFixed(1) + "px," + y.toFixed(1) + "px)";
      }, { passive: true });
      btn.addEventListener("pointerleave", function () { btn.style.transform = ""; });
    });
  }

  /* 5 was a [data-parallax] scroll handler. No page carries that attribute,
     so it was a scroll listener and a rAF that ran on every page to move
     nothing; it went in the cleanup audit. */

  /* ---------- 6 · radial gauges (draw ring + count value on view) ---------- */
  var gauges = Array.prototype.slice.call(document.querySelectorAll(".gauge"));
  if (gauges.length && "IntersectionObserver" in window) {
    var go = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        var g = e.target;
        var pct = parseFloat(g.dataset.val) || 0;
        var circ = 2 * Math.PI * 54;               // r = 54
        var fg = g.querySelector(".gauge__fg");
        var bg = g.querySelector(".gauge__bg");
        if (fg) { fg.style.setProperty("--circ", circ); fg.style.setProperty("--target", circ * (1 - pct / 100)); }
        if (bg) bg.style.setProperty("--circ", circ);
        g.classList.add("in");
        var valEl = g.querySelector(".gauge__val");
        if (valEl) {
          var suf = valEl.dataset.suffix || "%";
          if (reduce) { valEl.textContent = pct + suf; }
          else {
            var t0 = null;
            var frame = function (t) {
              if (t0 === null) t0 = t;
              var p = Math.min((t - t0) / 1500, 1);
              var eased = 1 - Math.pow(1 - p, 4);
              valEl.textContent = Math.round(pct * eased) + suf;
              if (p < 1) requestAnimationFrame(frame);
            };
            requestAnimationFrame(frame);
          }
        }
        go.unobserve(g);
      });
    }, { threshold: 0.5 });
    gauges.forEach(function (g) { go.observe(g); });
  }

  /* ---------- 7 · SVG stroke draw on view ---------- */
  each(".draw-svg path, path.draw", document, function (p) {
    try {
      var len = p.getTotalLength();
      p.style.strokeDasharray = len; p.style.strokeDashoffset = reduce ? 0 : len;
      p.style.transition = "stroke-dashoffset 1.8s var(--ease-out, ease)";
    } catch (err) {}
  });
  if (!reduce && "IntersectionObserver" in window) {
    var dObs = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        each("path", e.target, function (p) { if (p.style.strokeDashoffset) p.style.strokeDashoffset = "0"; });
        dObs.unobserve(e.target);
      });
    }, { threshold: 0.35 });
    each(".draw-svg", document, function (s) { dObs.observe(s); });
  }

  /* ---------- 8 · timeline items reveal ---------- */
  if ("IntersectionObserver" in window) {
    var tObs = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); tObs.unobserve(e.target); } });
    }, { threshold: 0.4 });
    each(".tl__item, .rule", document, function (el) { reduce ? el.classList.add("in") : tObs.observe(el); });
  } else {
    each(".tl__item, .rule", document, function (el) { el.classList.add("in"); });
  }

  /* ---------- 9 · live ticker (gently nudges KPI numbers) ---------- */
  var tickers = Array.prototype.slice.call(document.querySelectorAll("[data-ticker]"));
  if (tickers.length && !reduce) {
    tickers.forEach(function (cell) {
      var base = parseFloat(cell.dataset.ticker);
      var dec = parseInt(cell.dataset.dec, 10) || 0;
      var swing = parseFloat(cell.dataset.swing) || Math.max(1, base * 0.01);
      var suf = cell.dataset.suffix || "";
      setInterval(function () {
        var v = base + (Math.sin(Date.now() / 3200 + base) * swing) * 0.6 + (Math.random() - 0.5) * swing * 0.4;
        cell.textContent = v.toFixed(dec) + suf;
      }, 2000);
    });
  }

  /* ---------- 10 · pill tabs (product tour) ----------
     Removed. The product tour's four tab buttons repeated, word for word, the
     four labelled nodes in the diagram directly above them, so the strip is
     gone and the nodes are the tabs. js/sections/loop.js owns that, including
     the roles, the arrow keys and the auto-advance. Nothing else on the site
     uses .ptab. */

  /* ---------- 11 · to-top button reveal (redesign.js handles primary; guard) ---------- */
  /* handled in redesign.js — nothing to do here */

})();


;/* js/core/gsap-late.js */
/* ==========================================================================
   APMS.ai — gsap-late.js
   GSAP and ScrollTrigger, fetched when the visitor arrives rather than at load.

   Between them they are 114 KB of script whose entire job is scroll-linked
   motion: parallax, draws, scrubbed progress. None of that can happen before
   the first scroll, and yet both were parsed and evaluated on every page load,
   inside the window Lighthouse measures blocking time in. Measured, they were
   the two largest remaining tasks on the main thread after everything else had
   been moved off it.

   So they load on the first pointer, wheel, touch or key, and then the four
   files that need them are told. Every one of those already bails cleanly when
   gsap is absent, so the shape of this is: give them a second chance later
   instead of only one chance too early.

     window.APMSGsap(fn)   run fn once gsap and ScrollTrigger exist,
                           immediately if they already do, never if the
                           visitor never arrives or the fetch fails.

   Loaded before its consumers so the queue exists when they call it.
   ========================================================================== */
(function () {
  "use strict";

  var queue = [];
  var ready = false;
  var loading = false;

  function flush() {
    ready = true;
    for (var i = 0; i < queue.length; i++) {
      try { queue[i](); } catch (e) { /* one broken consumer must not stop the rest */ }
    }
    queue.length = 0;
    window.dispatchEvent(new Event("apms:gsap"));
  }

  function load() {
    if (loading || ready) return;
    loading = true;

    if (window.gsap && window.ScrollTrigger) { flush(); return; }

    /* async=false on a dynamically inserted script still guarantees order,
       which matters: ScrollTrigger registers itself against gsap. */
    var srcs = ["js/vendor/gsap.min.js", "js/vendor/ScrollTrigger.min.js"];
    var left = srcs.length;
    srcs.forEach(function (src) {
      var el = document.createElement("script");
      el.src = src;
      el.async = false;
      el.onload = function () { if (--left === 0) flush(); };
      el.onerror = function () { left = -1; };   /* give up quietly: everything degrades */
      document.head.appendChild(el);
    });
  }

  window.APMSGsap = function (fn) {
    if (ready) { fn(); return; }
    queue.push(fn);
  };

  if (window.gsap && window.ScrollTrigger) flush();
  else if (window.APMSWake) window.APMSWake(load);
  else load();
})();


;/* js/vendor/lenis.min.js */
var k="1.1.14";function w(r,t,e){return Math.max(r,Math.min(t,e))}function _(r,t,e){return(1-e)*r+e*t}function z(r,t,e,i){return _(r,t,1-Math.exp(-e*i))}function x(r,t){return(r%t+t)%t}var y=class{isRunning=!1;value=0;from=0;to=0;currentTime=0;lerp;duration;easing;onUpdate;advance(t){if(!this.isRunning)return;let e=!1;if(this.duration&&this.easing){this.currentTime+=t;let i=w(0,this.currentTime/this.duration,1);e=i>=1;let s=e?1:this.easing(i);this.value=this.from+(this.to-this.from)*s}else this.lerp?(this.value=z(this.value,this.to,this.lerp*60,t),Math.round(this.value)===this.to&&(this.value=this.to,e=!0)):(this.value=this.to,e=!0);e&&this.stop(),this.onUpdate?.(this.value,e)}stop(){this.isRunning=!1}fromTo(t,e,{lerp:i,duration:s,easing:o,onStart:l,onUpdate:m}){this.from=this.value=t,this.to=e,this.lerp=i,this.duration=s,this.easing=o,this.currentTime=0,this.isRunning=!0,l?.(),this.onUpdate=m}};function N(r,t){let e;return function(...i){let s=this;clearTimeout(e),e=setTimeout(()=>{e=void 0,r.apply(s,i)},t)}}var E=class{constructor(t,e,{autoResize:i=!0,debounce:s=250}={}){this.wrapper=t;this.content=e;i&&(this.debouncedResize=N(this.resize,s),this.wrapper instanceof Window?window.addEventListener("resize",this.debouncedResize,!1):(this.wrapperResizeObserver=new ResizeObserver(this.debouncedResize),this.wrapperResizeObserver.observe(this.wrapper)),this.contentResizeObserver=new ResizeObserver(this.debouncedResize),this.contentResizeObserver.observe(this.content)),this.resize()}width=0;height=0;scrollHeight=0;scrollWidth=0;debouncedResize;wrapperResizeObserver;contentResizeObserver;destroy(){this.wrapperResizeObserver?.disconnect(),this.contentResizeObserver?.disconnect(),this.wrapper===window&&this.debouncedResize&&window.removeEventListener("resize",this.debouncedResize,!1)}resize=()=>{this.onWrapperResize(),this.onContentResize()};onWrapperResize=()=>{this.wrapper instanceof Window?(this.width=window.innerWidth,this.height=window.innerHeight):(this.width=this.wrapper.clientWidth,this.height=this.wrapper.clientHeight)};onContentResize=()=>{this.wrapper instanceof Window?(this.scrollHeight=this.content.scrollHeight,this.scrollWidth=this.content.scrollWidth):(this.scrollHeight=this.wrapper.scrollHeight,this.scrollWidth=this.wrapper.scrollWidth)};get limit(){return{x:this.scrollWidth-this.width,y:this.scrollHeight-this.height}}};var g=class{events={};emit(t,...e){let i=this.events[t]||[];for(let s=0,o=i.length;s<o;s++)i[s]?.(...e)}on(t,e){return this.events[t]?.push(e)||(this.events[t]=[e]),()=>{this.events[t]=this.events[t]?.filter(i=>e!==i)}}off(t,e){this.events[t]=this.events[t]?.filter(i=>e!==i)}destroy(){this.events={}}};var R=100/6,p={passive:!1},T=class{constructor(t,e={wheelMultiplier:1,touchMultiplier:1}){this.element=t;this.options=e;window.addEventListener("resize",this.onWindowResize,!1),this.onWindowResize(),this.element.addEventListener("wheel",this.onWheel,p),this.element.addEventListener("touchstart",this.onTouchStart,p),this.element.addEventListener("touchmove",this.onTouchMove,p),this.element.addEventListener("touchend",this.onTouchEnd,p)}touchStart={x:0,y:0};lastDelta={x:0,y:0};window={width:0,height:0};emitter=new g;on(t,e){return this.emitter.on(t,e)}destroy(){this.emitter.destroy(),window.removeEventListener("resize",this.onWindowResize,!1),this.element.removeEventListener("wheel",this.onWheel,p),this.element.removeEventListener("touchstart",this.onTouchStart,p),this.element.removeEventListener("touchmove",this.onTouchMove,p),this.element.removeEventListener("touchend",this.onTouchEnd,p)}onTouchStart=t=>{let{clientX:e,clientY:i}=t.targetTouches?t.targetTouches[0]:t;this.touchStart.x=e,this.touchStart.y=i,this.lastDelta={x:0,y:0},this.emitter.emit("scroll",{deltaX:0,deltaY:0,event:t})};onTouchMove=t=>{let{clientX:e,clientY:i}=t.targetTouches?t.targetTouches[0]:t,s=-(e-this.touchStart.x)*this.options.touchMultiplier,o=-(i-this.touchStart.y)*this.options.touchMultiplier;this.touchStart.x=e,this.touchStart.y=i,this.lastDelta={x:s,y:o},this.emitter.emit("scroll",{deltaX:s,deltaY:o,event:t})};onTouchEnd=t=>{this.emitter.emit("scroll",{deltaX:this.lastDelta.x,deltaY:this.lastDelta.y,event:t})};onWheel=t=>{let{deltaX:e,deltaY:i,deltaMode:s}=t,o=s===1?R:s===2?this.window.width:1,l=s===1?R:s===2?this.window.height:1;e*=o,i*=l,e*=this.options.wheelMultiplier,i*=this.options.wheelMultiplier,this.emitter.emit("scroll",{deltaX:e,deltaY:i,event:t})};onWindowResize=()=>{this.window={width:window.innerWidth,height:window.innerHeight}}};var L=class{_isScrolling=!1;_isStopped=!1;_isLocked=!1;_preventNextNativeScrollEvent=!1;_resetVelocityTimeout=null;isTouching;time=0;userData={};lastVelocity=0;velocity=0;direction=0;options;targetScroll;animatedScroll;animate=new y;emitter=new g;dimensions;virtualScroll;constructor({wrapper:t=window,content:e=document.documentElement,eventsTarget:i=t,smoothWheel:s=!0,syncTouch:o=!1,syncTouchLerp:l=.075,touchInertiaMultiplier:m=35,duration:v,easing:u=C=>Math.min(1,1.001-Math.pow(2,-10*C)),lerp:h=.1,infinite:c=!1,orientation:b="vertical",gestureOrientation:n="vertical",touchMultiplier:a=1,wheelMultiplier:f=1,autoResize:S=!0,prevent:d,virtualScroll:M,overscroll:O=!0,__experimental__naiveDimensions:H=!1}={}){window.lenisVersion=k,(!t||t===document.documentElement||t===document.body)&&(t=window),this.options={wrapper:t,content:e,eventsTarget:i,smoothWheel:s,syncTouch:o,syncTouchLerp:l,touchInertiaMultiplier:m,duration:v,easing:u,lerp:h,infinite:c,gestureOrientation:n,orientation:b,touchMultiplier:a,wheelMultiplier:f,autoResize:S,prevent:d,virtualScroll:M,overscroll:O,__experimental__naiveDimensions:H},this.dimensions=new E(t,e,{autoResize:S}),this.updateClassName(),this.targetScroll=this.animatedScroll=this.actualScroll,this.options.wrapper.addEventListener("scroll",this.onNativeScroll,!1),this.options.wrapper.addEventListener("pointerdown",this.onPointerDown,!1),this.virtualScroll=new T(i,{touchMultiplier:a,wheelMultiplier:f}),this.virtualScroll.on("scroll",this.onVirtualScroll)}destroy(){this.emitter.destroy(),this.options.wrapper.removeEventListener("scroll",this.onNativeScroll,!1),this.options.wrapper.removeEventListener("pointerdown",this.onPointerDown,!1),this.virtualScroll.destroy(),this.dimensions.destroy(),this.cleanUpClassName()}on(t,e){return this.emitter.on(t,e)}off(t,e){return this.emitter.off(t,e)}setScroll(t){this.isHorizontal?this.rootElement.scrollLeft=t:this.rootElement.scrollTop=t}onPointerDown=t=>{t.button===1&&this.reset()};onVirtualScroll=t=>{if(typeof this.options.virtualScroll=="function"&&this.options.virtualScroll(t)===!1)return;let{deltaX:e,deltaY:i,event:s}=t;if(this.emitter.emit("virtual-scroll",{deltaX:e,deltaY:i,event:s}),s.ctrlKey||s.lenisStopPropagation)return;let o=s.type.includes("touch"),l=s.type.includes("wheel");if(this.isTouching=s.type==="touchstart"||s.type==="touchmove",this.options.syncTouch&&o&&s.type==="touchstart"&&!this.isStopped&&!this.isLocked){this.reset();return}let v=e===0&&i===0,u=this.options.gestureOrientation==="vertical"&&i===0||this.options.gestureOrientation==="horizontal"&&e===0;if(v||u)return;let h=s.composedPath();h=h.slice(0,h.indexOf(this.rootElement));let c=this.options.prevent;if(h.find(d=>d instanceof HTMLElement&&(typeof c=="function"&&c?.(d)||d.hasAttribute?.("data-lenis-prevent")||o&&d.hasAttribute?.("data-lenis-prevent-touch")||l&&d.hasAttribute?.("data-lenis-prevent-wheel"))))return;if(this.isStopped||this.isLocked){s.preventDefault();return}if(!(this.options.syncTouch&&o||this.options.smoothWheel&&l)){this.isScrolling="native",this.animate.stop(),s.lenisStopPropagation=!0;return}let n=i;this.options.gestureOrientation==="both"?n=Math.abs(i)>Math.abs(e)?i:e:this.options.gestureOrientation==="horizontal"&&(n=e),(!this.options.overscroll||this.options.infinite||this.options.wrapper!==window&&(this.animatedScroll>0&&this.animatedScroll<this.limit||this.animatedScroll===0&&i>0||this.animatedScroll===this.limit&&i<0))&&(s.lenisStopPropagation=!0),s.preventDefault();let a=o&&this.options.syncTouch,S=o&&s.type==="touchend"&&Math.abs(n)>5;S&&(n=this.velocity*this.options.touchInertiaMultiplier),this.scrollTo(this.targetScroll+n,{programmatic:!1,...a?{lerp:S?this.options.syncTouchLerp:1}:{lerp:this.options.lerp,duration:this.options.duration,easing:this.options.easing}})};resize(){this.dimensions.resize(),this.animatedScroll=this.targetScroll=this.actualScroll,this.emit()}emit(){this.emitter.emit("scroll",this)}onNativeScroll=()=>{if(this._resetVelocityTimeout!==null&&(clearTimeout(this._resetVelocityTimeout),this._resetVelocityTimeout=null),this._preventNextNativeScrollEvent){this._preventNextNativeScrollEvent=!1;return}if(this.isScrolling===!1||this.isScrolling==="native"){let t=this.animatedScroll;this.animatedScroll=this.targetScroll=this.actualScroll,this.lastVelocity=this.velocity,this.velocity=this.animatedScroll-t,this.direction=Math.sign(this.animatedScroll-t),this.isScrolling="native",this.emit(),this.velocity!==0&&(this._resetVelocityTimeout=setTimeout(()=>{this.lastVelocity=this.velocity,this.velocity=0,this.isScrolling=!1,this.emit()},400))}};reset(){this.isLocked=!1,this.isScrolling=!1,this.animatedScroll=this.targetScroll=this.actualScroll,this.lastVelocity=this.velocity=0,this.animate.stop()}start(){this.isStopped&&(this.isStopped=!1,this.reset())}stop(){this.isStopped||(this.isStopped=!0,this.animate.stop(),this.reset())}raf(t){let e=t-(this.time||t);this.time=t,this.animate.advance(e*.001)}scrollTo(t,{offset:e=0,immediate:i=!1,lock:s=!1,duration:o=this.options.duration,easing:l=this.options.easing,lerp:m=this.options.lerp,onStart:v,onComplete:u,force:h=!1,programmatic:c=!0,userData:b}={}){if(!((this.isStopped||this.isLocked)&&!h)){if(typeof t=="string"&&["top","left","start"].includes(t))t=0;else if(typeof t=="string"&&["bottom","right","end"].includes(t))t=this.limit;else{let n;if(typeof t=="string"?n=document.querySelector(t):t instanceof HTMLElement&&t?.nodeType&&(n=t),n){if(this.options.wrapper!==window){let f=this.rootElement.getBoundingClientRect();e-=this.isHorizontal?f.left:f.top}let a=n.getBoundingClientRect();t=(this.isHorizontal?a.left:a.top)+this.animatedScroll}}if(typeof t=="number"){if(t+=e,t=Math.round(t),this.options.infinite?c&&(this.targetScroll=this.animatedScroll=this.scroll):t=w(0,t,this.limit),t===this.targetScroll){v?.(this),u?.(this);return}if(this.userData=b??{},i){this.animatedScroll=this.targetScroll=t,this.setScroll(this.scroll),this.reset(),this.preventNextNativeScrollEvent(),this.emit(),u?.(this),this.userData={};return}c||(this.targetScroll=t),this.animate.fromTo(this.animatedScroll,t,{duration:o,easing:l,lerp:m,onStart:()=>{s&&(this.isLocked=!0),this.isScrolling="smooth",v?.(this)},onUpdate:(n,a)=>{this.isScrolling="smooth",this.lastVelocity=this.velocity,this.velocity=n-this.animatedScroll,this.direction=Math.sign(this.velocity),this.animatedScroll=n,this.setScroll(this.scroll),c&&(this.targetScroll=n),a||this.emit(),a&&(this.reset(),this.emit(),u?.(this),this.userData={},this.preventNextNativeScrollEvent())}})}}}preventNextNativeScrollEvent(){this._preventNextNativeScrollEvent=!0,requestAnimationFrame(()=>{this._preventNextNativeScrollEvent=!1})}get rootElement(){return this.options.wrapper===window?document.documentElement:this.options.wrapper}get limit(){return this.options.__experimental__naiveDimensions?this.isHorizontal?this.rootElement.scrollWidth-this.rootElement.clientWidth:this.rootElement.scrollHeight-this.rootElement.clientHeight:this.dimensions.limit[this.isHorizontal?"x":"y"]}get isHorizontal(){return this.options.orientation==="horizontal"}get actualScroll(){return this.isHorizontal?this.rootElement.scrollLeft:this.rootElement.scrollTop}get scroll(){return this.options.infinite?x(this.animatedScroll,this.limit):this.animatedScroll}get progress(){return this.limit===0?1:this.scroll/this.limit}get isScrolling(){return this._isScrolling}set isScrolling(t){this._isScrolling!==t&&(this._isScrolling=t,this.updateClassName())}get isStopped(){return this._isStopped}set isStopped(t){this._isStopped!==t&&(this._isStopped=t,this.updateClassName())}get isLocked(){return this._isLocked}set isLocked(t){this._isLocked!==t&&(this._isLocked=t,this.updateClassName())}get isSmooth(){return this.isScrolling==="smooth"}get className(){let t="lenis";return this.isStopped&&(t+=" lenis-stopped"),this.isLocked&&(t+=" lenis-locked"),this.isScrolling&&(t+=" lenis-scrolling"),this.isScrolling==="smooth"&&(t+=" lenis-smooth"),t}updateClassName(){this.cleanUpClassName(),this.rootElement.className=`${this.rootElement.className} ${this.className}`.trim()}cleanUpClassName(){this.rootElement.className=this.rootElement.className.replace(/lenis(-\w+)?/g,"").trim()}};globalThis.Lenis=L;
//# sourceMappingURL=lenis.min.js.map

;/* js/vendor/anime.min.js */
/*
 * anime.js v3.2.2
 * (c) 2023 Julian Garnier
 * Released under the MIT license
 * animejs.com
 */

!function(n,e){"object"==typeof exports&&"undefined"!=typeof module?module.exports=e():"function"==typeof define&&define.amd?define(e):n.anime=e()}(this,function(){"use strict";var i={update:null,begin:null,loopBegin:null,changeBegin:null,change:null,changeComplete:null,loopComplete:null,complete:null,loop:1,direction:"normal",autoplay:!0,timelineOffset:0},M={duration:1e3,delay:0,endDelay:0,easing:"easeOutElastic(1, .5)",round:0},j=["translateX","translateY","translateZ","rotate","rotateX","rotateY","rotateZ","scale","scaleX","scaleY","scaleZ","skew","skewX","skewY","perspective","matrix","matrix3d"],l={CSS:{},springs:{}};function C(n,e,t){return Math.min(Math.max(n,e),t)}function u(n,e){return-1<n.indexOf(e)}function o(n,e){return n.apply(null,e)}var w={arr:function(n){return Array.isArray(n)},obj:function(n){return u(Object.prototype.toString.call(n),"Object")},pth:function(n){return w.obj(n)&&n.hasOwnProperty("totalLength")},svg:function(n){return n instanceof SVGElement},inp:function(n){return n instanceof HTMLInputElement},dom:function(n){return n.nodeType||w.svg(n)},str:function(n){return"string"==typeof n},fnc:function(n){return"function"==typeof n},und:function(n){return void 0===n},nil:function(n){return w.und(n)||null===n},hex:function(n){return/(^#[0-9A-F]{6}$)|(^#[0-9A-F]{3}$)/i.test(n)},rgb:function(n){return/^rgb/.test(n)},hsl:function(n){return/^hsl/.test(n)},col:function(n){return w.hex(n)||w.rgb(n)||w.hsl(n)},key:function(n){return!i.hasOwnProperty(n)&&!M.hasOwnProperty(n)&&"targets"!==n&&"keyframes"!==n}};function d(n){n=/\(([^)]+)\)/.exec(n);return n?n[1].split(",").map(function(n){return parseFloat(n)}):[]}function c(r,t){var n=d(r),e=C(w.und(n[0])?1:n[0],.1,100),a=C(w.und(n[1])?100:n[1],.1,100),o=C(w.und(n[2])?10:n[2],.1,100),n=C(w.und(n[3])?0:n[3],.1,100),u=Math.sqrt(a/e),i=o/(2*Math.sqrt(a*e)),c=i<1?u*Math.sqrt(1-i*i):0,s=i<1?(i*u-n)/c:-n+u;function f(n){var e=t?t*n/1e3:n,e=i<1?Math.exp(-e*i*u)*(+Math.cos(c*e)+s*Math.sin(c*e)):(1+s*e)*Math.exp(-e*u);return 0===n||1===n?n:1-e}return t?f:function(){var n=l.springs[r];if(n)return n;for(var e=0,t=0;;)if(1===f(e+=1/6)){if(16<=++t)break}else t=0;return n=e*(1/6)*1e3,l.springs[r]=n}}function q(e){return void 0===e&&(e=10),function(n){return Math.ceil(C(n,1e-6,1)*e)*(1/e)}}var H=function(b,e,M,t){if(0<=b&&b<=1&&0<=M&&M<=1){var x=new Float32Array(11);if(b!==e||M!==t)for(var n=0;n<11;++n)x[n]=k(.1*n,b,M);return function(n){return b===e&&M===t||0===n||1===n?n:k(r(n),e,t)}}function r(n){for(var e=0,t=1;10!==t&&x[t]<=n;++t)e+=.1;var r=e+.1*((n-x[--t])/(x[t+1]-x[t])),a=O(r,b,M);if(.001<=a){for(var o=n,u=r,i=b,c=M,s=0;s<4;++s){var f=O(u,i,c);if(0===f)return u;u-=(k(u,i,c)-o)/f}return u}if(0===a)return r;for(var l,d,p=n,h=e,g=e+.1,m=b,v=M,y=0;0<(l=k(d=h+(g-h)/2,m,v)-p)?g=d:h=d,1e-7<Math.abs(l)&&++y<10;);return d}};function r(n,e){return 1-3*e+3*n}function k(n,e,t){return((r(e,t)*n+(3*t-6*e))*n+3*e)*n}function O(n,e,t){return 3*r(e,t)*n*n+2*(3*t-6*e)*n+3*e}e={linear:function(){return function(n){return n}}},t={Sine:function(){return function(n){return 1-Math.cos(n*Math.PI/2)}},Expo:function(){return function(n){return n?Math.pow(2,10*n-10):0}},Circ:function(){return function(n){return 1-Math.sqrt(1-n*n)}},Back:function(){return function(n){return n*n*(3*n-2)}},Bounce:function(){return function(n){for(var e,t=4;n<((e=Math.pow(2,--t))-1)/11;);return 1/Math.pow(4,3-t)-7.5625*Math.pow((3*e-2)/22-n,2)}},Elastic:function(n,e){void 0===e&&(e=.5);var t=C(n=void 0===n?1:n,1,10),r=C(e,.1,2);return function(n){return 0===n||1===n?n:-t*Math.pow(2,10*(n-1))*Math.sin((n-1-r/(2*Math.PI)*Math.asin(1/t))*(2*Math.PI)/r)}}},["Quad","Cubic","Quart","Quint"].forEach(function(n,e){t[n]=function(){return function(n){return Math.pow(n,e+2)}}}),Object.keys(t).forEach(function(n){var r=t[n];e["easeIn"+n]=r,e["easeOut"+n]=function(e,t){return function(n){return 1-r(e,t)(1-n)}},e["easeInOut"+n]=function(e,t){return function(n){return n<.5?r(e,t)(2*n)/2:1-r(e,t)(-2*n+2)/2}},e["easeOutIn"+n]=function(e,t){return function(n){return n<.5?(1-r(e,t)(1-2*n))/2:(r(e,t)(2*n-1)+1)/2}}});var e,t,s=e;function P(n,e){if(w.fnc(n))return n;var t=n.split("(")[0],r=s[t],a=d(n);switch(t){case"spring":return c(n,e);case"cubicBezier":return o(H,a);case"steps":return o(q,a);default:return o(r,a)}}function a(n){try{return document.querySelectorAll(n)}catch(n){}}function I(n,e){for(var t,r=n.length,a=2<=arguments.length?e:void 0,o=[],u=0;u<r;u++)u in n&&(t=n[u],e.call(a,t,u,n))&&o.push(t);return o}function f(n){return n.reduce(function(n,e){return n.concat(w.arr(e)?f(e):e)},[])}function p(n){return w.arr(n)?n:(n=w.str(n)?a(n)||n:n)instanceof NodeList||n instanceof HTMLCollection?[].slice.call(n):[n]}function h(n,e){return n.some(function(n){return n===e})}function g(n){var e,t={};for(e in n)t[e]=n[e];return t}function x(n,e){var t,r=g(n);for(t in n)r[t]=(e.hasOwnProperty(t)?e:n)[t];return r}function D(n,e){var t,r=g(n);for(t in e)r[t]=(w.und(n[t])?e:n)[t];return r}function V(n){var e,t,r,a,o,u,i;return w.rgb(n)?(e=/rgb\((\d+,\s*[\d]+,\s*[\d]+)\)/g.exec(t=n))?"rgba("+e[1]+",1)":t:w.hex(n)?(e=(e=n).replace(/^#?([a-f\d])([a-f\d])([a-f\d])$/i,function(n,e,t,r){return e+e+t+t+r+r}),e=/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(e),"rgba("+parseInt(e[1],16)+","+parseInt(e[2],16)+","+parseInt(e[3],16)+",1)"):w.hsl(n)?(t=/hsl\((\d+),\s*([\d.]+)%,\s*([\d.]+)%\)/g.exec(t=n)||/hsla\((\d+),\s*([\d.]+)%,\s*([\d.]+)%,\s*([\d.]+)\)/g.exec(t),n=parseInt(t[1],10)/360,u=parseInt(t[2],10)/100,i=parseInt(t[3],10)/100,t=t[4]||1,0==u?r=a=o=i:(r=c(u=2*i-(i=i<.5?i*(1+u):i+u-i*u),i,n+1/3),a=c(u,i,n),o=c(u,i,n-1/3)),"rgba("+255*r+","+255*a+","+255*o+","+t+")"):void 0;function c(n,e,t){return t<0&&(t+=1),1<t&&--t,t<1/6?n+6*(e-n)*t:t<.5?e:t<2/3?n+(e-n)*(2/3-t)*6:n}}function B(n){n=/[+-]?\d*\.?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?(%|px|pt|em|rem|in|cm|mm|ex|ch|pc|vw|vh|vmin|vmax|deg|rad|turn)?$/.exec(n);if(n)return n[1]}function m(n,e){return w.fnc(n)?n(e.target,e.id,e.total):n}function v(n,e){return n.getAttribute(e)}function y(n,e,t){var r,a,o;return h([t,"deg","rad","turn"],B(e))?e:(r=l.CSS[e+t],w.und(r)?(a=document.createElement(n.tagName),(n=n.parentNode&&n.parentNode!==document?n.parentNode:document.body).appendChild(a),a.style.position="absolute",a.style.width=100+t,o=100/a.offsetWidth,n.removeChild(a),n=o*parseFloat(e),l.CSS[e+t]=n):r)}function $(n,e,t){var r;if(e in n.style)return r=e.replace(/([a-z])([A-Z])/g,"$1-$2").toLowerCase(),e=n.style[e]||getComputedStyle(n).getPropertyValue(r)||"0",t?y(n,e,t):e}function b(n,e){return w.dom(n)&&!w.inp(n)&&(!w.nil(v(n,e))||w.svg(n)&&n[e])?"attribute":w.dom(n)&&h(j,e)?"transform":w.dom(n)&&"transform"!==e&&$(n,e)?"css":null!=n[e]?"object":void 0}function W(n){if(w.dom(n)){for(var e,t=n.style.transform||"",r=/(\w+)\(([^)]*)\)/g,a=new Map;e=r.exec(t);)a.set(e[1],e[2]);return a}}function X(n,e,t,r){var a=u(e,"scale")?1:0+(u(a=e,"translate")||"perspective"===a?"px":u(a,"rotate")||u(a,"skew")?"deg":void 0),o=W(n).get(e)||a;return t&&(t.transforms.list.set(e,o),t.transforms.last=e),r?y(n,o,r):o}function T(n,e,t,r){switch(b(n,e)){case"transform":return X(n,e,r,t);case"css":return $(n,e,t);case"attribute":return v(n,e);default:return n[e]||0}}function E(n,e){var t=/^(\*=|\+=|-=)/.exec(n);if(!t)return n;var r=B(n)||0,a=parseFloat(e),o=parseFloat(n.replace(t[0],""));switch(t[0][0]){case"+":return a+o+r;case"-":return a-o+r;case"*":return a*o+r}}function Y(n,e){var t;return w.col(n)?V(n):/\s/g.test(n)?n:(t=(t=B(n))?n.substr(0,n.length-t.length):n,e?t+e:t)}function F(n,e){return Math.sqrt(Math.pow(e.x-n.x,2)+Math.pow(e.y-n.y,2))}function Z(n){for(var e,t=n.points,r=0,a=0;a<t.numberOfItems;a++){var o=t.getItem(a);0<a&&(r+=F(e,o)),e=o}return r}function G(n){if(n.getTotalLength)return n.getTotalLength();switch(n.tagName.toLowerCase()){case"circle":return 2*Math.PI*v(n,"r");case"rect":return 2*v(t=n,"width")+2*v(t,"height");case"line":return F({x:v(t=n,"x1"),y:v(t,"y1")},{x:v(t,"x2"),y:v(t,"y2")});case"polyline":return Z(n);case"polygon":return e=n.points,Z(n)+F(e.getItem(e.numberOfItems-1),e.getItem(0))}var e,t}function Q(n,e){var e=e||{},n=e.el||function(n){for(var e=n.parentNode;w.svg(e)&&w.svg(e.parentNode);)e=e.parentNode;return e}(n),t=n.getBoundingClientRect(),r=v(n,"viewBox"),a=t.width,t=t.height,e=e.viewBox||(r?r.split(" "):[0,0,a,t]);return{el:n,viewBox:e,x:+e[0],y:+e[1],w:a,h:t,vW:e[2],vH:e[3]}}function z(n,e){var t=/[+-]?\d*\.?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g,r=Y(w.pth(n)?n.totalLength:n,e)+"";return{original:r,numbers:r.match(t)?r.match(t).map(Number):[0],strings:w.str(n)||e?r.split(t):[]}}function A(n){return I(n?f(w.arr(n)?n.map(p):p(n)):[],function(n,e,t){return t.indexOf(n)===e})}function _(n){var t=A(n);return t.map(function(n,e){return{target:n,id:e,total:t.length,transforms:{list:W(n)}}})}function R(e){for(var t=I(f(e.map(function(n){return Object.keys(n)})),function(n){return w.key(n)}).reduce(function(n,e){return n.indexOf(e)<0&&n.push(e),n},[]),a={},n=0;n<t.length;n++)!function(n){var r=t[n];a[r]=e.map(function(n){var e,t={};for(e in n)w.key(e)?e==r&&(t.value=n[e]):t[e]=n[e];return t})}(n);return a}function J(n,e){var t,r=[],a=e.keyframes;for(t in e=a?D(R(a),e):e)w.key(t)&&r.push({name:t,tweens:function(n,t){var e,r=g(t),a=(/^spring/.test(r.easing)&&(r.duration=c(r.easing)),w.arr(n)&&(2===(e=n.length)&&!w.obj(n[0])?n={value:n}:w.fnc(t.duration)||(r.duration=t.duration/e)),w.arr(n)?n:[n]);return a.map(function(n,e){n=w.obj(n)&&!w.pth(n)?n:{value:n};return w.und(n.delay)&&(n.delay=e?0:t.delay),w.und(n.endDelay)&&(n.endDelay=e===a.length-1?t.endDelay:0),n}).map(function(n){return D(n,r)})}(e[t],n)});return r}function K(i,c){var s;return i.tweens.map(function(n){var n=function(n,e){var t,r={};for(t in n){var a=m(n[t],e);w.arr(a)&&1===(a=a.map(function(n){return m(n,e)})).length&&(a=a[0]),r[t]=a}return r.duration=parseFloat(r.duration),r.delay=parseFloat(r.delay),r}(n,c),e=n.value,t=w.arr(e)?e[1]:e,r=B(t),a=T(c.target,i.name,r,c),o=s?s.to.original:a,u=w.arr(e)?e[0]:o,a=B(u)||B(a),r=r||a;return w.und(t)&&(t=o),n.from=z(u,r),n.to=z(E(t,u),r),n.start=s?s.end:0,n.end=n.start+n.delay+n.duration+n.endDelay,n.easing=P(n.easing,n.duration),n.isPath=w.pth(e),n.isPathTargetInsideSVG=n.isPath&&w.svg(c.target),n.isColor=w.col(n.from.original),n.isColor&&(n.round=1),s=n})}var U={css:function(n,e,t){return n.style[e]=t},attribute:function(n,e,t){return n.setAttribute(e,t)},object:function(n,e,t){return n[e]=t},transform:function(n,e,t,r,a){var o;r.list.set(e,t),e!==r.last&&!a||(o="",r.list.forEach(function(n,e){o+=e+"("+n+") "}),n.style.transform=o)}};function nn(n,u){_(n).forEach(function(n){for(var e in u){var t=m(u[e],n),r=n.target,a=B(t),o=T(r,e,a,n),t=E(Y(t,a||B(o)),o),a=b(r,e);U[a](r,e,t,n.transforms,!0)}})}function en(n,e){return I(f(n.map(function(o){return e.map(function(n){var e,t,r=o,a=b(r.target,n.name);if(a)return t=(e=K(n,r))[e.length-1],{type:a,property:n.name,animatable:r,tweens:e,duration:t.end,delay:e[0].delay,endDelay:t.endDelay}})})),function(n){return!w.und(n)})}function tn(n,e){function t(n){return n.timelineOffset||0}var r=n.length,a={};return a.duration=r?Math.max.apply(Math,n.map(function(n){return t(n)+n.duration})):e.duration,a.delay=r?Math.min.apply(Math,n.map(function(n){return t(n)+n.delay})):e.delay,a.endDelay=r?a.duration-Math.max.apply(Math,n.map(function(n){return t(n)+n.duration-n.endDelay})):e.endDelay,a}var rn=0;var N,S=[],an=("undefined"!=typeof document&&document.addEventListener("visibilitychange",function(){L.suspendWhenDocumentHidden&&(n()?N=cancelAnimationFrame(N):(S.forEach(function(n){return n._onDocumentVisibility()}),an()))}),function(){!(N||n()&&L.suspendWhenDocumentHidden)&&0<S.length&&(N=requestAnimationFrame(on))});function on(n){for(var e=S.length,t=0;t<e;){var r=S[t];r.paused?(S.splice(t,1),e--):(r.tick(n),t++)}N=0<t?requestAnimationFrame(on):void 0}function n(){return document&&document.hidden}function L(n){var c,s=0,f=0,l=0,d=0,p=null;function h(n){var e=window.Promise&&new Promise(function(n){return p=n});return n.finished=e}e=x(i,n=n=void 0===n?{}:n),t=J(r=x(M,n),n),n=_(n.targets),r=tn(t=en(n,t),r),a=rn,rn++;var e,t,r,a,k=D(e,{id:a,children:[],animatables:n,animations:t,duration:r.duration,delay:r.delay,endDelay:r.endDelay});h(k);function g(){var n=k.direction;"alternate"!==n&&(k.direction="normal"!==n?"normal":"reverse"),k.reversed=!k.reversed,c.forEach(function(n){return n.reversed=k.reversed})}function m(n){return k.reversed?k.duration-n:n}function o(){s=0,f=m(k.currentTime)*(1/L.speed)}function v(n,e){e&&e.seek(n-e.timelineOffset)}function y(e){for(var n=0,t=k.animations,r=t.length;n<r;){for(var a=t[n],o=a.animatable,u=a.tweens,i=u.length-1,c=u[i],i=(i&&(c=I(u,function(n){return e<n.end})[0]||c),C(e-c.start-c.delay,0,c.duration)/c.duration),s=isNaN(i)?1:c.easing(i),f=c.to.strings,l=c.round,d=[],p=c.to.numbers.length,h=void 0,g=0;g<p;g++){var m=void 0,v=c.to.numbers[g],y=c.from.numbers[g]||0,m=c.isPath?function(e,t,n){function r(n){return e.el.getPointAtLength(1<=t+(n=void 0===n?0:n)?t+n:0)}var a=Q(e.el,e.svg),o=r(),u=r(-1),i=r(1),c=n?1:a.w/a.vW,s=n?1:a.h/a.vH;switch(e.property){case"x":return(o.x-a.x)*c;case"y":return(o.y-a.y)*s;case"angle":return 180*Math.atan2(i.y-u.y,i.x-u.x)/Math.PI}}(c.value,s*v,c.isPathTargetInsideSVG):y+s*(v-y);!l||c.isColor&&2<g||(m=Math.round(m*l)/l),d.push(m)}var b=f.length;if(b)for(var h=f[0],M=0;M<b;M++){f[M];var x=f[M+1],w=d[M];isNaN(w)||(h+=x?w+x:w+" ")}else h=d[0];U[a.type](o.target,a.property,h,o.transforms),a.currentValue=h,n++}}function b(n){k[n]&&!k.passThrough&&k[n](k)}function u(n){var e=k.duration,t=k.delay,r=e-k.endDelay,a=m(n);if(k.progress=C(a/e*100,0,100),k.reversePlayback=a<k.currentTime,c){var o=a;if(k.reversePlayback)for(var u=d;u--;)v(o,c[u]);else for(var i=0;i<d;i++)v(o,c[i])}!k.began&&0<k.currentTime&&(k.began=!0,b("begin")),!k.loopBegan&&0<k.currentTime&&(k.loopBegan=!0,b("loopBegin")),a<=t&&0!==k.currentTime&&y(0),(r<=a&&k.currentTime!==e||!e)&&y(e),t<a&&a<r?(k.changeBegan||(k.changeBegan=!0,k.changeCompleted=!1,b("changeBegin")),b("change"),y(a)):k.changeBegan&&(k.changeCompleted=!0,k.changeBegan=!1,b("changeComplete")),k.currentTime=C(a,0,e),k.began&&b("update"),e<=n&&(f=0,k.remaining&&!0!==k.remaining&&k.remaining--,k.remaining?(s=l,b("loopComplete"),k.loopBegan=!1,"alternate"===k.direction&&g()):(k.paused=!0,k.completed||(k.completed=!0,b("loopComplete"),b("complete"),!k.passThrough&&"Promise"in window&&(p(),h(k)))))}return k.reset=function(){var n=k.direction;k.passThrough=!1,k.currentTime=0,k.progress=0,k.paused=!0,k.began=!1,k.loopBegan=!1,k.changeBegan=!1,k.completed=!1,k.changeCompleted=!1,k.reversePlayback=!1,k.reversed="reverse"===n,k.remaining=k.loop,c=k.children;for(var e=d=c.length;e--;)k.children[e].reset();(k.reversed&&!0!==k.loop||"alternate"===n&&1===k.loop)&&k.remaining++,y(k.reversed?k.duration:0)},k._onDocumentVisibility=o,k.set=function(n,e){return nn(n,e),k},k.tick=function(n){u(((l=n)+(f-(s=s||l)))*L.speed)},k.seek=function(n){u(m(n))},k.pause=function(){k.paused=!0,o()},k.play=function(){k.paused&&(k.completed&&k.reset(),k.paused=!1,S.push(k),o(),an())},k.reverse=function(){g(),k.completed=!k.reversed,o()},k.restart=function(){k.reset(),k.play()},k.remove=function(n){cn(A(n),k)},k.reset(),k.autoplay&&k.play(),k}function un(n,e){for(var t=e.length;t--;)h(n,e[t].animatable.target)&&e.splice(t,1)}function cn(n,e){var t=e.animations,r=e.children;un(n,t);for(var a=r.length;a--;){var o=r[a],u=o.animations;un(n,u),u.length||o.children.length||r.splice(a,1)}t.length||r.length||e.pause()}return L.version="3.2.1",L.speed=1,L.suspendWhenDocumentHidden=!0,L.running=S,L.remove=function(n){for(var e=A(n),t=S.length;t--;)cn(e,S[t])},L.get=T,L.set=nn,L.convertPx=y,L.path=function(n,e){var t=w.str(n)?a(n)[0]:n,r=e||100;return function(n){return{property:n,el:t,svg:Q(t),totalLength:G(t)*(r/100)}}},L.setDashoffset=function(n){var e=G(n);return n.setAttribute("stroke-dasharray",e),e},L.stagger=function(n,e){var i=(e=void 0===e?{}:e).direction||"normal",c=e.easing?P(e.easing):null,s=e.grid,f=e.axis,l=e.from||0,d="first"===l,p="center"===l,h="last"===l,g=w.arr(n),m=g?parseFloat(n[0]):parseFloat(n),v=g?parseFloat(n[1]):0,y=B(g?n[1]:n)||0,b=e.start||0+(g?m:0),M=[],x=0;return function(n,e,t){if(d&&(l=0),p&&(l=(t-1)/2),h&&(l=t-1),!M.length){for(var r,a,o,u=0;u<t;u++)s?(r=p?(s[0]-1)/2:l%s[0],a=p?(s[1]-1)/2:Math.floor(l/s[0]),r=r-u%s[0],a=a-Math.floor(u/s[0]),o=Math.sqrt(r*r+a*a),"x"===f&&(o=-r),M.push(o="y"===f?-a:o)):M.push(Math.abs(l-u)),x=Math.max.apply(Math,M);c&&(M=M.map(function(n){return c(n/x)*x})),"reverse"===i&&(M=M.map(function(n){return f?n<0?-1*n:-n:Math.abs(x-n)}))}return b+(g?(v-m)/x:m)*(Math.round(100*M[e])/100)+y}},L.timeline=function(u){var i=L(u=void 0===u?{}:u);return i.duration=0,i.add=function(n,e){var t=S.indexOf(i),r=i.children;function a(n){n.passThrough=!0}-1<t&&S.splice(t,1);for(var o=0;o<r.length;o++)a(r[o]);t=D(n,x(M,u)),t.targets=t.targets||u.targets,n=i.duration,t.autoplay=!1,t.direction=i.direction,t.timelineOffset=w.und(e)?n:E(e,n),a(i),i.seek(t.timelineOffset),e=L(t),a(e),r.push(e),n=tn(r,u);return i.delay=n.delay,i.endDelay=n.endDelay,i.duration=n.duration,i.seek(0),i.reset(),i.autoplay&&i.play(),i},i},L.easing=P,L.penner=s,L.random=function(n,e){return Math.floor(Math.random()*(e-n+1))+n},L});

;/* js/core/smooth.js */
/* ==========================================================================
   APMS.ai — smooth.js
   Lenis smooth scroll, on both desktop and touch, driven from GSAP's ticker.
   Skips entirely under reduced-motion (falls back to native scroll).

   Two notes worth keeping:

   · Touch is smoothed too (syncTouch). Lenis leaves touch alone by default
     and lets the OS provide momentum, which is why mobile felt different to
     desktop. Turning it on means the same easing everywhere, at the cost of
     replacing the platform's own inertia, so the inertia multiplier and lerp
     below are tuned to land close to what a phone does natively rather than
     feeling floaty.

   · Anything that scrolls in its own right, the horizontal card rails above
     all, is marked data-lenis-prevent. Without that, Lenis swallows the
     gesture and the rails cannot be swiped on a phone.
   ========================================================================== */
(function () {
  "use strict";
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (!window.Lenis) return;

  var coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;

  /* Let the rails keep their own gestures. Done here rather than in the
     markup so every page gets it without touching ten HTML files. */
  var OWN_SCROLL = [
    ".agp--native", ".agp__viewport", "[data-agp]", ".ptabs__scroll",
    "pre", "textarea", ".chatbot__log", "[data-scrollable]"
  ].join(",");

  /* Every write in here happens at the end, and the cheap test comes before
     the expensive one. Both matter, and the first one is not obvious:
     setAttribute invalidates style, so a setAttribute *inside* the read loop
     means the next getComputedStyle cannot use the cached recalc and the
     browser re-does layout for every element in turn. Measured on the platform
     page, which has about eighteen hundred elements under main, that thrash
     was 704ms of a single blocking task - the largest one on the page.

     The ordering is the other half. scrollWidth/clientWidth are layout reads
     against a layout that is already clean, whereas getComputedStyle on a
     fresh element is a style resolve; the overwhelming majority of divs are
     not scrollable, so testing the dimensions first lets nearly all of them
     out before anyone asks for their computed overflow. */
  function exempt() {
    var mark = [];

    var own = document.querySelectorAll(OWN_SCROLL);
    for (var i = 0; i < own.length; i++) mark.push(own[i]);

    /* Catch anything a stylesheet has made scrollable that is not on the list
       above. A container that scrolls but is not exempt is invisible to the
       visitor: Lenis consumes the gesture and it never moves. This is how the
       "Four modules" diagram ended up stuck showing only its left third. */
    var all = document.querySelectorAll("main div, main section, main ul, main table");
    for (var j = 0; j < all.length; j++) {
      var el = all[j];
      if (el.hasAttribute("data-lenis-prevent")) continue;
      if (el.scrollWidth <= el.clientWidth + 4) continue;
      var ox = getComputedStyle(el).overflowX;
      if (ox === "auto" || ox === "scroll") mark.push(el);
    }

    for (var k = 0; k < mark.length; k++) mark[k].setAttribute("data-lenis-prevent", "");
  }
  /* exempt() is called from drive(), not here: none of it matters until Lenis
     is actually intercepting gestures, and Lenis does not start until the
     visitor does, so the sweep goes with it.

     Lenis itself is constructed there too, and not at load.

     Lenis's Dimensions constructor ends in an unconditional this.resize(),
     which reads content.scrollHeight. On a short page that is nothing; on this
     one it forces a full layout of every element in the document, including
     the nine screens nobody has scrolled to yet. Measured, that single read
     was a 728ms blocking task sitting right after first paint, and it was the
     reason the page stayed unresponsive for three seconds after it looked
     finished - the visitor's first mousemove could not be handled until it
     was done, so everything gated on that first interaction started late.

     Nothing here is needed before the first gesture, which is the same
     reasoning the rAF loop below already followed; the object just had to
     follow it too. */
  var lenis = null;

  function build() {
    if (lenis) return lenis;
    lenis = new window.Lenis({
      /* lerp rather than a fixed duration: a duration always finishes late on a
         long throw, where a lerp keeps closing the gap at a constant rate and
         stays glued to fast flicks */
      lerp: 0.1,
      smoothWheel: true,
      wheelMultiplier: 1,

      /* --- touch --- */
      syncTouch: true,
      /* the drag itself follows the finger almost exactly; only the release
         glides, which is what makes it read as native rather than laggy */
      syncTouchLerp: 0.075,
      touchInertiaMultiplier: 28,
      touchMultiplier: 1.35,

      gestureOrientation: "vertical",
      orientation: "vertical",
      overscroll: true,
      autoResize: true,
      infinite: false
    });

    /* Content added later (rails cloning cards, the chatbot opening) needs a
       fresh height. Observed from here so the observer does not exist, and
       cannot fire, before Lenis does. */
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(function () { lenis.resize(); });
      ro.observe(document.documentElement);
    }

    /* gscroll.js and pseq.js both read this. Neither can run before the first
       interaction, and both already test for it, so publishing it here rather
       than at load is safe. */
    window.__lenis = lenis;
    return lenis;
  }

  /* One rAF loop for the whole page. GSAP already runs one, so Lenis rides on
     it instead of starting a second: two loops means two layout reads per
     frame and they fight over which one wins.

     And it does not start until the visitor does. Attaching at load meant a
     rAF loop from the first paint onwards, so the main thread never went idle
     for as long as the tab was open. Lighthouse attributed 23 seconds of work
     to GSAP for a page that was, as far as anyone could see, standing still,
     and Speed Index went with it. Nothing needs smoothing before the first
     scroll, so nothing runs before the first scroll: until then the browser's
     own scrolling is what you get, which is what you would have had anyway. */
  var driving = false;
  function drive() {
    if (driving) return;
    driving = true;
    build();
    exempt();
    /* gsap arrives on the same signal this does, so ask for it rather than
       testing for it: whichever of the two lands second runs this. */
    if (window.APMSGsap && !window.gsap) { window.APMSGsap(attach); return; }
    attach();
  }
  function attach() {
    if (window.gsap && window.ScrollTrigger) {
      lenis.on("scroll", window.ScrollTrigger.update);
      window.gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
      window.gsap.ticker.lagSmoothing(0);
    } else {
      var raf = function (t) { lenis.raf(t); requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
    }
  }
  if (window.APMSWake) window.APMSWake(drive); else drive();

  /* scrollTo is the one thing that needs the loop running whether or not the
     visitor has touched anything yet, so it builds and starts Lenis first. */
  function scrollTo(target, opts) {
    drive();
    return lenis.scrollTo(target, opts);
  }

  /* In-page anchors glide instead of jumping. */
  document.addEventListener("click", function (e) {
    var a = e.target.closest ? e.target.closest('a[href^="#"]') : null;
    if (!a) return;
    var id = a.getAttribute("href");
    if (!id || id.length < 2) return;
    var el = document.querySelector(id);
    if (el) { e.preventDefault(); scrollTo(el, { offset: -80 }); }
  });

  var totop = document.querySelector(".totop");
  if (totop) totop.addEventListener("click", function (e) { e.preventDefault(); scrollTo(0); }, true);

  /* Re-measure on load only if the visitor has already arrived. This line used
     to call exempt() and lenis.resize() unconditionally, which quietly undid
     the deferral above: the sweep was skipped at startup and then run in full
     on `load` anyway, for every visitor, including the ones who never touch
     the page. If Lenis does not exist yet, drive() does both when it is
     built. */
  window.addEventListener("load", function () {
    if (!lenis) return;
    if (driving) exempt();
    lenis.resize();
  });
})();


;/* js/motion/site-fx.js */
/* ==========================================================================
   APMS.ai — site-fx.js
   Hero scroll parallax, on GSAP. Guarded for reduced motion, and it asks
   gsap-late.js for gsap rather than assuming it is present, so it degrades
   silently to the base design when gsap never arrives.
   ========================================================================== */
(function () {
  "use strict";

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- 1 · the hero's particle network ----------
     Moved to js/motion/netbg.js, which draws the same picture on a 2D canvas,
     ships inside the page bundle and starts with the headline instead of six
     seconds after it. What used to live here fetched three.min.js and
     vanta.net.min.js on the first interaction - 152 KB gzipped, arriving last,
     and 601 KB to parse once it did. The WebGL and viewport-width gates went
     with it, since nothing else in this file needed them. */

  /* ---------- 2 · GSAP — gentle scroll parallax on hero content ---------- */
  /* gsap is fetched on the first interaction now, so this asks for it rather
     than testing once at load and giving up. See js/core/gsap-late.js. */
  if (!reduce) { if (window.APMSGsap) window.APMSGsap(heroParallax); else heroParallax(); }
  function heroParallax() {
    if (!window.gsap) return;
    var g = window.gsap;
    if (window.ScrollTrigger) g.registerPlugin(window.ScrollTrigger);

    /* NOTE: no opacity/transform tween on the hero content — it owns [data-reveal],
       and a scrub tween would fight that and can pin the text invisible. */

    /* opt-in continuous parallax for any element tagged .fx-float (decorative) */
    g.utils.toArray(".fx-float").forEach(function (el) {
      var depth = parseFloat(el.getAttribute("data-fx-depth")) || 20;
      if (!window.ScrollTrigger) return;
      g.to(el, {
        yPercent: -depth,
        ease: "none",
        scrollTrigger: { trigger: el, start: "top bottom", end: "bottom top", scrub: true }
      });
    });
  }
})();


;/* js/motion/netbg.js */
/* ==========================================================================
   APMS.ai — netbg.js
   The hero's particle network. Replaces VANTA.NET and three.js.

   Why this file exists, measured on a 4 Mbit connection with the CPU throttled
   to a mid-range laptop:

     dist/js/index.js        47 KB gz     arrives  1.1s
     dist/css/index.css      34 KB gz     arrives  0.2s
     index.html              28 KB gz     arrives  0.1s
     three.min.js           148 KB gz     arrives  8.0s   <-- one file
     vanta.net.min.js         4 KB gz     arrives  7.0s

   three.js alone was larger than the entire rest of the page put together, it
   was fetched last, and the hero background therefore appeared 8.8s after
   navigation - 5.4s after the visitor moved the mouse and woke the site. That
   is the lag, and none of it was buying anything a general-purpose 3D engine
   is for: VANTA.NET draws dots, joins the near ones with lines, and drifts.

   So it is drawn directly on a 2D canvas instead. Same picture, same colours,
   same mouse parallax, ~4 KB, and it lives inside the page bundle - no request
   at all, so the background is up on the first frame after wake instead of
   five seconds later.

   Compatibility kept deliberately:
     · the element is still .vanta-bg and the hero still gets .has-vanta, so
       every rule in css/base/polish.css applies unchanged, including the
       scrim that keeps the headline readable
     · window.__vanta still exposes .req and .animationLoop(), which is the
       exact surface js/core/perf.js cancels and re-arms to pause the hero when
       it scrolls away or the tab is hidden

   js/vendor/three.min.js and js/vendor/vanta.net.min.js are now unreferenced.
   ========================================================================== */
(function () {
  "use strict";

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) return;

  /* Same gate the WebGL version used: a phone gets the static hero, because
     smooth scrolling is worth more there than a decorative mesh. */
  var fine = window.matchMedia && window.matchMedia("(pointer: fine)").matches;
  if (!fine || window.innerWidth < 900) return;

  var hero = document.querySelector(".phero") || document.querySelector(".hero");
  if (!hero) return;

  var TEAL = [46, 224, 180];          /* #2ee0b4, as VANTA was configured */
  var INK = "#070f19";                /* --ink-900, the old backgroundColor */

  var canvas, ctx, w = 0, h = 0, pts = [], spacing = 0, maxDist = 0;
  var cx = 0, cy = 0;                   /* hero centre, the roll's axis */
  function byX(a, b) { return a.x - b.x; }
  var mx = 0, my = 0, tx = 0, ty = 0;   /* mouse parallax, eased */
  var t = 0;

  function build() {
    var rect = hero.getBoundingClientRect();
    w = Math.max(1, Math.round(rect.width));
    h = Math.max(1, Math.round(rect.height));

    /* Pixel ratio 1, exactly as the WebGL version was forced to. A soft
       background does not repay four times the fragment work on a retina
       panel, and this is fill-rate bound, not detail bound. */
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";

    /* A grid, jittered. A purely random field clumps and leaves holes; the
       grid is what makes it read as a *network* rather than as noise, and it
       is what VANTA.NET's `spacing` was doing too.

       The grid is built larger than the hero by MARGIN on every side. The
       whole field drifts now (see frame()), so points have to exist outside
       the visible box or the edges would empty out as it moved. */
    var cols = Math.max(4, Math.round(w / 128));
    var rows = Math.max(3, Math.round(h / 128));
    spacing = Math.max(w / cols, h / rows);

    /* Sized from what the drift in frame() can actually do, with slack:
         drift      (78 + 34) * max par 1.6      = 179px
         roll       ((h + 2*MARGIN)/2) * 0.055   =  ~38px
         wobble     spacing * 0.09               =  ~12px
                                                   -------
                                                    229px
       2.1 * spacing is ~275px at a 1440-wide hero, so there is real slack
       rather than the 7px the first pass left. Points outside the box cost
       almost nothing now that the pair loop breaks on x. */
    var MARGIN = spacing * 2.1;
    var fw = w + MARGIN * 2, fh = h + MARGIN * 2;
    cols = Math.round(fw / spacing);
    rows = Math.round(fh / spacing);
    cx = w / 2;
    cy = h / 2;

    /* Reach, not VANTA's literal maxDistance/spacing ratio of 1.17. That ratio
       is in its own 3D world units, and copying the number rather than the
       result gave a web where each point only ever reached its immediate
       neighbours: short segments, few of them, and nothing like the long lines
       that cross the real hero. At 1.6 a point links to everything within
       about two cells, which is what produces the long diagonals and the
       triangular cells the original is made of. */
    maxDist = spacing * 1.6;

    pts = [];
    for (var i = 0; i <= cols; i++) {
      for (var j = 0; j <= rows; j++) {
        /* Depth stands in for the perspective camera: far points are smaller,
           dimmer, and drift less. It is the whole of what the third dimension
           was contributing to this picture. Floored well above zero - at 0.45
           the far half of the field faded almost to nothing and the web looked
           thin, where the original keeps every point clearly drawn. */
        var z = 0.70 + Math.random() * 0.30;
        pts.push({
          bx: -MARGIN + (i / cols) * fw + (Math.random() - 0.5) * spacing * 0.7,
          by: -MARGIN + (j / rows) * fh + (Math.random() - 0.5) * spacing * 0.7,
          z: z,

          /* How far this point is carried by the field's drift. This is the
             parallax, and it is the thing that makes the motion read as a
             camera moving through a cloud rather than as dots wobbling: near
             points sweep noticeably further than far ones, so the web appears
             to have depth while keeping its shape. */
          par: 0.45 + z * 1.15,

          /* A small residual wobble on top, so the field is not perfectly
             rigid. Deliberately about a tenth of what it used to be - when
             this was the *only* motion, each point orbited its own ellipse and
             the web pulsed in place instead of flowing anywhere. */
          p1: Math.random() * Math.PI * 2,
          p2: Math.random() * Math.PI * 2,
          s1: 0.00022 + Math.random() * 0.00018,
          s2: 0.00019 + Math.random() * 0.00016,
          a: spacing * (0.04 + Math.random() * 0.05),
          x: 0, y: 0
        });
      }
    }
  }

  /* Clock read from the frame timestamp, not incremented by a constant.

     This used to be `t += 16`, which silently assumes every display runs at
     60Hz. On a 120Hz or 144Hz panel rAF fires twice as often, so the field
     drifted at double or triple speed and the parallax snapped - the effect
     was tied to the monitor rather than to time. Elapsed milliseconds make
     every rate below mean the same thing everywhere.

     `first` also absorbs the gap after perf.js pauses the loop offscreen:
     without it the field would jump forward by however long the hero spent
     out of view when it resumed. */
  var t0 = 0, last = 0;
  function frame(now) {
    if (typeof now !== "number") now = performance.now();
    if (!t0) { t0 = now; last = now; }
    var dt = now - last;
    /* a backgrounded tab can hand back a gap of seconds; clamp so the field
       eases on rather than teleporting */
    if (dt > 100) { t0 += dt - 16; dt = 16; }
    last = now;
    t = now - t0;

    /* Ease the parallax rather than tracking the cursor exactly: the old
       version moved a camera, and a hard-tracked field feels twitchy. Scaled
       by dt for the same reason the drift is - at a fixed 0.045 per frame
       this settled twice as fast on a 120Hz screen. */
    var k = Math.min(1, 0.045 * (dt / 16.667));
    tx += (mx - tx) * k;
    ty += (my - ty) * k;

    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, w, h);

    var i, j, n = pts.length, p, q;

    /* The field moves as one, which is the whole point.

       VANTA flew a camera through a cloud of points that were themselves
       nearly fixed, so the web held its shape and swept across the frame, with
       near points crossing further than far ones. The first version of this
       gave every point its own little orbit instead: a still frame looked
       right, but nothing ever went anywhere - the web pulsed in place.

       So: one drift vector for the entire field, scaled per point by `par`,
       plus a slow roll about the centre. Both are slow sines with periods that
       do not divide into each other, so the field keeps arriving somewhere new
       for minutes without ever repeating visibly, and - unlike a constant
       velocity - it never has to wrap a point around the edge, which would
       snap every line attached to it. */
    /* Amplitudes are bounded by the margin the grid was built with. Peak
       displacement is (78+34) * the largest `par`, which is 1.6, so 179px
       against a margin of 1.8 * spacing - about 236px at this width. Raising
       these without raising MARGIN in build() is how you get the field
       drifting far enough to expose an empty edge. */
    var gx = Math.sin(t * 0.000165) * 78 + Math.sin(t * 0.000071) * 34;
    var gy = Math.cos(t * 0.000217) * 60 + Math.cos(t * 0.000053) * 28;

    /* the camera roll. Tiny - a few degrees - but it is what stops the drift
       from reading as a flat slide, and it is why the web appears to turn. */
    var rot = Math.sin(t * 0.0000581) * 0.055;
    var cosR = Math.cos(rot), sinR = Math.sin(rot);

    for (i = 0; i < n; i++) {
      p = pts[i];

      /* rigid roll about the hero's centre, so the network keeps its shape */
      var rx = p.bx - cx, ry = p.by - cy;
      var bx = cx + rx * cosR - ry * sinR;
      var by = cy + rx * sinR + ry * cosR;

      p.x = bx + gx * p.par + Math.cos(t * p.s1 + p.p1) * p.a + tx * p.z;
      p.y = by + gy * p.par + Math.sin(t * p.s2 + p.p2) * p.a + ty * p.z;
    }

    /* Sorted by x so the pair loop can stop instead of scanning.

       Growing the grid past the visible box, which the drift requires, took
       the point count at 2560x1440 from 144 to 384 - and the naive pair loop
       is quadratic, so that is 73k pairs a frame and it cost 6fps. Sorted, the
       inner loop breaks the moment q is further right than p's reach, which
       makes the work proportional to the number of points actually within
       range of each other rather than to n squared.

       Array.sort on a nearly-sorted array of a few hundred is cheap, and this
       one is nearly sorted every frame: the field drifts as a unit, so the
       left-to-right order of points barely changes between frames. */
    pts.sort(byX);

    /* Lines first, dots over them: a dot half-covered by the lines meeting it
       looks like a smudge. */
    ctx.lineWidth = 1.1;
    for (i = 0; i < n; i++) {
      p = pts[i];
      for (j = i + 1; j < n; j++) {
        q = pts[j];
        var dx = q.x - p.x;
        if (dx > maxDist) break;              /* sorted: nothing further right is in range */
        var dy = p.y - q.y;
        if (dy > maxDist || dy < -maxDist) continue;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d > maxDist) continue;
        /* Fade with distance so links form and dissolve rather than snapping
           on and off at the threshold.

           Depth is averaged, not multiplied. Multiplying two depths squares
           the dimming - two mid-depth points at 0.7 gave 0.49 of an already
           low base, which is how the whole web ended up a barely-visible
           grey-green. Averaging keeps a line as bright as the points it
           joins, which is what the original does. */
        var a = (1 - d / maxDist) * 1.05 * ((p.z + q.z) * 0.5);
        if (a < 0.012) continue;
        ctx.strokeStyle = "rgba(" + TEAL[0] + "," + TEAL[1] + "," + TEAL[2] + "," + a.toFixed(3) + ")";
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(q.x, q.y);
        ctx.stroke();
      }
    }

    /* The dots are the thing the eye actually reads as "nodes", so they sit
       near full opacity and are a touch larger than the line weight. At half
       this they disappeared against the lines and the hero read as a bare
       wireframe rather than a network. */
    for (i = 0; i < n; i++) {
      p = pts[i];
      ctx.fillStyle = "rgba(" + TEAL[0] + "," + TEAL[1] + "," + TEAL[2] + "," + (0.95 * p.z).toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.0 * p.z + 0.6, 0, Math.PI * 2);
      ctx.fill();
    }

    fx.req = window.requestAnimationFrame(frame);
  }

  /* The shape perf.js drives: it cancels .req to pause and calls
     .animationLoop() to resume, so both have to keep meaning what they did. */
  var fx = {
    req: 0,
    animationLoop: function () {
      window.cancelAnimationFrame(fx.req);
      fx.req = window.requestAnimationFrame(frame);
    },
    destroy: function () {
      window.cancelAnimationFrame(fx.req);
      if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
    }
  };

  function start() {
    var bg = document.createElement("div");
    bg.className = "vanta-bg";
    bg.setAttribute("aria-hidden", "true");

    canvas = document.createElement("canvas");
    canvas.style.display = "block";
    bg.appendChild(canvas);

    ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;                         /* nothing to fall back from: the static hero stays */

    hero.classList.add("has-vanta");          /* CSS mutes the static grid and lifts the copy */
    hero.insertBefore(bg, hero.firstChild);

    build();
    window.__vanta = fx;

    var rt;
    window.addEventListener("resize", function () {
      clearTimeout(rt);
      rt = setTimeout(build, 200);
    }, { passive: true });

    window.addEventListener("mousemove", function (e) {
      /* ±26px across the viewport, scaled per point by depth */
      mx = (e.clientX / window.innerWidth - 0.5) * 52;
      my = (e.clientY / window.innerHeight - 0.5) * 52;
    }, { passive: true });

    window.addEventListener("beforeunload", fx.destroy);

    fx.req = window.requestAnimationFrame(frame);
  }

  /* Started immediately, not on the first interaction - this is the one effect
     on the site that deliberately does not wait.

     Everything else here is gated on APMSWake because a tab nobody has touched
     should not be doing decorative work. That was right for the old hero for a
     second reason too: it was 601 KB of three.js, and starting it at load put
     a 148 KB download and a WebGL context inside the window Lighthouse
     measures. But it also meant the network only began appearing when the
     visitor moved the mouse, and then only after the download - measured, six
     seconds after the headline was already readable, which is a hero that
     visibly assembles itself in front of you.

     This version is ~4 KB in the page bundle with nothing to fetch, so the
     reason for the gate is gone: the first frame costs one canvas clear and
     about a hundred points. It draws on the next frame after this script runs,
     which is the frame right after the headline paints, so the two arrive
     together.

     What still applies: reduced motion, coarse pointers and narrow screens all
     returned at the top of this file and never get here, and perf.js stops the
     loop the moment the hero scrolls off or the tab is hidden. */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();


;/* js/core/polish.js */
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


;/* js/core/ui-fx.js */
/* ==========================================================================
   APMS.ai — ui-fx.js
   Signature interactions inspired by Inspira UI / Animate UI, in vanilla JS:
   a cursor-follow spotlight glow on cards. Reduced-motion / touch safe.
   ========================================================================== */
(function () {
  "use strict";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var fine   = window.matchMedia && window.matchMedia("(pointer: fine)").matches;
  if (reduce || !fine) return;

  var cards = document.querySelectorAll(".tile, .cap, .mod, .ind, .case");
  Array.prototype.forEach.call(cards, function (card) {
    var raf = null;
    card.addEventListener("pointermove", function (e) {
      if (raf) return;
      raf = requestAnimationFrame(function () {
        raf = null;
        var r = card.getBoundingClientRect();
        card.style.setProperty("--mx", (((e.clientX - r.left) / r.width) * 100).toFixed(1) + "%");
        card.style.setProperty("--my", (((e.clientY - r.top) / r.height) * 100).toFixed(1) + "%");
      });
    }, { passive: true });
  });
})();


;/* js/motion/scroll-text.js */
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


;/* js/motion/mesh-bg.js */
/* ==========================================================================
   APMS.ai — mesh-bg.js
   Stripe-style animated mesh gradient (Whatamesh) behind flat CTA sections.
   Teal-family palette, dark enough to keep white copy readable.
   Reduced-motion / missing-lib / WebGL safe.
   ========================================================================== */
(function () {
  "use strict";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) return;

  function hasWebGL() {
    try { var c = document.createElement("canvas"); return !!(window.WebGLRenderingContext && (c.getContext("webgl") || c.getContext("experimental-webgl"))); }
    catch (e) { return false; }
  }
  if (!hasWebGL()) return;

  /* Same reasoning as the hero canvas in site-fx.js: skip touch and small
     screens entirely. And only ever one of these per page. Each is its own
     WebGL context, and browsers cap how many a document may hold before they
     start evicting the oldest, which shows up as a background that silently
     stops animating. */
  var fine = window.matchMedia && window.matchMedia("(pointer: fine)").matches;
  if (!fine || window.innerWidth < 900) return;

  var sections = Array.prototype.slice.call(document.querySelectorAll(".cta, [data-mesh]"), 0, 1);
  if (!sections.length) return;

  /* 24 KB fetched only where a mesh will actually be drawn, for the same
     reason three.js is no longer a script tag: a phone should not pay for it. */
  /* And, like the hero canvas, only once the visitor has actually done
     something. A second WebGL context started at load is a second rAF loop
     the main thread never gets away from. */
  function fetchLib() {
    if (!window.Gradient) {
      var lib = document.createElement("script");
      lib.src = "js/vendor/mesh-gradient.js";
      lib.onload = draw;
      lib.onerror = function () {};
      document.head.appendChild(lib);
    } else { draw(); }
  }
  if (window.APMSWake) window.APMSWake(fetchLib); else fetchLib();

  function draw() {
  Array.prototype.forEach.call(sections, function (sec, i) {
    if (getComputedStyle(sec).position === "static") sec.style.position = "relative";
    var canvas = document.createElement("canvas");
    canvas.className = "mesh-canvas";
    canvas.id = "apms-mesh-" + i;
    canvas.setAttribute("aria-hidden", "true");
    // Whatamesh reads these CSS custom props for its 4 gradient colors.
    canvas.style.setProperty("--gradient-color-1", "#063d31");
    canvas.style.setProperty("--gradient-color-2", "#0b8368");
    canvas.style.setProperty("--gradient-color-3", "#0b1826");
    canvas.style.setProperty("--gradient-color-4", "#17c99b");
    sec.insertBefore(canvas, sec.firstChild);
    sec.classList.add("has-mesh");
    try {
      var g = new window.Gradient();
      g.initGradient("#" + canvas.id);
    } catch (e) {
      sec.classList.remove("has-mesh");
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    }
  });
  }
})();


;/* js/core/reveal.js */
/* ==========================================================================
   APMS.ai — reveal.js
   Tags content blocks across every page so they fade and rise into view,
   staggered within their group. The hero plays on load; everything else
   waits for the scroll.

   Deliberately additive: elements that already animate themselves
   (data-reveal, the pinned pattern rail, the tab panels, marquees, the
   loop diagram, the stepper) are skipped so nothing fights for the same
   transform.
   ========================================================================== */
(function () {
  "use strict";

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) return;

  /* Anything inside these keeps its own choreography. */
  var SKIP_WITHIN = [
    "[data-reveal]", "[data-agp]", ".agp", ".ag-flow", ".ag-arch", ".aloop",
    ".bstep", ".inds", ".qmarq", ".marq", ".words", ".ticker", ".ppane",
    ".faq__a", ".pipe__sticky", ".pseq", ".hdr", ".mnav", ".vanta-bg", ".aurora",
    "svg", ".gauges", "[data-ptabs]"
  ].join(",");

  /* What earns an entrance. Ordered loosely outside-in. */
  var TARGETS = [
    ".sec__head",
    ".tile", ".mod", ".ag-cap", ".ag-pat", ".card", ".why__item", ".arch__layer",
    ".vs__card", ".stat", ".faq__item", ".ind", ".quote", ".step", ".fstrip__cell",
    ".bento__c", ".glass", ".pbody", ".ticks > li",
    ".grid3 > *", ".grid4 > *", ".grid2 > *",
    "main > section > .container > h2",
    "main > section > .container > p",
    ".cta__actions", ".sec__lead"
  ].join(",");

  var HERO = ".phero__wrap, .hero__wrap, .phero__actions, .hero__inner";

  var main = document.querySelector("main");
  if (!main) return;

  document.documentElement.classList.add("has-reveal");

  function tag(el, kind, delay) {
    if (el.hasAttribute("data-r")) return false;
    el.setAttribute("data-r", kind);
    if (delay) el.style.setProperty("--r-delay", delay + "ms");
    return true;
  }

  /* ---------- hero: plays immediately ---------- */
  var heroBits = [];
  Array.prototype.forEach.call(document.querySelectorAll(HERO), function (wrap) {
    var kids = wrap.matches(".phero__actions") ? [wrap]
             : Array.prototype.slice.call(wrap.children);
    kids.forEach(function (k) { if (tag(k, "hero", heroBits.length * 90)) heroBits.push(k); });
  });

  /* ---------- everything else: on scroll ---------- */
  var groups = new Map();
  var items = [];

  Array.prototype.forEach.call(main.querySelectorAll(TARGETS), function (el) {
    if (el.closest(SKIP_WITHIN)) return;
    if (el.hasAttribute("data-r")) return;
    if (!el.getClientRects().length && !el.offsetParent && el.offsetHeight === 0) return;

    /* stagger against siblings that are also revealing */
    var p = el.parentElement || main;
    var n = groups.get(p) || 0;
    groups.set(p, n + 1);

    var kind = el.matches(".sec__head") ? "head"
             : el.matches(".ticks > li, .sec__lead") ? "soft"
             : el.matches(".tile, .mod, .ag-cap, .ag-pat, .vs__card, .faq__item, .ind, .bento__c, .arch__layer, .why__item, .stat") ? "card"
             : "up";

    if (tag(el, kind, Math.min(n * 70, 350))) items.push(el);
  });

  /* ---------- observers ---------- */
  function play(el) {
    el.classList.add("r-in");
    var done = function () { el.classList.add("r-done"); el.removeEventListener("transitionend", done); };
    el.addEventListener("transitionend", done);
    setTimeout(done, 1800);
  }

  if (!("IntersectionObserver" in window)) {
    items.concat(heroBits).forEach(play);
    return;
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      play(e.target);
      io.unobserve(e.target);
    });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });

  items.forEach(function (el) {
    /* already on screen at load: play it with the hero rather than on scroll */
    var r = el.getBoundingClientRect();
    if (r.top < window.innerHeight * 0.92) { heroBits.push(el); return; }
    io.observe(el);
  });

  /* fire the above-the-fold set once styles have settled */
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      heroBits.forEach(play);
    });
  });

  /* A pinned ScrollTrigger measures the page at load; revealing shifts
     nothing (opacity/transform only) but refresh anyway once it settles. */
  window.addEventListener("load", function () {
    if (window.ScrollTrigger) setTimeout(function () { window.ScrollTrigger.refresh(); }, 400);
  });
})();


;/* js/motion/iconlife.js */
/* ==========================================================================
   APMS.ai — iconlife.js
   Brings the site's icon chips to life, cheaply and calmly.

   Does three things:
     1 · tags every icon chip with .ico-live and a stagger index (--i), so no
         two neighbours pulse together
     2 · gates the animations per section with an IntersectionObserver, so we
         only ever animate what is on screen
     3 · leaves bespoke instruments alone (.fgi, .mico, .bfx, .mc, .aloop,
         .modflow already have their own choreography)

   Reduced-motion: bails out entirely, leaving every icon static.
   ========================================================================== */
(function () {
  "use strict";

  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  /* icon chips worth animating, across every page */
  var CHIPS = [
    ".tile__ico", ".cap__ico", ".mod__ico", ".bento__ico", ".fstrip__ico",
    ".ag-ind__ico", ".ag-cap__ico", ".mpanel__ico", ".irow__ico", ".fpanel__ico",
    ".arch__layer > svg", ".step__ico"
  ].join(",");

  /* these carry their own animation already */
  var SKIP = ".fgi, .mico, .bfx, .mc, .aloop, .modflow, .bnum, .agf, .bstep";

  var chips = Array.prototype.slice.call(document.querySelectorAll(CHIPS));
  var n = 0;
  chips.forEach(function (el) {
    if (el.querySelector && el.querySelector(SKIP)) return;   // bespoke glyph inside
    if (el.closest && el.closest(SKIP)) return;               // inside a bespoke block
    if (el.classList.contains("ico-live")) return;
    el.classList.add("ico-live");
    /* 8 phases is enough variety to break up any visible rhythm */
    el.style.setProperty("--i", String(n % 8));
    n++;
  });

  if (!n) return;

  /* ---------- gate the motion to sections that are actually on screen ---------- */
  var hosts = [];
  chips.forEach(function (el) {
    var host = el.closest("section") || document.body;
    if (hosts.indexOf(host) === -1) hosts.push(host);
  });

  if (!("IntersectionObserver" in window)) {
    hosts.forEach(function (h) { h.classList.add("ico-run"); });
    return;
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      e.target.classList.toggle("ico-run", e.isIntersecting);
    });
  }, { rootMargin: "120px 0px" });

  hosts.forEach(function (h) { io.observe(h); });
})();


;/* js/sections/legal.js */
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


;/* js/core/perf.js */
/* ==========================================================================
   APMS.ai — perf.js
   Keeps the frame budget free so the smooth scrolling actually feels smooth.

   The problem this solves, measured with a rAF profiler while scrolling:

     page            median frame   frames over 20ms   running animations
     index.html          33.4ms         78%                  181
     solutions.html      33.6ms         84%                  174
     ai-agents.html      33.2ms         56%                  138
     privacy.html        16.7ms          0%                    0

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
      /* A third of a screen of slack either side. It was a full screen, which
         kept about three viewports of animation alive at once. A third is still
         300px at this viewport, far more than a frame's worth of fast scrolling,
         so nothing is caught mid-entrance. */
      rootMargin: "33% 0px 33% 0px",
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


;/* js/motion/gscroll.js */
/* ==========================================================================
   APMS.ai — gscroll.js
   The GSAP ScrollTrigger layer, on every page.

   Why this sits alongside the existing reveal system rather than replacing it:
   IntersectionObserver answers one question, "is it on screen yet", and that is
   all an entrance needs. ScrollTrigger answers a different one, "how far
   through this element is the scroll", which is the only way to get motion that
   tracks the scrollbar rather than firing once. So the two are split by job:

     reveal.js / redesign.js  entrances     (fire once, then stop costing anything)
     this file                scroll-linked (scrub: parallax, draw, progress)

   Doubling them up on the same element would mean two owners writing the same
   transform, so everything here targets either inner elements that no reveal
   touches, or elements tagged specifically for it.

   Integration notes:
   · Lenis drives ScrollTrigger.update from smooth.js, so there is one scroll
     source and one rAF loop for the whole page.
   · gsap.matchMedia() keeps the heavier scrubs off phones, where the frame
     budget is tightest and a parallax nobody asked for is the first thing to cut.
   · Every trigger is registered once and refreshed when the page resizes; there
     are no per-frame scroll listeners added here.
   ========================================================================== */
(function () {
  "use strict";

  /* GSAP is fetched on the first interaction now, not at load, so this waits
     for it rather than checking once and giving up. See js/core/gsap-late.js. */
  if (window.APMSGsap) { window.APMSGsap(boot); } else { boot(); }

  function boot() {
  var gsap = window.gsap, ST = window.ScrollTrigger;
  if (!gsap || !ST) return;
  gsap.registerPlugin(ST);

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Tell redesign.js to stop writing the progress bar: ScrollTrigger owns it
     now, and two writers per frame is one too many. */
  document.documentElement.classList.add("gs-on");

  /* ------------------------------------------------------------------
     1 · reading progress, driven by the scroll position itself
     ------------------------------------------------------------------ */
  var bar = document.querySelector(".progress");
  if (bar) {
    gsap.set(bar, { width: "0%" });
    ST.create({
      start: 0,
      end: function () { return document.documentElement.scrollHeight - window.innerHeight; },
      onUpdate: function (self) { bar.style.width = (self.progress * 100).toFixed(2) + "%"; }
    });
  }

  if (reduce) { ST.refresh(); return; }

  /* ------------------------------------------------------------------
     1b · homepage only: the hero-to-first-section handoff
     Scoped to index.html by checking for .hero, which only that page has.
     Everything here targets elements reveal.js does not touch, so nothing
     double-writes a transform: .hero__grid/.hero__orbs are siblings of
     .hero__inner, not children of it, and .trust__marquee is a plain
     wrapper div that never matches reveal.js's TARGETS or SKIP_WITHIN
     lists. reveal.js still owns the one-shot entrance of .hero__copy and
     of .trust__label (it matches "main > section > .container > p");
     this only adds a scroll-linked layer on top, on different elements.
     ------------------------------------------------------------------ */
  var hero = document.querySelector(".hero");
  if (hero) {
    var heroBg = gsap.utils.toArray(".hero__grid, .hero__orbs");
    if (heroBg.length) {
      gsap.to(heroBg, {
        yPercent: 14, opacity: 0.4, ease: "none",
        scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: 0.6 }
      });
    }

    var heroScrollCue = document.querySelector(".hero__scroll");
    if (heroScrollCue) {
      gsap.to(heroScrollCue, {
        opacity: 0, yPercent: -30, ease: "none",
        scrollTrigger: { trigger: hero, start: "top top", end: "20% top", scrub: 0.4 }
      });
    }

    var trustMarquee = document.querySelector(".trust__marquee");
    if (trustMarquee) {
      gsap.fromTo(trustMarquee, { autoAlpha: 0, y: 24 }, {
        autoAlpha: 1, y: 0, ease: "none",
        scrollTrigger: { trigger: trustMarquee, start: "top bottom", end: "top 65%", scrub: 0.5 }
      });
    }
  }

  /* ------------------------------------------------------------------
     2 · the scrubbed effects, scaled to the viewport
     ------------------------------------------------------------------ */
  gsap.matchMedia().add("(min-width: 900px)", function () {

    /* --- parallax on the instrument panels -----------------------------
       These SVGs sit inside a [data-reveal] card but are not themselves
       revealed, so nothing else is writing their transform. A small drift
       against the card gives the consoles some depth as they pass. */
    var panels = gsap.utils.toArray([
      ".mpanel__console svg", ".mfx svg", ".arc__viz svg", ".cvcmp svg",
      ".vcon", ".loopwrap svg", ".modflow svg"
    ].join(","));

    panels.forEach(function (el) {
      gsap.fromTo(el, { yPercent: 4 }, {
        yPercent: -4, ease: "none",
        scrollTrigger: { trigger: el, start: "top bottom", end: "bottom top", scrub: 0.6 }
      });
    });

    /* --- section eyebrows drift in from the scroll ---------------------
       The kicker is a small element with no reveal of its own on most
       pages, so it can carry a little scroll-linked movement. */
    gsap.utils.toArray(".sec__head .kicker").forEach(function (el) {
      gsap.fromTo(el, { x: -14 }, {
        x: 0, ease: "none",
        scrollTrigger: { trigger: el, start: "top bottom", end: "top 55%", scrub: 0.5 }
      });
    });

    /* --- long decorative strokes draw as you pass them -----------------
       Opt in with data-gs-draw so it is never guessing which paths are
       structural and which are decoration. */
    gsap.utils.toArray("[data-gs-draw]").forEach(function (el) {
      var len = 0;
      try { len = el.getTotalLength(); } catch (e) { return; }
      if (!len) return;
      gsap.set(el, { strokeDasharray: len, strokeDashoffset: len });
      gsap.to(el, {
        strokeDashoffset: 0, ease: "none",
        scrollTrigger: { trigger: el, start: "top 85%", end: "bottom 45%", scrub: 0.5 }
      });
    });

    return function () {
      /* matchMedia cleanup: leaving stale triggers behind on a resize past
         the breakpoint is how scroll positions drift out of sync */
      ST.getAll().forEach(function (t) { if (t.vars && t.vars.scrub) t.kill(); });
      gsap.set(panels, { clearProps: "transform" });
    };
  });

  /* ------------------------------------------------------------------
     3 · counters that count while you scroll to them
     redesign.js counts on intersection; this makes the number track the
     scroll instead, so scrolling back up rewinds it.
     ------------------------------------------------------------------ */
  gsap.utils.toArray("[data-gs-count]").forEach(function (el) {
    var to = parseFloat(el.getAttribute("data-gs-count")) || 0;
    var suffix = el.getAttribute("data-gs-suffix") || "";
    var obj = { v: 0 };
    gsap.to(obj, {
      v: to, ease: "none",
      onUpdate: function () { el.textContent = Math.round(obj.v) + suffix; },
      scrollTrigger: { trigger: el, start: "top 90%", end: "top 45%", scrub: 0.4 }
    });
  });

  /* ------------------------------------------------------------------
     4 · keep measurements honest
     Fonts landing and images decoding both change element heights after
     the triggers were calculated.
     ------------------------------------------------------------------ */
  window.addEventListener("load", function () { ST.refresh(); });
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { ST.refresh(); });
  }
  if (window.__lenis) window.__lenis.on("scroll", ST.update);
}
})();


;/* js/motion/motion.js */
/* ==========================================================================
   APMS.ai — motion.js
   Pointer-driven interaction: card tilt and magnetic buttons.

   The performance shape of this file matters more than the effects in it. The
   site holds a 16.7ms median frame while scrolling and that is not negotiable,
   so:

     · one rAF loop for everything, not one per element
     · pointer handlers only ever store coordinates. All reading of layout is
       done once on enter and cached; all writing happens in the frame. Nothing
       reads and writes in the same breath, which is what causes layout thrash
     · nothing is bound at all on touch or coarse pointers, or under reduced
       motion, or below 900px
     · will-change is set on enter and released on leave, never left on

   Applied by selector so no page markup needs editing.
   ========================================================================== */
(function () {
  "use strict";

  var mqFine = window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)");
  var mqReduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
  if (!mqFine || !mqFine.matches) return;
  if (mqReduce && mqReduce.matches) return;
  if (window.innerWidth < 900) return;

  /* ------------------------------------------------------------------
     one frame loop, shared
     ------------------------------------------------------------------ */
  var jobs = [];
  var running = false;
  function tick() {
    running = false;
    for (var i = 0; i < jobs.length; i++) jobs[i]();
    jobs.length = 0;
  }
  function schedule(fn) {
    jobs.push(fn);
    if (!running) { running = true; requestAnimationFrame(tick); }
  }

  /* ==================================================================
     1 · card tilt
     ================================================================== */
  var TILT = [
    ".tile", ".mod", ".bento__c", ".arc__card", ".ag-cap", ".ag-pat", ".ag-ind",
    ".mpanel", ".problem__card", ".case", ".fstrip__cell", ".icard"
  ].join(",");

  var MAX = 6;   /* degrees. Past about 8 the type edges start to shimmer. */

  /* Checked live, not once at bind time.
     drum.js marks its cards [data-no-tilt] because the drum is the only writer
     of transform on them, but drum.js loads AFTER this file. A bind-time-only
     skip therefore attached the tilt anyway, and from then on hovering a drum
     card wrote a tilt over the ring's own positioning: the card jittered while
     the pointer sat still, and pointerleave's `transform = ""` cleared the
     ring transform outright, so the card jumped to the centre until the next
     scroll frame put it back. That is the flicker and the overwrite. */
  function tiltBlocked(card) {
    return !!(card.closest && card.closest("[data-no-tilt]"));
  }

  Array.prototype.forEach.call(document.querySelectorAll(TILT), function (card) {
    if (tiltBlocked(card)) return;

    /* js/enhance.js tags these same cards with the legacy `data-tilt`, and
       enhance.css then does two things we do not want: it kills the transform
       outright (`[data-tilt] { transform: none !important }`, left behind when
       that tilt was retired) and it pins `will-change: transform` permanently,
       which this project's performance rules forbid. Dropping the attribute
       retires it properly and leaves this implementation a clean field. */
    card.removeAttribute("data-tilt");
    card.setAttribute("data-tilt3d", "");
    if (getComputedStyle(card).position === "static") card.style.position = "relative";

    var box = null;          /* measured once per enter, never during move */
    var px = 0, py = 0;

    card.addEventListener("pointerenter", function () {
      if (tiltBlocked(card)) return;
      box = card.getBoundingClientRect();
      card.classList.add("is-tilting");
      card.style.willChange = "transform";
    });

    card.addEventListener("pointermove", function (e) {
      if (!box || tiltBlocked(card)) return;
      px = e.clientX; py = e.clientY;
      schedule(function () {
        if (!box) return;
        var x = (px - box.left) / box.width;
        var y = (py - box.top) / box.height;
        /* The transform is written in full rather than through custom
           properties. `rotateX(var(--rx))` kept resolving to the 0deg fallback
           even with the property set inline on the same element, so the card
           lifted but never rotated. Writing the whole value removes the
           substitution from the equation. The sheen still uses properties,
           because those are only read by a background-image. */
        card.style.transform =
          "perspective(1000px) rotateX(" + ((.5 - y) * 2 * MAX).toFixed(2) + "deg)" +
          " rotateY(" + ((x - .5) * 2 * MAX).toFixed(2) + "deg)" +
          " translate3d(0,-6px,0)";
        card.style.setProperty("--px", (x * 100).toFixed(1) + "%");
        card.style.setProperty("--py", (y * 100).toFixed(1) + "%");
      });
    });

    card.addEventListener("pointerleave", function () {
      /* bail before the reset: clearing transform on a drum card throws away
         the ring's positioning, which is the jump-to-centre bug */
      if (tiltBlocked(card)) { box = null; return; }
      box = null;
      card.classList.remove("is-tilting");
      card.style.transform = "";
      /* release the layer once the card has settled back */
      setTimeout(function () { card.style.willChange = "auto"; }, 520);
    });
  });

  /* ==================================================================
     2 · magnetic buttons
     A small pull toward the pointer. 6px is enough to feel intentional
     and small enough that the button never leaves its own hit area.
     ================================================================== */
  var PULL = 6;
  Array.prototype.forEach.call(
    document.querySelectorAll(".btn--primary, .btn--lg, .totop, .ptab"),
    function (btn) {
      btn.setAttribute("data-magnetic", "");
      var box = null, mx = 0, my = 0;

      btn.addEventListener("pointerenter", function () {
        box = btn.getBoundingClientRect();
        btn.style.willChange = "transform";
      });
      btn.addEventListener("pointermove", function (e) {
        if (!box) return;
        mx = e.clientX; my = e.clientY;
        schedule(function () {
          if (!box) return;
          var dx = (mx - (box.left + box.width / 2)) / box.width;
          var dy = (my - (box.top + box.height / 2)) / box.height;
          btn.style.transform = "translate3d(" + (dx * PULL).toFixed(2) + "px," +
                                (dy * PULL).toFixed(2) + "px,0)";
        });
      });
      btn.addEventListener("pointerleave", function () {
        box = null;
        btn.style.transform = "";
        setTimeout(function () { btn.style.willChange = "auto"; }, 480);
      });
    }
  );

  /* ==================================================================
     3 · the cursor ring: removed
     A teal ring used to trail the pointer and swell over anything
     interactive. In a screenshot it read as a stray circle sitting on the
     page rather than as part of the cursor, so it is gone and the real
     cursor is the only cursor. The .cursor styles went with it.
     Removing it also drops a document-level pointermove listener and its
     rAF loop, so the pointer costs nothing at all when nothing is hovered.
     ================================================================== */
})();

