/* ==========================================================================
   APMS.ai — phone.js
   International dialling code on the Book a Demo phone field, and the number
   rules for whichever country is picked.

   The field was one free-text box checked for "seven digits or more", which
   accepted 1234567 from anywhere and gave a sales team no way to dial back a
   number typed without its country code. It is now a country select plus a
   national number, and the rules follow the selection: India wants 10 digits
   starting 6 to 9, Qatar wants 8, Germany wants 10 or 11.

   Honest about its limits: this validates the dialling code, the digit count
   and, where it is unambiguous, the leading digits. It is not a carrier-level
   lookup and does not claim a number is live. There is no build step on this
   site, so a full libphonenumber is not on the table; a table of lengths is,
   and it catches the mistakes people actually make (missing digits, an extra
   digit, the wrong country).

   What gets submitted:
     · With JS, a hidden input named "phone" carries the composed E.164 form,
       "+919876543210", and the visible box is renamed so it does not also
       post. submit.php is unchanged: it still sees one "phone" field.
     · Without JS, the visible box keeps name="phone" and the old server-side
       check applies. Nothing about the no-JS path got worse.

   The trunk "0" people type out of habit (0 98765 43210) is dropped when the
   number is composed, because E.164 never carries it. That is a real rule,
   not a guess: it is the national trunk prefix, and it is never dialled from
   abroad.
   ========================================================================== */
(function () {
  "use strict";

  /* iso, name, dialling code, min and max national digits, an example.
     Lengths are the national significant number, trunk 0 excluded. Where a
     country's numbers genuinely vary in length the range says so rather than
     pretending to a precision this table does not have. */
  var C = [
    ["IN", "India",            "91",  10, 10, "98765 43210"],
    ["US", "United States",    "1",   10, 10, "201 555 0123"],
    ["CA", "Canada",           "1",   10, 10, "204 555 0123"],
    ["GB", "United Kingdom",   "44",   9, 10, "7400 123456"],
    ["AE", "United Arab Emirates", "971", 8, 9, "50 123 4567"],
    ["SA", "Saudi Arabia",     "966",  9,  9, "51 234 5678"],
    ["QA", "Qatar",            "974",  8,  8, "3312 3456"],
    ["KW", "Kuwait",           "965",  8,  8, "5012 3456"],
    ["BH", "Bahrain",          "973",  8,  8, "3600 1234"],
    ["OM", "Oman",             "968",  8,  8, "9212 3456"],
    ["AU", "Australia",        "61",   9,  9, "412 345 678"],
    ["NZ", "New Zealand",      "64",   8, 10, "21 123 4567"],
    ["SG", "Singapore",        "65",   8,  8, "8123 4567"],
    ["MY", "Malaysia",         "60",   9, 10, "12 345 6789"],
    ["ID", "Indonesia",        "62",   9, 12, "812 3456 7890"],
    ["TH", "Thailand",         "66",   9,  9, "81 234 5678"],
    ["VN", "Vietnam",          "84",   9, 10, "91 234 5678"],
    ["PH", "Philippines",      "63",  10, 10, "917 123 4567"],
    ["JP", "Japan",            "81",   9, 10, "90 1234 5678"],
    ["KR", "South Korea",      "82",   9, 10, "10 1234 5678"],
    ["CN", "China",            "86",  11, 11, "131 2345 6789"],
    ["HK", "Hong Kong",        "852",  8,  8, "5123 4567"],
    ["TW", "Taiwan",           "886",  9,  9, "912 345 678"],
    ["BD", "Bangladesh",       "880", 10, 10, "1812 345678"],
    ["LK", "Sri Lanka",        "94",   9,  9, "71 234 5678"],
    ["NP", "Nepal",            "977", 10, 10, "984 1234567"],
    ["PK", "Pakistan",         "92",  10, 10, "301 2345678"],
    ["DE", "Germany",          "49",  10, 11, "1512 3456789"],
    ["FR", "France",           "33",   9,  9, "6 12 34 56 78"],
    ["IT", "Italy",            "39",   9, 11, "312 345 6789"],
    ["ES", "Spain",            "34",   9,  9, "612 345 678"],
    ["PT", "Portugal",         "351",  9,  9, "912 345 678"],
    ["NL", "Netherlands",      "31",   9,  9, "6 12345678"],
    ["BE", "Belgium",          "32",   8,  9, "470 12 34 56"],
    ["CH", "Switzerland",      "41",   9,  9, "78 123 45 67"],
    ["AT", "Austria",          "43",   7, 13, "664 1234567"],
    ["SE", "Sweden",           "46",   7, 13, "70 123 45 67"],
    ["NO", "Norway",           "47",   8,  8, "406 12 345"],
    ["DK", "Denmark",          "45",   8,  8, "32 12 34 56"],
    ["FI", "Finland",          "358",  6, 12, "41 2345678"],
    ["IE", "Ireland",          "353",  7,  9, "85 123 4567"],
    ["PL", "Poland",           "48",   9,  9, "512 345 678"],
    ["CZ", "Czechia",          "420",  9,  9, "601 123 456"],
    ["HU", "Hungary",          "36",   8,  9, "20 123 4567"],
    ["RO", "Romania",          "40",   9,  9, "712 345 678"],
    ["GR", "Greece",           "30",  10, 10, "691 234 5678"],
    ["TR", "Turkey",           "90",  10, 10, "532 123 4567"],
    ["RU", "Russia",           "7",   10, 10, "912 345 6789"],
    ["UA", "Ukraine",          "380",  9,  9, "50 123 4567"],
    ["IL", "Israel",           "972",  9,  9, "50 123 4567"],
    ["EG", "Egypt",            "20",  10, 10, "100 123 4567"],
    ["ZA", "South Africa",     "27",   9,  9, "71 123 4567"],
    ["NG", "Nigeria",          "234", 10, 10, "802 123 4567"],
    ["KE", "Kenya",            "254",  9,  9, "712 345 678"],
    ["GH", "Ghana",            "233",  9,  9, "24 123 4567"],
    ["TZ", "Tanzania",         "255",  9,  9, "621 234 567"],
    ["MA", "Morocco",          "212",  9,  9, "650 123456"],
    ["BR", "Brazil",           "55",  10, 11, "11 96123 4567"],
    ["MX", "Mexico",           "52",  10, 10, "55 1234 5678"],
    ["AR", "Argentina",        "54",  10, 10, "11 2345 6789"],
    ["CL", "Chile",            "56",   9,  9, "9 6123 4567"],
    ["CO", "Colombia",         "57",  10, 10, "301 234 5678"],
    ["PE", "Peru",             "51",   9,  9, "912 345 678"]
  ];

  /* The few leading-digit rules that are unambiguous and worth enforcing.
     Anything less certain is left to the length check rather than guessed at,
     because a validator that rejects a real number is worse than one that
     accepts a fake one. */
  var LEAD = {
    IN: [/^[6-9]/,      "An Indian mobile number starts with 6, 7, 8 or 9."],
    /* NANP: neither the area code nor the exchange code can start 0 or 1 */
    US: [/^[2-9]\d\d[2-9]/, "A US number starts with a 2 to 9 area code."],
    CA: [/^[2-9]\d\d[2-9]/, "A Canadian number starts with a 2 to 9 area code."],
    CN: [/^1/,          "A Chinese mobile number starts with 1."],
    PK: [/^3/,          "A Pakistani mobile number starts with 3."],
    BD: [/^1/,          "A Bangladeshi mobile number starts with 1."]
  };

  var sel   = document.getElementById("cf-cc");
  var input = document.getElementById("cf-phone");
  if (!sel || !input) return;

  /* ---------- build the list ---------- */
  var byIso = {};
  C.forEach(function (c) {
    byIso[c[0]] = { iso: c[0], name: c[1], dial: c[2], min: c[3], max: c[4], eg: c[5] };
    var o = document.createElement("option");
    o.value = c[0];
    /* the name first, so typing "ger" in an open native select finds Germany */
    o.textContent = c[1] + " +" + c[2];
    sel.appendChild(o);
  });
  sel.value = "IN";

  /* The hidden field is what posts. Renaming the visible one is what keeps
     submit.php seeing exactly one "phone", and doing it here means the no-JS
     form still posts the visible box under the old name. */
  var hidden = document.createElement("input");
  hidden.type = "hidden";
  hidden.name = "phone";
  input.setAttribute("name", "phone_national");
  input.parentNode.appendChild(hidden);

  function country() { return byIso[sel.value] || byIso.IN; }

  /* digits only, and without the trunk 0 that E.164 never carries */
  function digits() {
    var d = input.value.replace(/\D/g, "");
    return d.replace(/^0+/, "");
  }

  function compose() {
    var d = digits();
    hidden.value = d ? "+" + country().dial + d : "";
  }

  /* ---------- the public check, used by redesign.js and formfx.js ---------- */
  function state() {
    var c = country(), d = digits();
    if (!d) return { ok: false, msg: "Enter your phone number." };
    if (d.length < c.min) {
      return { ok: false, msg: "Numbers in " + c.name + " are " + span(c) +
                               " digits. That is " + (c.min - d.length) + " short." };
    }
    if (d.length > c.max) {
      return { ok: false, msg: "Numbers in " + c.name + " are " + span(c) +
                               " digits. That is " + (d.length - c.max) + " too many." };
    }
    var lead = LEAD[c.iso];
    if (lead && !lead[0].test(d)) return { ok: false, msg: lead[1] };
    return { ok: true, msg: "" };
  }

  function span(c) { return c.min === c.max ? String(c.min) : c.min + " to " + c.max; }

  window.APMSPhone = {
    ok:  function () { return state().ok; },
    msg: function () { return state().msg; },
    e164: function () { return hidden.value; }
  };

  /* ---------- keeping the field in step ---------- */
  function onCountry() {
    var c = country();
    input.setAttribute("placeholder", c.eg);
    input.setAttribute("aria-label", "Phone number, " + c.name + ", country code plus " + c.dial);
    /* max is national digits; the separators people type need room too */
    input.setAttribute("maxlength", String(c.max + 8));
    compose();
    /* re-check only a field that has already been complained about, so
       changing the country never raises a fresh complaint mid-answer */
    var wrap = input.closest(".field");
    if (wrap && wrap.classList.contains("is-bad")) revalidate();
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function revalidate() {
    /* redesign.js owns the error slot; poke it the way a blur would */
    input.dispatchEvent(new Event("blur", { bubbles: false }));
  }

  sel.addEventListener("change", onCountry);
  input.addEventListener("input", compose);
  input.addEventListener("blur", compose);
  onCountry();
}());
