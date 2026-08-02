/* ==========================================================================
   APMS.ai — analyst.js
   The Analyst panel on the platform page.

   Three real questions get three real answers. Anything else gets matched by
   keyword against those three; if nothing matches, the panel says plainly
   that it only demonstrates those three patterns today, rather than
   pretending to have read a floor it has no connection to.

   Note for whoever wires this up later: the questions people type here are
   the most useful thing on the site, and right now they are thrown away.
   Sending them to the same endpoint as the demo form would cost very little.
   ========================================================================== */
(function () {
  "use strict";

  var root = document.querySelector("[data-analyst]");
  if (!root) return;

  var log = root.querySelector(".anl__log");
  var form = root.querySelector(".anl__form");
  var input = root.querySelector(".anl__input");
  var send = root.querySelector(".anl__send");
  var chipsWrap = root.querySelector("[data-analyst-chips]");
  if (!log || !form || !input) return;

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Three fixed questions, three fixed answers. Each shows the same shape:
     the direct reply first, the number behind it, then the next action. */
  var QA = [
    {
      q: "Why is my worst machine down?",
      keywords: ["worst machine", "machine down", "why is my machine"],
      a: "<b>Press-03 has been down 18 minutes</b>, tagged tool change overrun. " +
         "It is the third stop this shift and the largest single loss on the line " +
         "this week, at about 47 minutes.<br><br>" +
         "Next: raise a work order against Press-03, or see the other four stops " +
         "behind that 47 minutes."
    },
    {
      q: "What's driving my OEE down right now?",
      keywords: ["oee"],
      a: "<b>OEE is at 68% right now</b>, down from an 81% weekly average. Availability " +
         "is the biggest drag at 74%, driven by the Press-03 changeover above.<br><br>" +
         "Next: drill into availability losses, or see how performance and quality compare."
    },
    {
      q: "Where are today's quality rejects coming from?",
      keywords: ["quality", "reject"],
      a: "<b>Station 4 accounts for 61% of today's rejects</b>, 34 parts against 56 " +
         "total, mostly flagged for surface defects.<br><br>" +
         "Next: pull the Station 4 inspection images, or see the reject trend for this shift."
    }
  ];

  var FALLBACK =
    "These are the kinds of questions APMS Analyst answers for you.<br><br>" +
    "<a class='anl__cta' href='contact.html'>Book a demo</a> for more.";

  function bubble(kind, html) {
    var el = document.createElement("div");
    el.className = "anl__msg anl__msg--" + kind;
    el.innerHTML = html;
    log.appendChild(el);
    /* keep the newest message in view without moving the page itself */
    log.scrollTop = log.scrollHeight;
    return el;
  }

  function escapeHtml(q) {
    return q.replace(/[<>&]/g, function (ch) {
      return { "<": "&lt;", ">": "&gt;", "&": "&amp;" }[ch];
    });
  }

  function matchAnswer(q) {
    var norm = q.toLowerCase();
    for (var i = 0; i < QA.length; i++) {
      if (norm === QA[i].q.toLowerCase()) return QA[i].a;
    }
    for (var j = 0; j < QA.length; j++) {
      var kws = QA[j].keywords;
      for (var k = 0; k < kws.length; k++) {
        if (norm.indexOf(kws[k]) !== -1) return QA[j].a;
      }
    }
    return FALLBACK;
  }

  var busy = false;

  function ask(q) {
    if (!q || busy) return;

    busy = true;
    if (send) send.disabled = true;
    if (chipsWrap) chipsWrap.querySelectorAll(".anl__chip").forEach(function (c) { c.disabled = true; });

    bubble("you", escapeHtml(q));

    var answer = matchAnswer(q);
    var thinking = bubble("ai",
      "<span class='anl__dots'><i></i><i></i><i></i></span>");

    setTimeout(function () {
      thinking.innerHTML = answer;
      log.scrollTop = log.scrollHeight;
      busy = false;
      if (send) send.disabled = !input.value.trim();
      if (chipsWrap) chipsWrap.querySelectorAll(".anl__chip").forEach(function (c) { c.disabled = false; });
      input.focus();
    }, reduce ? 0 : 700);
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var q = (input.value || "").trim();
    if (!q) return;
    input.value = "";
    ask(q);
  });

  if (chipsWrap) {
    chipsWrap.addEventListener("click", function (e) {
      var chip = e.target.closest(".anl__chip");
      if (!chip) return;
      ask(chip.getAttribute("data-q"));
    });
  }

  input.addEventListener("input", function () {
    if (send) send.disabled = !input.value.trim();
  });
  if (send) send.disabled = true;
})();
