/* ==========================================================================
   APMS.ai — tools/bundle.js
   node tools/bundle.js

   The site is hand-written with no build step, and that is still true for
   authoring: the files under css/ are the source and they are what you edit.
   This exists only because of what twenty-seven <link> tags cost a visitor.
   Each one is a request the browser must finish before it can paint anything,
   and measured on the live server that was 830ms of render blocking before a
   single word appeared.

   For each page, the stylesheets listed for it in tools/bundles.json, in that
   order, are concatenated into one file under dist/. The page then links that
   instead.

   Two decisions worth keeping:

   · Per page, not one shared bundle. The cascade depends on the order each
     page chose, and flattening eleven different orders into one global order
     would quietly change the outcome somewhere.

   · The manifest is the source list, because the page cannot be. The first
     version of this script read the answer out of the page's own <link> tags,
     which works exactly once: after the first run the only link left is the
     bundle, so the second run re-bundled its own output and the real sources
     were never read again.

   RE-RUN THIS AFTER EDITING ANY CSS, and add new stylesheets to bundles.json.
   The bundle is generated, the sources are the truth, and a page keeps serving
   the old bundle until you re-run.
   ========================================================================== */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "dist");
const MANIFEST = JSON.parse(fs.readFileSync(path.join(__dirname, "bundles.json"), "utf8"));

const OPEN = "<!-- BUNDLE:CSS -->";
const CLOSE = "<!-- /BUNDLE:CSS -->";

/* Conservative CSS minification: comments out, whitespace runs collapsed to a
   single space. Strings and url() are copied through untouched.

   There was a second pass here that squeezed the spaces around { } : ; , > ~
   and +, which is what a real minifier does and which saved another 30 KB. It
   also turned calc(-50% + var(--tx)) into calc(-50%+var(--tx)), which is not
   valid CSS, and silently killed the confetti burst on the greeting card. A
   diff of every computed style on the page caught it; nothing else would have.
   Squeezing operators needs a parser that knows when it is inside a calc(),
   and a hand-rolled one is not worth 30 KB that gzip takes anyway. Comments
   are the bulk of the win here, and removing them cannot change a rule. */
function minifyCss(src) {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];

    if (c === '"' || c === "'") {                       /* strings, verbatim */
      const q = c;
      let j = i + 1;
      while (j < n && !(src[j] === q && src[j - 1] !== "\\")) j++;
      out += src.slice(i, j + 1);
      i = j + 1;
      continue;
    }

    if (c === "u" && /^url\(/i.test(src.slice(i, i + 4))) {   /* url(), verbatim */
      const close = src.indexOf(")", i);
      if (close !== -1) {
        out += src.slice(i, close + 1).replace(/\s+/g, "");
        i = close + 1;
        continue;
      }
    }

    if (c === "/" && src[i + 1] === "*") {              /* comments, gone */
      const end = src.indexOf("*/", i + 2);
      if (end === -1) break;
      if (src[i + 2] === "!") out += src.slice(i, end + 2);
      i = end + 2;
      continue;
    }

    if (/\s/.test(c)) {                                 /* whitespace runs */
      let j = i;
      while (j < n && /\s/.test(src[j])) j++;
      out += " ";
      i = j;
      continue;
    }

    out += c;
    i++;
  }
  return out.trim();
}

function hash(s) {
  return crypto.createHash("sha1").update(s).digest("hex").slice(0, 8);
}

function bundlePage(file) {
  const htmlPath = path.join(ROOT, file);
  if (!fs.existsSync(htmlPath)) return null;
  const html = fs.readFileSync(htmlPath, "utf8");

  const hrefs = MANIFEST[file];
  if (!hrefs || !hrefs.length) return null;

  let before, after;
  if (html.includes(OPEN)) {
    before = html.slice(0, html.indexOf(OPEN));
    after = html.slice(html.indexOf(CLOSE) + CLOSE.length);
  } else {
    const links = [...html.matchAll(/^[ \t]*<link rel="stylesheet" href="(?!https?:)[^"]+">[ \t]*\r?\n/gm)];
    if (!links.length) return null;
    before = html.slice(0, links[0].index);
    after = html.slice(links[links.length - 1].index + links[links.length - 1][0].length);
  }

  let css = "";
  for (const href of hrefs) {
    const p = path.join(ROOT, href);
    if (!fs.existsSync(p)) { console.warn("  missing", href); continue; }
    css += "\n" + fs.readFileSync(p, "utf8");
  }

  const min = minifyCss(css);
  const base = path.basename(file, ".html");
  const name = base + "." + hash(min) + ".css";
  fs.mkdirSync(path.join(OUT_DIR, "css"), { recursive: true });

  for (const f of fs.readdirSync(path.join(OUT_DIR, "css"))) {
    if (f.startsWith(base + ".") && f !== name) fs.unlinkSync(path.join(OUT_DIR, "css", f));
  }
  fs.writeFileSync(path.join(OUT_DIR, "css", name), min);

  const replacement =
    OPEN + "\n" +
    "  <!-- One file, built by tools/bundle.js from the " + hrefs.length + " stylesheets listed\n" +
    "       for this page in tools/bundles.json. Edit those, not this, and re-run\n" +
    "       `node tools/bundle.js`: the hash below changes with the content. -->\n" +
    '  <link rel="stylesheet" href="dist/css/' + name + '">\n  ' +
    CLOSE;

  fs.writeFileSync(htmlPath, before + replacement + after);
  return { file, count: hrefs.length, raw: css.length, min: min.length, name };
}

let totalRaw = 0, totalMin = 0;
for (const p of Object.keys(MANIFEST)) {
  const r = bundlePage(p);
  if (!r) { console.log(p.padEnd(18), "skipped"); continue; }
  totalRaw += r.raw; totalMin += r.min;
  console.log(
    r.file.padEnd(18),
    String(r.count).padStart(2), "files ->",
    (r.raw / 1024).toFixed(0).padStart(4), "KB raw ->",
    (r.min / 1024).toFixed(0).padStart(4), "KB", "  " + r.name
  );
}
console.log("\ntotal", (totalRaw / 1024).toFixed(0), "KB ->", (totalMin / 1024).toFixed(0), "KB");
