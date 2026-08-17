# How a change reaches apms.ai

Agreed process: nothing is committed straight to `main`. Every change goes on
its own branch and reaches `main` through a pull request, so the change is
reviewed before it is deployed and `main` always reflects what is live on the
server.

Two separate things have to happen for a change to appear on the site:

1. **Push to GitHub** — the developer's job. This does *not* change apms.ai.
2. **Upload to the server** — done after the pull request is merged. Until
   this happens, apms.ai is unchanged no matter what is on `main`.

---

## The routine

```bash
# 1. start from an up-to-date main
git checkout main
git pull apms main

# 2. branch, named after the change
git checkout -b fix-contact-form

#    ...edit files...

# 3. rebuild, if needed - see "The two easy things to forget" below
node tools/bundle.js
node tools/deploy-list.js

# 4. commit and push
git add -A
git commit -m "Describe what changed and why"
git push -u apms fix-contact-form
```

`git push` prints a link. Open it, write a short description of what changed
and why, and request review.

After it is merged, delete the branch and go back to `main`:

```bash
git checkout main
git pull apms main
git branch -d fix-contact-form
```

---

## The two easy things to forget

Both fail **silently**. Nothing warns you, and the site looks fine locally.

### `node tools/bundle.js` — after editing anything in `css/`

The pages do not link the files in `css/`. They link one combined file per page
under `dist/css/`, built from the list in `tools/bundles.json`. Editing a
stylesheet without rebuilding means the page keeps serving the old bundle: your
change simply does not appear, and there is no error anywhere.

If you add a **new** stylesheet, add it to `tools/bundles.json` as well, or the
bundler will not know it exists.

### `node tools/deploy-list.js` — after adding or removing files, and after any rebuild

`DEPLOY.txt` is the upload checklist. It is generated, never hand-edited.

Re-running it after `bundle.js` matters because bundle filenames contain a
content hash — `index.8a7353b9.css` becomes something else when the CSS
changes. A stale `DEPLOY.txt` therefore names a file that no longer exists, and
whoever follows it uploads nothing for that page.

This has gone wrong twice before. See the header of `tools/deploy-list.js` for
what happened; the short version is that the generator now fails loudly if any
page links a file the list does not include, so a mistake here is an error
rather than a silently broken site.

---

## Never commit

`config.php` holds the database password and the Gmail app password. It is in
`.gitignore` and must stay out of the repository — git history is permanent, so
a password committed once stays readable in old commits even after the file is
deleted.

It lives on the server only, in `public_html/` beside `submit.php`. Its shape is
documented in the header of `submit.php`, and the Gmail side is covered in
`docs/EMAIL-SETUP.md`.

**Keep a copy of the real file in a password manager.** It exists in exactly two
places — the server and one PC — and nothing in this repository can restore it.

---

## Branches

| Branch | What it is |
|---|---|
| `main` | what is deployed, or ready to be. Only ever updated by merging a pull request. |
| `experiments/perf` | performance work that was measured and not adopted. **Not for deployment.** Kept because the measurements are recorded in the commit message. |

---

## Deployment notes

For whoever uploads to the server, `DEPLOY.txt` is the list. Three things that
regularly go wrong:

- **`.htaccess` is a dotfile** and most FTP clients hide it by default. Without
  it the site still loads, but the HTTPS redirect, the old WordPress URL
  redirects, the 404 page, caching and the security headers are all gone — and
  it looks like it uploaded successfully.
- **Old `dist/css/` files should be deleted on the server.** The filenames are
  content-hashed, so new ones do not overwrite old ones; they accumulate.
- **`config.php` must not be overwritten or deleted.** If it goes, the contact
  form still shows "thank you" and still writes its CSV, but silently stops
  sending email.
