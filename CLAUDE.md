# APMS.ai website — working rules

Static marketing site for APMS.ai (industrial IoT, Vision AI, Motion AI, AI Agents).
Read this before changing anything. Most rules below exist because breaking them
already caused a real, measured defect once.

---

## 1 · Content rules

- **No em or en dashes** (`—` `–`) in anything a visitor can read. Use a comma,
  a colon or a full stop. Hyphens in compound words are fine.
  This includes **strings inside `js/*.js`**, not just HTML. An audit that only
  swept HTML missed 9 dashes in `js/chatbot.js` and `js/redesign.js` for weeks.
- **Never invent credentials or metrics.** No SOC 2, no ISO numbers, no
  percentages or customer counts that nobody can point at. If a claim needs a
  source and there isn't one, describe the capability instead.
- **No two sections may repeat the same point.** Three of five cards in the
  about-page bento restated the "Why APMS" list directly above them.
- The two forms are **not connected to a backend**. Don't write copy that
  implies they are.

## 2 · Brand

- **APMS teal only.** When copying a layout or effect from another site, keep
  this palette. Never adopt the reference's colours.
- Logo file is `assets/apms-logo.png`, **1049 × 238 (aspect 4.41)**. Any `<img>`
  for it needs `flex: none` and `aspect-ratio: 1049 / 238`, or a flex row will
  squeeze it: the header logo rendered 112×40 at 360px before that was fixed.

## 3 · Architecture

- Hand-written HTML/CSS/JS. **No build step, no `package.json`, no framework.**
  Libraries are vendored in `js/vendor/`.
- 9 real pages plus `404.html`, all at the repository root. **They stay there.**
  Netlify publishes from `.`, so moving a page changes its public URL and breaks
  every link into it.
- Stylesheets and scripts are grouped by role:

  | folder | holds |
  |---|---|
  | `css/base`, `js/core` | the shell: layout, type, footer, reveals, smooth scroll |
  | `css/motion`, `js/motion` | loader, pointer motion, drum, rails, perf gating |
  | `css/sections`, `js/sections` | one file per section or console |
  | `js/vendor` | third party, never edited |

- `_standalone/` holds the two generated previews, `docs/` the notes. Both are
  gitignored and must never deploy.
- **Bump `?v=N`** on a stylesheet or script whenever you edit it, or the browser
  serves the old one. A "not applied" bug report was cache, not code.
- `css/perf.css` and `css/a11y-motion.css` must load **last**, in that order.

## 4 · Motion system

Three layers, split by job. Don't let two of them own the same property on the
same element.

| layer | job | files |
|---|---|---|
| IntersectionObserver | entrances, fire once | `js/reveal.js`, `js/redesign.js` |
| GSAP ScrollTrigger | scroll-linked (scrub, parallax, progress) | `js/gscroll.js` |
| Lenis | smooth scrolling, pointer and touch | `js/smooth.js` |

- `js/perf.js` pauses CSS animations **and SMIL** in off-screen sections.
- **Anything that scrolls sideways must be exempt from Lenis.** `smooth.js` now
  auto-detects scrollable containers, but check it: a scrollable element that
  isn't exempt is *invisible* to the user because Lenis eats the gesture. That
  is exactly how the "Four modules" diagram ended up stuck.
- **Reduced motion**: `css/a11y-motion.css` re-enables the 23 animations that
  change state without moving anything. Never re-enable a transform, and never
  re-enable continuous travel (flows, sweeps, shimmer). Android Battery Saver
  turns this preference on by itself, so it is not a rare path.

## 5 · Performance (target: 16.7ms median frame while scrolling)

- **No `backdrop-filter` on a fixed element.** A blurred sticky header re-blurs
  the whole viewport every frame: it alone took index.html from 33ms to 17ms.
- **No permanent `will-change`.** Release it once the element has arrived. 100+
  pinned compositor layers cost real frames.
- Don't animate `filter: blur()` on many elements at once.
- `content-visibility` was tried and **reverted** — it needs an accurate
  `contain-intrinsic-size` per section, and a guess grew index.html by 3,356px
  and left 29 of 36 reveals unfired. See the note in `css/perf.css`.
- **Measure before and after, and kill stray Chrome processes first.** 24
  leftover headless instances once made a clean page look like a regression.

## 6 · Layout

- **Grids: use explicit column counts that divide the card count.**
  `repeat(auto-fit, minmax(...))` picks whatever fits and orphans the last row —
  it left holes of 254 to 547px on six different grids. 8 cards → 4 then 2.
  5 cards → never 2 columns.
- **No two adjacent sections share a background shade** (`sec--dark`,
  `sec--darker`, `sec--paper`, `sec--white`). Re-check after adding, moving or
  deleting any section.
- Cards in the same row must be equal height; a bento's columns must end level.

## 7 · SVG

- **Author the `viewBox` near the rendered size.** A 240-unit box shown at 700px
  makes labels 3× too large. Cap with `max-width` too.
- **Base strokes never animate away** — animating a base `stroke-dashoffset`
  makes icons blink to empty boxes.
- `transform-box: view-box` makes `transform-origin: center bottom` resolve
  against the **whole board**, not the element. Use `fill-box` for per-element
  origins. This silently slid the PM compliance bars across their legend.
- **A circle with no `cx`/`cy` sits at the origin until its `animateMotion`
  begins**, which puts a stray dot in the top-left corner. Guard with
  `visibility="hidden"` plus `<set … begin>`.
- **A wide diagram needs a second mobile layout, not a horizontal scroller.**
  Pattern used twice (`--wide` / `--tall`, swapped at a breakpoint, same class
  names so styles and JS carry over): `.modflow`, `.aloop`.

## 8 · Verify like this

Headless Chrome over CDP; no puppeteer needed. Scratchpad harnesses exist for
frame timing, grid alignment, reveals, rails and reduced motion.

- **`window.scrollTo` does not work** — Lenis intercepts it. Drive the page with
  real `Input.dispatchMouseEvent` wheel events, or `lenis.scrollTo`.
- Always check **both 1440px and 390px**, and reduced motion **on and off**.
- Chrome enforces a ~500px minimum window width; use
  `Emulation.setDeviceMetricsOverride` for true mobile widths.
- After any change: reveals all fire, document height unchanged, 0 horizontal
  overflow, 0 console errors, 0 dashes.

## 9 · Git and deploy

- **Do not push without being asked.** Pushing to `main` triggers a Netlify
  build, and the account's usage is being watched. Commit locally as often as
  useful; `git push` only when the work is explicitly signed off. Check with
  `git log origin/main..main --oneline` to see what is waiting.
- To preview without deploying: `python -m http.server 8080` in the project
  root, then open `http://localhost:8080`. Everything works locally except the
  `netlify.toml` headers and redirects.
- GitHub: `Sudhanvahp/APMS.ai-Website` (**private**).
- **Hosting is Hostinger now** (LiteSpeed + PHP + MySQL), uploaded over FTP to
  `public_html`. `DEPLOY.txt` is the file manifest and is **generated**, not
  hand-kept: re-run `docs/gen-deploy-manifest.py` after adding or removing a
  file. The hand-kept version had drifted and omitted five stylesheets that
  pages load, which would have shipped a site with broken styling.
- `netlify.toml` is kept for reference only and must not be uploaded.
  Everything it did is restated in `.htaccess`, which LiteSpeed reads:
  security headers, caching, extensionless URLs, the 404 page and the old
  WordPress redirects.
- **`v1-first-deploy` is frozen at `1e33c73`** — the first deployed version.
  Never commit to it or move it.
- No build command. Publish directory is `.`. Config in `netlify.toml`.
- Commit messages: say what changed and **why**, including the measurement if
  the change was a fix.

## 10 · Still outstanding

- ~~**Book a Demo collects nothing.**~~ Done, and **not** with Netlify Forms:
  the site moved to Hostinger, where that does not exist. `contact.html`
  posts to `submit.php`, which validates server side, writes a row to MySQL
  **and** appends to a CSV outside `public_html`, then emails `info@apms.ai`.
  Two stores on purpose: a database can be down, and an enquiry that arrives
  then must not evaporate. Success is only reported if one of the two writes
  actually succeeded. Credentials live in `config.php` on the server, which is
  gitignored; `config.sample.php` and `schema.sql` are the templates.
  **The notification email goes over authenticated SMTP**, not `mail()`. The
  sender is inlined in `submit.php` with no dependencies, so the whole feature
  is two files on the server: `submit.php` and `config.php`. `mail()` is still the fallback but on this host
  it silently fails: it posts from Hostinger's IP claiming `From: @apms.ai`,
  and apms.ai's SPF authorises Microsoft 365, not Hostinger, so Gmail spams or
  drops it. `mail()` returns true either way. Fill the `smtp` block in
  `config.php`; both outcomes are written to the PHP error log now.
  Step-by-step setup, and a table mapping every error this code logs to its
  cause, is in `docs/EMAIL-SETUP.md`.
- The chatbot accepts typed questions and **discards them**. Worth logging.
- `apms.ai` still serves the old WordPress site. **Do not move the nameservers**
  — MX points at Microsoft 365, so email breaks. Change the `A` record only and
  add redirects for the ~30 old URLs.
