/* ==========================================================================
   APMS.ai — signin.js

   IMPORTANT, AND DELIBERATE: none of this is a security control. Everything
   here is input hygiene and user feedback. A browser cannot authenticate
   anyone, cannot keep a secret, and cannot enforce a rate limit — a caller
   who skips this file gets the same endpoint. The server MUST independently:

     · verify credentials against a salted hash (argon2id / bcrypt)
     · enforce rate limiting and lockout per account AND per IP
     · issue a CSRF token and reject any POST without a valid one
     · set the session cookie HttpOnly + Secure + SameSite=Lax
     · enforce MFA before establishing a session
     · log every attempt, success or failure, with source IP
     · return one identical error for "no such user" and "wrong password",
       so the form cannot be used to enumerate accounts

   What this file legitimately does: validates shape before a round-trip,
   surfaces clear errors, warns about Caps Lock, throttles the obvious
   double-click, and drops submissions that fill the honeypot.
   ========================================================================== */
(function () {
  "use strict";

  var form = document.getElementById("signin-form");
  if (!form) return;

  var email  = document.getElementById("si-email");
  var pass   = document.getElementById("si-pass");
  var trap   = document.getElementById("si-trap");
  var submit = document.getElementById("si-submit");
  var status = document.getElementById("si-status");
  var reveal = document.getElementById("si-reveal");
  var capsMsg = document.getElementById("si-caps");

  /* ---------- reveal the password, and say so out loud ---------- */
  if (reveal && pass) {
    reveal.addEventListener("click", function () {
      var shown = pass.type === "text";
      pass.type = shown ? "password" : "text";
      reveal.setAttribute("aria-label", shown ? "Show password" : "Hide password");
      reveal.setAttribute("aria-pressed", String(!shown));
      pass.focus();
    });
  }

  /* ---------- Caps Lock is the most common cause of a failed sign-in ---------- */
  function caps(e) {
    if (!capsMsg || typeof e.getModifierState !== "function") return;
    capsMsg.textContent = e.getModifierState("CapsLock") ? "Caps Lock is on." : "";
  }
  if (pass) { pass.addEventListener("keydown", caps); pass.addEventListener("keyup", caps); }

  /* ---------- shape checks only; the server decides what is true ---------- */
  function setErr(field, msg) {
    var wrap = field.closest(".field");
    var slot = wrap && wrap.querySelector(".si__err");
    if (slot) slot.textContent = msg || "";
    if (wrap) wrap.classList.toggle("is-bad", !!msg);
    field.setAttribute("aria-invalid", msg ? "true" : "false");
    return !msg;
  }

  function checkEmail() {
    var v = (email.value || "").trim();
    if (!v) return setErr(email, "Enter your work email.");
    /* deliberately permissive: the server is the authority on deliverability */
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return setErr(email, "That does not look like an email address.");
    return setErr(email, "");
  }

  function checkPass() {
    var v = pass.value || "";
    if (!v) return setErr(pass, "Enter your password.");
    if (v.length < 8) return setErr(pass, "Passwords are at least 8 characters.");
    return setErr(pass, "");
  }

  email.addEventListener("blur", checkEmail);
  pass.addEventListener("blur", checkPass);
  email.addEventListener("input", function () { if (email.getAttribute("aria-invalid") === "true") checkEmail(); });
  pass.addEventListener("input", function () { if (pass.getAttribute("aria-invalid") === "true") checkPass(); });

  function say(msg, warn) {
    if (!status) return;
    status.textContent = msg;
    status.classList.add("is-on");
    status.classList.toggle("is-warn", !!warn);
  }

  /* ---------- attempt throttle: a courtesy, not a defence ---------- */
  var tries = 0, until = 0;

  form.addEventListener("submit", function (e) {
    /* honeypot: real people cannot reach this field */
    if (trap && trap.value) { e.preventDefault(); return; }

    var now = Date.now();
    if (now < until) {
      e.preventDefault();
      say("Too many attempts. Try again in " + Math.ceil((until - now) / 1000) + " seconds.", true);
      return;
    }

    var ok = checkEmail() && checkPass();
    if (!ok) {
      e.preventDefault();
      var bad = form.querySelector(".field.is-bad input");
      if (bad) bad.focus();
      return;
    }

    tries++;
    if (tries >= 5) {
      until = now + 30000;
      tries = 0;
      e.preventDefault();
      say("Too many attempts from this browser. Wait 30 seconds before trying again.", true);
      return;
    }

    /* No backend is wired up yet, so stop here rather than pretend to sign in.
       Remove this block once the endpoint exists and let the POST through. */
    e.preventDefault();
    submit.disabled = true;
    say("This form is not connected to an authentication service yet. Wire it to your identity provider or sign-in endpoint to go live.");
    setTimeout(function () { submit.disabled = false; }, 1200);
  });

  /* ---------- SSO buttons ---------- */
  Array.prototype.forEach.call(document.querySelectorAll("[data-sso]"), function (b) {
    b.addEventListener("click", function () {
      say("Single sign-on with " + b.getAttribute("data-sso") + " is not configured yet. Point this button at your identity provider's authorise URL.");
    });
  });
})();
