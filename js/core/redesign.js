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

  /* ---------- Active Machines app: stagger the status-bar reveal ---------- */
  var appList = document.querySelector("[data-app-list]");
  if (appList && "IntersectionObserver" in window) {
    var rows = Array.prototype.slice.call(appList.querySelectorAll(".app__row"));
    var aobs = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        rows.forEach(function (r, i) {
          if (reduce) { r.classList.add("in"); return; }
          setTimeout(function () { r.classList.add("in"); }, i * 90);
        });
        aobs.disconnect();
      });
    }, { threshold: 0.3 });
    aobs.observe(appList);
  } else if (appList) {
    appList.querySelectorAll(".app__row").forEach(function (r) { r.classList.add("in"); });
  }

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

  /* ---------- FAQ accordion ---------- */
  document.querySelectorAll(".faq__item").forEach(function (item) {
    var q = item.querySelector(".faq__q");
    if (!q) return;
    q.setAttribute("aria-expanded", "false");
    q.addEventListener("click", function () {
      var open = item.classList.contains("open");
      document.querySelectorAll(".faq__item.open").forEach(function (o) {
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
      { id: "cf-phone",   max: 40,   msg: "Enter a phone number, including country code.",
        ok: function (v) { return (v.replace(/\D/g, "").length >= 7); } },
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
        if (first) { setTimeout(function () { first.focus(); }, reduce ? 0 : 450); }
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
      return setFieldError(el, spec.ok(v) ? "" : spec.msg);
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
          if (head) { setTimeout(function () { head.focus(); }, reduce ? 0 : 850); }
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
