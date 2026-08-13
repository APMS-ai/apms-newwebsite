/* ==========================================================================
   APMS.ai — formfx.js
   Motion for signin.html and contact.html.

   Split of responsibility, same as everywhere else on the site:
     GSAP        the entrance, because a staggered timeline is what it is for
     CSS classes the states, so a keystroke shows a result on the same frame
                 rather than waiting for script to run

   The padlock on the sign-in page reports the state of the form in front of
   you and nothing more. It is not a claim about the transport, the server or
   any certification, and js/signin.js still carries the list of controls the
   server has to enforce.
   ========================================================================== */
(function () {
  "use strict";

  var gsap = window.gsap;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ==================================================================
     1 · entrances
     ================================================================== */
  function intro(steps) {
    if (!gsap || reduce) return;
    var tl = gsap.timeline({ defaults: { ease: "power3.out", duration: .6 } });
    steps.forEach(function (s) {
      var els = gsap.utils.toArray(s.sel);
      if (!els.length) return;
      tl.from(els, {
        y: s.y === undefined ? 18 : s.y,
        opacity: 0,
        stagger: s.stagger === undefined ? 0.07 : s.stagger
      }, s.at);
    });
    return tl;
  }

  /* ---------- sign in ---------- */
  if (document.body.classList.contains("si-page")) {
    intro([
      { sel: ".si__card h1", at: 0.1, y: 22, stagger: 0 },
      { sel: ".si__lead", at: 0.2, y: 14, stagger: 0 },
      { sel: ".silock", at: 0.28, y: 10, stagger: 0 },
      { sel: ".si__sso button", at: 0.34, stagger: 0.08 },
      { sel: ".si__or", at: 0.56, y: 8, stagger: 0 },
      { sel: "#signin-form .field", at: 0.62, stagger: 0.09 },
      { sel: ".si__row, .si__submit, .si__legal", at: 0.8, y: 12, stagger: 0.08 }
    ]);
  }

  /* ---------- book a demo ---------- */
  if (document.getElementById("contact-form")) {
    intro([
      { sel: "#contact-form .field", at: 0.15, stagger: 0.08 },
      { sel: "#contact-form .btn, #contact-form .form__note", at: 0.5, y: 12, stagger: 0.08 }
    ]);
  }

  /* ==================================================================
     2 · per-field validity, and the padlock that follows it
     ================================================================== */
  function markOk(field, ok) {
    if (!field) return;
    field.classList.toggle("is-ok", !!ok);
  }

  function wrapOf(input) { return input.closest ? input.closest(".field") : null; }

  /* deliberately loose: this is feedback, not validation. The server decides
     what is actually true, and js/signin.js says so at length. */
  function looksLikeEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()); }

  function watch(input, test) {
    if (!input) return;
    var run = function () { markOk(wrapOf(input), input.value && test(input.value)); };
    input.addEventListener("input", run);
    input.addEventListener("blur", run);
    run();
    return run;
  }

  /* ---------- sign in: the lock closes when both fields hold something ---------- */
  var lock = document.querySelector(".silock");
  var siEmail = document.getElementById("si-email");
  var siPass = document.getElementById("si-pass");

  if (siEmail || siPass) {
    var lockTxt = lock && lock.querySelector(".silock__txt");
    var syncLock = function () {
      if (!lock) return;
      var ready = siEmail && looksLikeEmail(siEmail.value) &&
                  siPass && siPass.value.length >= 8;
      var was = lock.classList.contains("is-locked");
      lock.classList.toggle("is-locked", !!ready);
      if (lockTxt && was !== !!ready) {
        lockTxt.textContent = ready ? "Ready to sign in" : "Waiting for your details";
      }
    };
    var e1 = watch(siEmail, looksLikeEmail);
    var e2 = watch(siPass, function (v) { return v.length >= 8; });
    [siEmail, siPass].forEach(function (el) {
      if (!el) return;
      el.addEventListener("input", syncLock);
      el.addEventListener("blur", syncLock);
    });
    syncLock();
    /* the reveal toggle re-focuses the field, so keep the tick placed right */
    var rv = document.getElementById("si-reveal");
    if (rv) rv.addEventListener("click", function () { if (e2) e2(); });
  }

  /* ---------- book a demo: tick the required fields as they fill ---------- */
  var cf = document.getElementById("contact-form");
  if (cf) {
    /* every field on this form is required, so every field gets a tick.
       The thresholds match the checks in redesign.js that gate submit. */
    watch(document.getElementById("cf-name"), function (v) { return v.trim().length > 1; });
    watch(document.getElementById("cf-email"), looksLikeEmail);
    /* same rule the submit gate uses: whatever the chosen country's is */
    watch(document.getElementById("cf-phone"), function (v) {
      return window.APMSPhone ? window.APMSPhone.ok() : v.replace(/\D/g, "").length >= 7;
    });
    watch(document.getElementById("cf-company"), function (v) { return v.trim().length > 1; });
    watch(document.getElementById("cf-msg"), function (v) { return v.trim().length > 9; });

    /* The submit button shows it is working. redesign.js owns what actually
       happens and registers its listener first, so by the time this runs any
       failing field is already marked: a blocked submit must not pretend to
       be in progress. */
    cf.addEventListener("submit", function () {
      var btn = cf.querySelector('button[type="submit"]');
      if (!btn || cf.querySelector(".field.is-bad")) return;
      btn.classList.add("is-working");
      setTimeout(function () { btn.classList.remove("is-working"); }, 1600);
    });
  }

  /* the sign-in submit gets the same treatment */
  var sf = document.getElementById("signin-form");
  if (sf) {
    sf.addEventListener("submit", function () {
      var btn = document.getElementById("si-submit");
      if (!btn || btn.disabled) return;
      btn.classList.add("is-working");
      setTimeout(function () { btn.classList.remove("is-working"); }, 1400);
    });
  }
})();
