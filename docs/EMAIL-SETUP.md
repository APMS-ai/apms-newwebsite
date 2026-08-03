# Getting Book a Demo enquiries into Gmail

Everything the contact form needs is already written. What is left is server
configuration, and it is all in one file: `config.php`.

---

## 0 · What is already true, so you know what you are changing

`contact.html` posts to `submit.php`. For every enquiry that passes validation,
`submit.php` does three things, in this order:

| # | Where it goes | Fails if |
|---|---|---|
| 1 | a CSV outside `public_html` | PHP cannot write outside the web root |
| 2 | a row in MySQL | credentials wrong, or the table does not exist |
| 3 | an email notification | this document |

**The visitor is told "Thanks" if step 1 or step 2 succeeded.** Email is a
notification, not the record. So a form that says "Thanks" is *not* proof the
email went. That is deliberate: an enquiry must never be lost because a mail
server was down. It also means you have to check the inbox, not the form, to
know this worked.

`index.html` also has a form-looking box. That is the Analyst demo console: no
`action`, no backend, nothing to configure. Only the contact form emails.

---

## 1 · Why the old setup silently failed

The previous code called PHP's `mail()`. On this host that cannot work, and it
cannot tell you it did not work.

`mail()` hands the message to the web server's local sendmail, which posts it
from **Hostinger's IP** claiming to be `From: no-reply@apms.ai`.

`apms.ai`'s SPF record authorises **Microsoft 365**, because that is where the
domain's MX points. It does not authorise Hostinger. So Gmail performs the
check the record exists for, sees the domain owner declining to vouch for the
sending server, and either files the mail as spam or drops it outright.

`mail()` returns `true` in both cases, because it only reports whether sendmail
*accepted* the message, not whether anyone delivered it. And it was called as
`@mail(...)` with the result discarded, so there was no signal at all.

**The fix is not a better `From:` header.** It is to submit the message to a
provider that has agreed to send for that account, so SPF and DKIM pass. That
is what authenticated SMTP does, and `lib/smtp.php` now does it.

---

## 2 · Turn on 2-Step Verification

App passwords do not exist on an account without it. There is no way around
this step.

1. Go to **<https://myaccount.google.com/security>**
2. Find **How you sign in to Google** → **2-Step Verification**
3. Click it and follow the prompts (phone number or authenticator app)
4. When it is done the row reads **On**

If the account is a Google Workspace account and your administrator has
disabled 2-Step Verification or app passwords, this route is closed and you
want section 8 instead.

---

## 3 · Create the app password

1. Go to **<https://myaccount.google.com/apppasswords>**
   (if that page says it is unavailable, step 2 has not finished, or an admin
   has blocked app passwords)
2. In **App name** type something you will recognise later, e.g. `APMS website`
3. Click **Create**
4. Google shows a 16-character code in four groups of four, like
   `abcd efgh ijkl mnop`

**Copy it now.** Google will not show it again; if you lose it, delete the entry
and make another.

The spaces do not matter. `lib/smtp.php` strips whitespace from the password
before authenticating, precisely because Google displays it in groups and people
paste it as shown.

---

## 4 · Fill in `config.php` on the server

`config.php` lives in `public_html` and is **not** in the repository, because it
holds the database password. If it is not there yet, copy `config.sample.php`
to `config.php` first.

**hPanel → Files → File Manager → `public_html`**, then edit `config.php`.

Change these two parts:

```php
    /* where the notification email goes */
    'notify_to' => 'yourname@gmail.com',

    'smtp' => [
        'host'      => 'smtp.gmail.com',
        'port'      => 587,
        'secure'    => 'tls',
        'user'      => 'yourname@gmail.com',
        'pass'      => 'abcdefghijklmnop',
        'from'      => 'yourname@gmail.com',
        'from_name' => 'APMS.ai website',
        'timeout'   => 20,
    ],
```

Field by field:

| Field | Value | Why |
|---|---|---|
| `notify_to` | the address you want to *read* enquiries at | can be any address, does not have to be the Gmail one |
| `host` | `smtp.gmail.com` | Gmail's submission server |
| `port` | `587` | with `secure => 'tls'`. **Port and secure must match** (see below) |
| `secure` | `'tls'` | STARTTLS: connect in the clear, then upgrade |
| `user` | the full Gmail address | the account you made the app password on |
| `pass` | the 16-character app password | **not** your Google account password |
| `from` | the same Gmail address as `user` | see the warning below |
| `from_name` | anything | the display name in the inbox |
| `timeout` | `20` | seconds; raise it only if the host is slow |

### `from` must match `user`

Gmail will not let you claim an arbitrary sender. `from` has to be either the
same address as `user`, or an alias you have verified in
**Gmail → Settings → See all settings → Accounts and Import → Send mail as**.
Anything else gets silently rewritten to the account address, or rejected.

This is worth being clear about: **the notification will arrive from your Gmail
address, not from `@apms.ai`.** If that matters to you, use section 8.

### Port and secure go together

| Port | `secure` | What happens |
|---|---|---|
| 587 | `'tls'` | plain connection, then `STARTTLS` upgrades it |
| 465 | `'ssl'` | TLS from the first byte |

Mixing them fails. `'ssl'` on 587 tries to start TLS against a server expecting
plaintext; `'tls'` on 465 sends `EHLO` into an encrypted socket. Try 587 first,
and 465 only if the connection is refused.

### Leave the rest alone

`notify_from` is only used by the `mail()` fallback and is ignored once `host`
is filled in. Leaving `host` empty keeps the old `mail()` behaviour, which is
the behaviour that does not work here.

---

## 5 · Upload the files

Two files, over FTP or File Manager, into `public_html`:

```
lib/smtp.php      <- NEW. Create the lib/ directory first.
submit.php        <- replaces the existing one
```

FTP credentials: **hPanel → Files → FTP Accounts**.

Notes:

- `lib/` is a new directory. Most FTP clients will not create it for you when
  uploading a single file, so make it first.
- Permissions, if your client asks: **644** for the two files, **755** for the
  `lib/` directory.
- `.htaccess` (already updated in the repository) denies `smtp.php` over HTTP,
  so `https://apms.ai/lib/smtp.php` returns 403. `require_once` still works,
  because Apache's `Require` controls HTTP requests, not filesystem includes.
  If you have not uploaded the current `.htaccess`, do that too.
- `config.php` stays where it is. Never upload it *from* the repository, because
  it is not in the repository.

`DEPLOY.txt` lists all 79 files that belong on the server, and is generated:
re-run `docs/gen-deploy-manifest.py` after adding or removing any file.

---

## 6 · Test it

1. Open `https://apms.ai/contact.html` (or whatever the live URL is)
2. Fill in every field. All five are required, and the message needs at least
   10 characters
3. Click **Send message**
4. You should see the success line under the form within a second or two
5. Check the Gmail inbox

Expected, in the inbox:

- **Subject** `Demo enquiry: <Company> (<Name>)`
- **From** `APMS.ai website <yourname@gmail.com>`
- **Reply-To** the person who filled the form. Hitting **Reply** in Gmail
  answers *them*, not you. This is the part worth actually verifying: open the
  message, click Reply, and confirm the To: field is the enquirer's address
- **Body** name, email, phone, company, the message, then the UTC timestamp and
  the sender's IP

Three things to check before concluding it failed:

- **The Spam folder.** First message from a new sending pattern sometimes lands
  there once. Mark it *Not spam* and it will not happen again
- **Whether `notify_to` and `user` are the same address.** Gmail collapses a
  message you sent to yourself into one thread with the copy in *Sent*, which
  can look like it never arrived. Search for the subject rather than scanning
  the inbox
- **The form said "Thanks" regardless.** See section 0: that only tells you the
  enquiry was stored, not that the email went

---

## 7 · When it does not arrive

Every failure is logged now, with the stage that failed and what the server
said. That is the difference between a wrong password and a blocked port.

**Where the log is**, in rough order of likelihood on Hostinger:

- **hPanel → Advanced → PHP Configuration**, check that `log_errors` is on and
  see what `error_log` is set to
- an `error_log` file in `public_html`, visible in File Manager
- **hPanel → Advanced → PHP Error Log**, if your plan shows that panel

Every line from this code is prefixed `[apms-enquiry]`.

### Reading the error

| Log line contains | What it means | Fix |
|---|---|---|
| `smtp send failed: SMTP not configured` | `host`, `user` or `pass` is empty, or `config.php` is not being read at all | check the file is named exactly `config.php`, is in `public_html`, and that the `smtp` block is inside the `return [ ... ];` |
| `connect to smtp.gmail.com:587 failed` | the host blocks outbound 587 | switch to `'port' => 465, 'secure' => 'ssl'` |
| `connect to ... failed: ... (110)` or a 20-second hang | outbound SMTP blocked entirely | ask Hostinger support to open outbound 587/465, or use section 8 |
| `AUTH password ...: expected 235, got 535` | wrong password | you used the Google account password. It must be the 16-character app password |
| `AUTH password ...: expected 235, got 534` | Google wants more than a password | 2-Step Verification is not actually on, or the account requires Advanced Protection |
| `server advertises no AUTH mechanism` | connected, but unencrypted | `secure` is empty. Set `'tls'` (587) or `'ssl'` (465) |
| `STARTTLS negotiation failed` | TLS could not come up after the server agreed to it | usually an outdated OpenSSL on the host; try `'port' => 465, 'secure' => 'ssl'` |
| `MAIL FROM: expected 250, got 553` | Gmail rejected the sender | `from` is not the account address and not a verified alias |
| `RCPT TO: expected 250/251, got 550` | the recipient does not exist | typo in `notify_to` |
| `mail() failed, and no smtp block is configured` | still on the old path | the `smtp` block is missing or `host` is empty |
| `sent via mail()` | the fallback ran | fill in the `smtp` block; on this host `mail()` is unlikely to be delivered |

If there is no `[apms-enquiry]` line at all, `submit.php` was not reached. Check
the browser's Network tab for the POST to `submit.php`: a 404 means the file is
not uploaded, a 500 means PHP errored before the mail step.

---

## 8 · The alternative: keep the sender on @apms.ai

Sending through Microsoft 365 keeps `From: info@apms.ai`, which reads better on
an enquiry notification, at the cost of more setup.

```php
    'smtp' => [
        'host'   => 'smtp.office365.com',
        'port'   => 587,
        'secure' => 'tls',
        'user'   => 'info@apms.ai',
        'pass'   => 'the mailbox password',
        'from'   => 'info@apms.ai',
    ],
```

Two catches:

1. **SMTP AUTH is disabled by default** on most Microsoft 365 tenants. An
   administrator has to enable it for that specific mailbox, in the Microsoft
   365 admin centre under the mailbox's mail settings. Without it,
   authentication fails no matter how correct the password is
2. **If the tenant enforces modern authentication only**, a plain password will
   not work at all and the mailbox needs an app password, which in turn needs
   MFA enabled on it

Because the MX for `apms.ai` already points at Microsoft 365, mail sent this way
lands in that mailbox's normal inbox. If you want it in Gmail as well, set up
forwarding in Microsoft 365 rather than changing anything here.

**Do not move the nameservers to get this working.** The MX records point at
Microsoft 365, and moving nameservers without recreating them breaks email for
the whole domain. Change the `A` record only.

---

## 9 · Security notes

- `config.php` holds both the database password and now the app password. It is
  gitignored, and `.htaccess` denies it over HTTP as a backstop in case PHP is
  ever misconfigured and starts serving `.php` as text
- An app password grants access to send mail as that account. Treat it like a
  password: if it leaks, delete it at
  <https://myaccount.google.com/apppasswords> and make a new one. Deleting it
  does not affect your account password
- The form has a honeypot field and validates every field again on the server,
  because the checks in the browser are a courtesy and anything can POST to
  `submit.php` directly
- Newlines are stripped from the name and email before they reach a mail header,
  so a submitted value cannot inject headers of its own

---

## 10 · Not verified here

`lib/smtp.php` was written without a PHP runtime available in the authoring
environment. It was checked by lexing for balanced delimiters and unterminated
strings, **not** by `php -l` and **not** by sending a message.

The first genuine test is step 6. If it fails, section 7 will say why.
