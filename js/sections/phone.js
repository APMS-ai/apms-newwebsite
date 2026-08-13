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

  /* Every country and territory with its own dialling code: the name, and the
     code. Where several share one code they are all listed (Guernsey, Jersey
     and the Isle of Man on 44, Kazakhstan on 7), because a visitor looks for
     their own country, not for whoever else answers on the same prefix. */
  var LIST = [
    "AD|Andorra|376",
    "AE|United Arab Emirates|971",
    "AF|Afghanistan|93",
    "AG|Antigua & Barbuda|1268",
    "AI|Anguilla|1264",
    "AL|Albania|355",
    "AM|Armenia|374",
    "AO|Angola|244",
    "AR|Argentina|54",
    "AS|American Samoa|1684",
    "AT|Austria|43",
    "AU|Australia|61",
    "AW|Aruba|297",
    "AZ|Azerbaijan|994",
    "BA|Bosnia & Herzegovina|387",
    "BB|Barbados|1246",
    "BD|Bangladesh|880",
    "BE|Belgium|32",
    "BF|Burkina Faso|226",
    "BG|Bulgaria|359",
    "BH|Bahrain|973",
    "BI|Burundi|257",
    "BJ|Benin|229",
    "BM|Bermuda|1441",
    "BN|Brunei|673",
    "BO|Bolivia|591",
    "BQ|Caribbean Netherlands|599",
    "BR|Brazil|55",
    "BS|Bahamas|1242",
    "BT|Bhutan|975",
    "BW|Botswana|267",
    "BY|Belarus|375",
    "BZ|Belize|501",
    "CA|Canada|1",
    "CD|Congo (Kinshasa)|243",
    "CF|Central African Republic|236",
    "CG|Congo (Brazzaville)|242",
    "CH|Switzerland|41",
    "CI|Cote d'Ivoire|225",
    "CK|Cook Islands|682",
    "CL|Chile|56",
    "CM|Cameroon|237",
    "CN|China|86",
    "CO|Colombia|57",
    "CR|Costa Rica|506",
    "CU|Cuba|53",
    "CV|Cape Verde|238",
    "CW|Curacao|599",
    "CY|Cyprus|357",
    "CZ|Czechia|420",
    "DE|Germany|49",
    "DJ|Djibouti|253",
    "DK|Denmark|45",
    "DM|Dominica|1767",
    "DO|Dominican Republic|1809",
    "DZ|Algeria|213",
    "EC|Ecuador|593",
    "EE|Estonia|372",
    "EG|Egypt|20",
    "ER|Eritrea|291",
    "ES|Spain|34",
    "ET|Ethiopia|251",
    "FI|Finland|358",
    "FJ|Fiji|679",
    "FK|Falkland Islands|500",
    "FM|Micronesia|691",
    "FO|Faroe Islands|298",
    "FR|France|33",
    "GA|Gabon|241",
    "GB|United Kingdom|44",
    "GD|Grenada|1473",
    "GE|Georgia|995",
    "GF|French Guiana|594",
    "GG|Guernsey|44",
    "GH|Ghana|233",
    "GI|Gibraltar|350",
    "GL|Greenland|299",
    "GM|Gambia|220",
    "GN|Guinea|224",
    "GP|Guadeloupe|590",
    "GQ|Equatorial Guinea|240",
    "GR|Greece|30",
    "GT|Guatemala|502",
    "GU|Guam|1671",
    "GW|Guinea-Bissau|245",
    "GY|Guyana|592",
    "HK|Hong Kong|852",
    "HN|Honduras|504",
    "HR|Croatia|385",
    "HT|Haiti|509",
    "HU|Hungary|36",
    "ID|Indonesia|62",
    "IE|Ireland|353",
    "IL|Israel|972",
    "IM|Isle of Man|44",
    "IN|India|91",
    "IQ|Iraq|964",
    "IR|Iran|98",
    "IS|Iceland|354",
    "IT|Italy|39",
    "JE|Jersey|44",
    "JM|Jamaica|1876",
    "JO|Jordan|962",
    "JP|Japan|81",
    "KE|Kenya|254",
    "KG|Kyrgyzstan|996",
    "KH|Cambodia|855",
    "KI|Kiribati|686",
    "KM|Comoros|269",
    "KN|St Kitts & Nevis|1869",
    "KP|North Korea|850",
    "KR|South Korea|82",
    "KW|Kuwait|965",
    "KY|Cayman Islands|1345",
    "KZ|Kazakhstan|7",
    "LA|Laos|856",
    "LB|Lebanon|961",
    "LC|St Lucia|1758",
    "LI|Liechtenstein|423",
    "LK|Sri Lanka|94",
    "LR|Liberia|231",
    "LS|Lesotho|266",
    "LT|Lithuania|370",
    "LU|Luxembourg|352",
    "LV|Latvia|371",
    "LY|Libya|218",
    "MA|Morocco|212",
    "MC|Monaco|377",
    "MD|Moldova|373",
    "ME|Montenegro|382",
    "MG|Madagascar|261",
    "MH|Marshall Islands|692",
    "MK|North Macedonia|389",
    "ML|Mali|223",
    "MM|Myanmar|95",
    "MN|Mongolia|976",
    "MO|Macao|853",
    "MP|Northern Mariana Islands|1670",
    "MQ|Martinique|596",
    "MR|Mauritania|222",
    "MS|Montserrat|1664",
    "MT|Malta|356",
    "MU|Mauritius|230",
    "MV|Maldives|960",
    "MW|Malawi|265",
    "MX|Mexico|52",
    "MY|Malaysia|60",
    "MZ|Mozambique|258",
    "NA|Namibia|264",
    "NC|New Caledonia|687",
    "NE|Niger|227",
    "NF|Norfolk Island|672",
    "NG|Nigeria|234",
    "NI|Nicaragua|505",
    "NL|Netherlands|31",
    "NO|Norway|47",
    "NP|Nepal|977",
    "NR|Nauru|674",
    "NU|Niue|683",
    "NZ|New Zealand|64",
    "OM|Oman|968",
    "PA|Panama|507",
    "PE|Peru|51",
    "PF|French Polynesia|689",
    "PG|Papua New Guinea|675",
    "PH|Philippines|63",
    "PK|Pakistan|92",
    "PL|Poland|48",
    "PM|St Pierre & Miquelon|508",
    "PR|Puerto Rico|1787",
    "PS|Palestine|970",
    "PT|Portugal|351",
    "PW|Palau|680",
    "PY|Paraguay|595",
    "QA|Qatar|974",
    "RE|Reunion|262",
    "RO|Romania|40",
    "RS|Serbia|381",
    "RU|Russia|7",
    "RW|Rwanda|250",
    "SA|Saudi Arabia|966",
    "SB|Solomon Islands|677",
    "SC|Seychelles|248",
    "SD|Sudan|249",
    "SE|Sweden|46",
    "SG|Singapore|65",
    "SH|St Helena|290",
    "SI|Slovenia|386",
    "SK|Slovakia|421",
    "SL|Sierra Leone|232",
    "SM|San Marino|378",
    "SN|Senegal|221",
    "SO|Somalia|252",
    "SR|Suriname|597",
    "SS|South Sudan|211",
    "ST|Sao Tome & Principe|239",
    "SV|El Salvador|503",
    "SX|Sint Maarten|1721",
    "SY|Syria|963",
    "SZ|Eswatini|268",
    "TC|Turks & Caicos Islands|1649",
    "TD|Chad|235",
    "TG|Togo|228",
    "TH|Thailand|66",
    "TJ|Tajikistan|992",
    "TL|Timor-Leste|670",
    "TM|Turkmenistan|993",
    "TN|Tunisia|216",
    "TO|Tonga|676",
    "TR|Turkey|90",
    "TT|Trinidad & Tobago|1868",
    "TV|Tuvalu|688",
    "TW|Taiwan|886",
    "TZ|Tanzania|255",
    "UA|Ukraine|380",
    "UG|Uganda|256",
    "US|United States|1",
    "UY|Uruguay|598",
    "UZ|Uzbekistan|998",
    "VA|Vatican City|379",
    "VC|St Vincent & the Grenadines|1784",
    "VE|Venezuela|58",
    "VG|British Virgin Islands|1284",
    "VI|US Virgin Islands|1340",
    "VN|Vietnam|84",
    "VU|Vanuatu|678",
    "WF|Wallis & Futuna|681",
    "WS|Samoa|685",
    "XK|Kosovo|383",
    "YE|Yemen|967",
    "ZA|South Africa|27",
    "ZM|Zambia|260",
    "ZW|Zimbabwe|263"
  ];

  /* Verified national number lengths, and an example, for the countries this
     site actually hears from: min, max, example.

     Everywhere else falls back to the ITU rule rather than to a guess. E.164
     allows at most 15 digits INCLUDING the dialling code, so the national part
     can be at most 15 minus that code, and 4 is the shortest national number
     in use anywhere. That accepts more than a per-country table would, which
     is the right way round: a validator that rejects a real number is worse
     than one that accepts an implausible one, and submit.php checks again. */
  var LENGTHS = {
    IN:   [10, 10, "98765 43210"],
    US:   [10, 10, "201 555 0123"],
    CA:   [10, 10, "204 555 0123"],
    GB:   [ 9, 10, "7400 123456"],
    AE:   [ 8,  9, "50 123 4567"],
    SA:   [ 9,  9, "51 234 5678"],
    QA:   [ 8,  8, "3312 3456"],
    KW:   [ 8,  8, "5012 3456"],
    BH:   [ 8,  8, "3600 1234"],
    OM:   [ 8,  8, "9212 3456"],
    AU:   [ 9,  9, "412 345 678"],
    NZ:   [ 8, 10, "21 123 4567"],
    SG:   [ 8,  8, "8123 4567"],
    MY:   [ 9, 10, "12 345 6789"],
    ID:   [ 9, 12, "812 3456 7890"],
    TH:   [ 9,  9, "81 234 5678"],
    VN:   [ 9, 10, "91 234 5678"],
    PH:   [10, 10, "917 123 4567"],
    JP:   [ 9, 10, "90 1234 5678"],
    KR:   [ 9, 10, "10 1234 5678"],
    CN:   [11, 11, "131 2345 6789"],
    HK:   [ 8,  8, "5123 4567"],
    TW:   [ 9,  9, "912 345 678"],
    BD:   [10, 10, "1812 345678"],
    LK:   [ 9,  9, "71 234 5678"],
    NP:   [10, 10, "984 1234567"],
    PK:   [10, 10, "301 2345678"],
    DE:   [10, 11, "1512 3456789"],
    FR:   [ 9,  9, "6 12 34 56 78"],
    IT:   [ 9, 11, "312 345 6789"],
    ES:   [ 9,  9, "612 345 678"],
    PT:   [ 9,  9, "912 345 678"],
    NL:   [ 9,  9, "6 12345678"],
    BE:   [ 8,  9, "470 12 34 56"],
    CH:   [ 9,  9, "78 123 45 67"],
    AT:   [ 7, 13, "664 1234567"],
    SE:   [ 7, 13, "70 123 45 67"],
    NO:   [ 8,  8, "406 12 345"],
    DK:   [ 8,  8, "32 12 34 56"],
    FI:   [ 6, 12, "41 2345678"],
    IE:   [ 7,  9, "85 123 4567"],
    PL:   [ 9,  9, "512 345 678"],
    CZ:   [ 9,  9, "601 123 456"],
    HU:   [ 8,  9, "20 123 4567"],
    RO:   [ 9,  9, "712 345 678"],
    GR:   [10, 10, "691 234 5678"],
    TR:   [10, 10, "532 123 4567"],
    RU:   [10, 10, "912 345 6789"],
    UA:   [ 9,  9, "50 123 4567"],
    IL:   [ 9,  9, "50 123 4567"],
    EG:   [10, 10, "100 123 4567"],
    ZA:   [ 9,  9, "71 123 4567"],
    NG:   [10, 10, "802 123 4567"],
    KE:   [ 9,  9, "712 345 678"],
    GH:   [ 9,  9, "24 123 4567"],
    TZ:   [ 9,  9, "621 234 567"],
    MA:   [ 9,  9, "650 123456"],
    BR:   [10, 11, "11 96123 4567"],
    MX:   [10, 10, "55 1234 5678"],
    AR:   [10, 10, "11 2345 6789"],
    CL:   [ 9,  9, "9 6123 4567"],
    CO:   [10, 10, "301 234 5678"],
    PE:   [ 9,  9, "912 345 678"]
  };

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
  LIST.map(function (row) {
    var f = row.split("|"), iso = f[0], dial = f[2];
    var L = LENGTHS[iso];
    byIso[iso] = {
      iso: iso, name: f[1], dial: dial,
      min: L ? L[0] : 4,
      max: L ? L[1] : Math.max(6, 15 - dial.length),
      eg:  L ? L[2] : "Phone number",
      loose: !L
    };
    return byIso[iso];
  }).sort(function (a, b) {
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  }).forEach(function (c) {
    var o = document.createElement("option");
    o.value = c.iso;
    /* the name first, so typing "ger" in an open native select finds Germany */
    o.textContent = c.name + " +" + c.dial;
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
    /* A country with no verified length must not claim one, so those two say
       what is actually known instead of quoting the ITU envelope back as if it
       were a national rule. */
    if (d.length < c.min) {
      return { ok: false, msg: c.loose
        ? "That looks too short. Enter the full number, without the country code."
        : "Numbers in " + c.name + " are " + span(c) + " digits. That is " +
          (c.min - d.length) + " short." };
    }
    if (d.length > c.max) {
      return { ok: false, msg: c.loose
        ? "That is longer than a phone number can be: 15 digits in total, and " +
          "+" + c.dial + " uses " + c.dial.length + " of them."
        : "Numbers in " + c.name + " are " + span(c) + " digits. That is " +
          (d.length - c.max) + " too many." };
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
