/* ==========================================================================
   APMS Analyst , embedded chat card (vanilla, dependency-free)
   Renders INLINE into an element carrying [data-analyst]. If none exists on
   the page, nothing is created. Canned demo responses (no backend).
   Respects prefers-reduced-motion via CSS.
   ========================================================================== */
(function () {
  "use strict";
  var host = document.querySelector("[data-analyst]");
  if (!host || host.querySelector(".acbot")) return;          // only where opted in
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  var ORB = '<b></b><b></b><b></b>';
  var SPARKLE =
    '<svg viewBox="0 0 40 40" aria-hidden="true">' +
      '<rect width="40" height="40" rx="11" fill="#17c99b"/>' +
      '<path fill="#06231d" d="M16 7c1 8.2 1.8 9 10 10-8.2 1-9 1.8-10 10-1-8.2-1.8-9-10-10 8.2-1 9-1.8 10-10z"/>' +
      '<path fill="#06231d" d="M28.5 22c.5 4.6.9 5 5.5 5.5-4.6.5-5 .9-5.5 5.5-.5-4.6-.9-5-5.5-5.5 4.6-.5 5-.9 5.5-5.5z"/>' +
    '</svg>';

  /* ---------- canned knowledge (demo) ---------- */
  var REPLIES = [
    { k: ["plant today", "how's the plant", "hows the plant", "status"], html:
      "Plant OEE is <b>78.4%</b> right now, up 2.1% on yesterday. <b>142 of 148</b> machines are connected and 6 are running on Line 2.<br><br>One active alert: <b>Press-03</b> stopped 4 min ago (tool-change overrun). Want me to open it?" },
    { k: ["top 5", "top products", "products this month"], html:
      "Your top 5 products by output this month:" +
      "<ul><li><b>Bracket A-200</b>: 48,120 pcs</li><li><b>Housing H-14</b>: 39,640 pcs</li><li><b>Shaft S-9</b>: 31,205 pcs</li><li><b>Cover C-3</b> , 27,880 pcs</li><li><b>Flange F-7</b> , 22,410 pcs</li></ul>" },
    { k: ["worst machine", "machine down", "why is my worst", "downtime"], html:
      "<b>Press-03</b> is your biggest loss driver this week, with 3 unplanned stops totalling <b>48 min</b>, all tagged <b>tool-change overrun</b>. MTTR is trending up 12%.<br><br>I'd flag it to maintenance. Shall I raise a work order?" },
    { k: ["pdf", "report", "last week"], html:
      "I can build a shift-by-shift <b>OEE, downtime and quality</b> report for last week. In this demo the export isn't wired up. In production it lands in your inbox as a PDF.<br><br>Want a preview of the summary instead?" },
    { k: ["quality", "scrap", "reject", "fpy"], html:
      "First-pass yield is <b>97.2%</b> this shift. Top reject reason is surface finish on the Cover C-3 line. Scrap is down 0.4pts week-on-week." },
    { k: ["maintenance", "predictive"], html:
      "Two assets are flagged for attention: <b>Press-03</b> (tool wear) and <b>VMC-01</b> (spindle temperature drift). No breakdowns predicted in the next 72h at current load." }
  ];
  var FALLBACK =
    "That's exactly the kind of question APMS Analyst answers from your live floor data. This is a demo, so I'm working from sample data, so <b>book a demo</b> and I'll answer it on your own machines.";

  function answer(text) {
    var t = text.toLowerCase();
    for (var i = 0; i < REPLIES.length; i++) {
      for (var j = 0; j < REPLIES[i].k.length; j++) {
        if (t.indexOf(REPLIES[i].k[j]) !== -1) return REPLIES[i].html;
      }
    }
    return FALLBACK;
  }

  /* ---------- build inline card ---------- */
  var panel = document.createElement("div");
  panel.className = "acbot acbot--inline";
  panel.innerHTML =
    '<div class="acbot__head">' +
      '<span class="acbot__avatar">' + SPARKLE + '</span>' +
      '<div class="acbot__id"><b>APMS Analyst</b><span>Lite · demo</span></div>' +
      '<button class="acbot__hist" type="button" aria-label="History"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l3 2"/></svg></button>' +
    '</div>' +
    '<div class="acbot__body">' +
      '<div class="acbot__welcome">' +
        '<span class="orb">' + ORB + '</span>' +
        '<h3>How can I help you today?</h3>' +
        '<p>Ask about production, downtime, quality, maintenance, operators and more.</p>' +
        '<div class="acbot__chips">' +
          '<button class="acbot__chip" type="button">How\'s the plant today?</button>' +
          '<button class="acbot__chip" type="button">Top 5 products this month</button>' +
          '<button class="acbot__chip" type="button">Why is my worst machine down?</button>' +
          '<button class="acbot__chip" type="button">Make a PDF report of last week</button>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<form class="acbot__foot">' +
      '<button class="acbot__mic" type="button" aria-label="Voice input"><span class="acbot__wave"><i></i><i></i><i></i><i></i><i></i></span></button>' +
      '<input class="acbot__input" type="text" placeholder="Ask about your plant…" autocomplete="off" aria-label="Ask about your plant">' +
      '<button class="acbot__send" type="submit" aria-label="Send"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg></button>' +
    '</form>';
  host.appendChild(panel);

  var body = panel.querySelector(".acbot__body");
  var welcome = panel.querySelector(".acbot__welcome");
  var form = panel.querySelector(".acbot__foot");
  var input = panel.querySelector(".acbot__input");
  var sendBtn = panel.querySelector(".acbot__send");
  var mic = panel.querySelector(".acbot__mic");

  input.addEventListener("input", function () { sendBtn.classList.toggle("is-on", input.value.trim().length > 0); });

  function scrollDown() { body.scrollTop = body.scrollHeight; }

  function addMsg(html, who) {
    var m = document.createElement("div");
    m.className = "acbot__msg acbot__msg--" + who;
    m.innerHTML = (who === "bot" ? '<span class="orb">' + ORB + '</span>' : "") +
      '<div class="acbot__bubble">' + html + '</div>';
    body.appendChild(m);
    scrollDown();
    return m;
  }

  function botReply(text) {
    var typing = document.createElement("div");
    typing.className = "acbot__msg acbot__msg--bot";
    typing.innerHTML = '<span class="orb">' + ORB + '</span><div class="acbot__bubble"><span class="acbot__typing"><i></i><i></i><i></i></span></div>';
    body.appendChild(typing);
    scrollDown();
    setTimeout(function () {
      typing.remove();
      addMsg(answer(text), "bot");
    }, reduce ? 250 : 750);
  }

  function send(text) {
    text = (text || "").trim();
    if (!text) return;
    if (welcome) { welcome.remove(); welcome = null; }
    addMsg(text.replace(/</g, "&lt;"), "user");
    input.value = ""; sendBtn.classList.remove("is-on");
    botReply(text);
  }

  form.addEventListener("submit", function (e) { e.preventDefault(); send(input.value); });
  panel.querySelectorAll(".acbot__chip").forEach(function (c) {
    c.addEventListener("click", function () { send(c.textContent); });
  });

  /* voice button , visual demo (no speech backend) */
  mic.addEventListener("click", function () {
    mic.classList.add("is-live");
    input.setAttribute("placeholder", "Listening… (voice is a demo)");
    setTimeout(function () {
      mic.classList.remove("is-live");
      input.setAttribute("placeholder", "Ask about your plant…");
    }, 1800);
  });
})();
