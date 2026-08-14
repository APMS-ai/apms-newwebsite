/* ==========================================================================
   APMS.ai — formfx.js
   Motion for the page built around a form: contact.html.

   Split of responsibility, same as everywhere else on the site:
     GSAP        the entrance, because a staggered timeline is what it is for
     CSS classes the states, so a keystroke shows a result on the same frame
                 rather than waiting for script to run

   It also carried the sign-in page: an entrance timeline, a padlock that
   closed as the two fields filled, and a submit handler. There is no sign-in
   page on this site and none of those hooks existed on any of the eleven
   pages, so they went in the cleanup audit. Git history has them.
   ========================================================================== */
(function () {
  "use strict";

  /* Read at call time, not at load: gsap arrives with the first interaction
     now, and this file is evaluated long before that. See js/core/gsap-late.js. */
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ==================================================================
     1 · entrances
     ================================================================== */
  function intro(steps) {
    var gsap = window.gsap;
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

  /* deliberately loose: this is feedback, not validation. submit.php decides
     what is actually true. */
  function looksLikeEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()); }

  function watch(input, test) {
    if (!input) return;
    var run = function () { markOk(wrapOf(input), input.value && test(input.value)); };
    input.addEventListener("input", run);
    input.addEventListener("blur", run);
    run();
    return run;
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

})();
