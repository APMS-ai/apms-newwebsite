/* ==========================================================================
   APMS.ai — analyst.js
   The Analyst panel on the platform page.

   Type anything and one answer comes back. That is the whole design, and the
   answer itself says so. The chat this replaces matched keywords and replied
   as though it had read your plant, which is a promise the page cannot keep:
   nothing here is connected to any data.

   What it is honestly demonstrating is the SHAPE of an APMS answer:
     · the direct reply first, not a dashboard
     · the number that supports it
     · the action available next

   Note for whoever wires this up later: the questions people type here are the
   most useful thing on the site, and right now they are thrown away. Sending
   them to the same endpoint as the demo form would cost very little.
   ========================================================================== */
(function () {
  "use strict";

  var root = document.querySelector("[data-analyst]");
  if (!root) return;

  var log = root.querySelector(".anl__log");
  var form = root.querySelector(".anl__form");
  var input = root.querySelector(".anl__input");
  var send = root.querySelector(".anl__send");
  if (!log || !form || !input) return;

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* One answer, every time. Written to show the shape, and to be plain about
     being a sample rather than a live reading. */
  var ANSWER =
    "<b>Press-03 has been down 18 minutes</b>, tagged tool change overrun. " +
    "It is the third stop this shift and the largest single loss on the line " +
    "this week, at about 47 minutes.<br><br>" +
    "Next: raise a work order against Press-03, or see the other four stops " +
    "behind that 47 minutes." +
    "<span class='anl__note'>Every question here returns this same example, so you " +
    "can see how an answer is put together: the reply first, the number behind " +
    "it, then what you can do. On your floor it is answered from your own live " +
    "machine data.</span>";

  function bubble(kind, html) {
    var el = document.createElement("div");
    el.className = "anl__msg anl__msg--" + kind;
    el.innerHTML = html;
    log.appendChild(el);
    /* keep the newest message in view without moving the page itself */
    log.scrollTop = log.scrollHeight;
    return el;
  }

  var busy = false;

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var q = (input.value || "").trim();
    if (!q || busy) return;

    busy = true;
    if (send) send.disabled = true;

    /* drop the opening hint once a real exchange starts */
    var hint = log.querySelector(".anl__hint");
    if (hint) hint.remove();

    bubble("you", q.replace(/[<>&]/g, function (ch) {
      return { "<": "&lt;", ">": "&gt;", "&": "&amp;" }[ch];
    }));
    input.value = "";

    var thinking = bubble("ai",
      "<span class='anl__dots'><i></i><i></i><i></i></span>");

    setTimeout(function () {
      thinking.innerHTML = ANSWER;
      log.scrollTop = log.scrollHeight;
      busy = false;
      if (send) send.disabled = false;
      input.focus();
    }, reduce ? 0 : 700);
  });

  input.addEventListener("input", function () {
    if (send) send.disabled = !input.value.trim();
  });
  if (send) send.disabled = true;
})();
