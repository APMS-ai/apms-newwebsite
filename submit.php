<?php
/* ==========================================================================
   APMS.ai — Book a Demo endpoint
   ==========================================================================
   Netlify Forms only exists on Netlify. The site is on Hostinger now, so the
   form needs a real endpoint, and this is it: LiteSpeed runs PHP, and every
   Hostinger shared plan includes MySQL, so nothing extra has to be bought.

   An enquiry can end up in three places, and the visitor is told it succeeded
   if it reached any one of them:

     1. a row in MySQL, which is the thing you query and export. Optional:
        leave the db name empty in config.php and it is skipped
     2. a line in a CSV on disk, the safety net, because a database can be
        down, out of connections or mid-migration and an enquiry that arrives
        then must not evaporate
     3. an email, when authenticated SMTP confirms a server accepted it

   Only those three count. mail() does not, because it reports a success it
   has no way to know about.

   Self-contained on purpose: the SMTP sender is in this file, so the whole
   feature is two files on the server, submit.php and config.php, with no
   directory to create.

   --------------------------------------------------------------------------
   SETTING IT UP ON A NEW SERVER

   config.php is NOT in the repository: it holds the database password. There
   used to be a config.sample.php to copy; it was removed, so the shape it
   documented lives here now. Create config.php next to this file, returning:

     <?php return [
       'db' => [
         'host' => 'localhost',
         'port' => 3306,
         'name' => '',              // empty disables MySQL; the CSV still runs
         'user' => '',
         'pass' => '',
       ],
       'notify_to'   => 'info@apms.ai',
       'notify_from' => 'no-reply@apms.ai',
       'storage_dir' => __DIR__ . '/../apms-enquiries',   // OUTSIDE public_html
       'smtp' => [
         'host'      => '',         // e.g. smtp.gmail.com
         'port'      => 587,        // 587 with tls, or 465 with ssl
         'secure'    => 'tls',      // 'tls' | 'ssl' | '' for none
         'user'      => '',         // the full email address
         'pass'      => '',         // an app password, not the account password
         'from'      => '',         // defaults to 'user' when blank
         'from_name' => 'APMS.ai website',
         'timeout'   => 20,
       ],
     ];

   And the table this writes to, which was schema.sql. Run it once in phpMyAdmin.
   utf8mb4 throughout, because MySQL's "utf8" is three bytes and truncates at
   the first four-byte character, which includes every emoji a visitor can type:

     CREATE TABLE IF NOT EXISTS enquiries (
       id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
       received_utc  DATETIME     NOT NULL,
       name          VARCHAR(120) NOT NULL,
       email         VARCHAR(190) NOT NULL,
       phone         VARCHAR(40)  NOT NULL,
       company       VARCHAR(160) NOT NULL,
       message       TEXT         NOT NULL,
       ip            VARCHAR(45)  DEFAULT NULL,   -- 45 chars so IPv6 fits
       user_agent    VARCHAR(255) DEFAULT NULL,
       handled       TINYINT(1)   NOT NULL DEFAULT 0,
       PRIMARY KEY (id),
       KEY idx_received (received_utc),
       KEY idx_email (email),
       KEY idx_handled (handled)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

   docs/EMAIL-SETUP.md has the step by step, and a table mapping every error
   this file logs to its cause.
   ========================================================================== */

declare(strict_types=1);

/* ==========================================================================
   THE MAIL SENDER
   ==========================================================================
   Why this exists at all, rather than PHP's mail():

   mail() hands the message to the web server's local sendmail. The message
   then leaves Hostinger's IP claiming to be From: an @apms.ai address. But
   apms.ai's SPF record authorises Microsoft 365, because that is where the MX
   points, and it does not authorise Hostinger. Gmail checks SPF, sees a
   domain whose owner says "this server may not send for me", and puts the mail
   in spam or drops it. mail() returns true either way, and submit.php called
   it as @mail(...) and ignored the result, so a failure was completely silent.

   Sending over authenticated SMTP fixes the cause: the message is submitted to
   a mail provider that has agreed to send for that account, so SPF and DKIM
   pass and it lands in the inbox.

   No Composer, no PHPMailer: this project vendors its dependencies and has no
   build step, so this is written against the protocol directly. It does the
   parts that matter and nothing else:

     · implicit TLS on 465, or STARTTLS on 587
     · AUTH LOGIN, which is what Gmail and Microsoft 365 both accept
     · a base64 body, so no line in DATA can ever exceed the 998-octet limit
       and no line can begin with a bare dot and end the message early
     · RFC 2047 encoding for a non-ASCII subject or display name
     · a real error string on every failure path, for the caller to log

   It speaks to any SMTP server. Gmail is the documented case above, because
   that is what was asked for.

   Inlined here rather than kept in lib/smtp.php so that deploying this is one
   file, with no directory to create and no include path to get wrong. That
   matters more than tidiness on a host where the whole feature failed for
   three attempts because a lib/ folder was never made.
   ========================================================================== */

/**
 * Encode a header value that may contain non-ASCII, per RFC 2047.
 * Plain ASCII is passed through so ordinary headers stay readable.
 */
function apms_smtp_header_value(string $v): string
{
    if (preg_match('/^[\x20-\x7E]*$/', $v)) {
        return $v;
    }
    return '=?UTF-8?B?' . base64_encode($v) . '?=';
}

/**
 * Format an address as `Display Name <addr>`, with the name encoded and any
 * CR/LF stripped. The caller validates its inputs too; this is the backstop
 * that keeps a newline in a name from injecting a header of its own.
 */
function apms_smtp_addr(string $email, string $name = ''): string
{
    $email = str_replace(["\r", "\n"], '', $email);
    $name  = str_replace(["\r", "\n"], '', $name);
    if ($name === '') {
        return '<' . $email . '>';
    }
    return apms_smtp_header_value($name) . ' <' . $email . '>';
}

/**
 * Send one plain-text message.
 *
 * $s expects: host, port, user, pass, and optionally secure ('tls'|'ssl'|''),
 * from, from_name, helo, timeout.
 *
 * Returns true on a 250 after end-of-DATA. On false, $err holds the stage that
 * failed and what the server said, which is the only way to tell "wrong
 * password" from "port blocked" after the fact.
 */
function apms_smtp_send(
    array $s,
    string $to,
    string $subject,
    string $body,
    string $replyEmail = '',
    string $replyName = '',
    ?string &$err = null,
    string $html = ''
): bool {
    $err = null;

    $host = (string)($s['host'] ?? '');
    $port = (int)($s['port'] ?? 587);
    $user = (string)($s['user'] ?? '');
    $pass = (string)($s['pass'] ?? '');
    if ($host === '' || $user === '' || $pass === '') {
        $err = 'SMTP not configured (host, user and pass are all required)';
        return false;
    }

    /* Gmail shows an app password in four groups of four. People paste it with
       the spaces in, and then AUTH fails with no clue why. */
    $pass = preg_replace('/\s+/', '', $pass);

    $from     = (string)($s['from'] ?? $user);
    $fromName = (string)($s['from_name'] ?? 'APMS.ai website');
    $secure   = strtolower((string)($s['secure'] ?? ($port === 465 ? 'ssl' : 'tls')));
    $timeout  = (int)($s['timeout'] ?? 20);
    $helo     = (string)($s['helo'] ?? ($_SERVER['SERVER_NAME'] ?? 'localhost'));

    $target = ($secure === 'ssl' ? 'ssl://' : '') . $host . ':' . $port;
    $ctx = stream_context_create([
        'ssl' => ['SNI_enabled' => true, 'peer_name' => $host],
    ]);
    $fp = @stream_socket_client($target, $errno, $errstr, $timeout,
                                STREAM_CLIENT_CONNECT, $ctx);
    if (!$fp) {
        $err = sprintf('connect to %s failed: %s (%d)', $target, $errstr, (int)$errno);
        return false;
    }
    stream_set_timeout($fp, $timeout);

    /* Read one SMTP reply. A reply may be several lines; every line but the
       last has a hyphen in the fourth character. */
    $read = static function () use ($fp): string {
        $out = '';
        while (($line = fgets($fp, 1024)) !== false) {
            $out .= $line;
            if (strlen($line) < 4 || $line[3] === ' ') {
                break;
            }
        }
        return $out;
    };
    $say = static function (string $cmd) use ($fp): void {
        fwrite($fp, $cmd . "\r\n");
    };
    $bye = static function () use ($fp, $say): void {
        @$say('QUIT');
        @fclose($fp);
    };

    $step = static function (string $reply, array $ok, string $stage) use (&$err): bool {
        $code = substr($reply, 0, 3);
        if (in_array($code, $ok, true)) {
            return true;
        }
        $err = $stage . ': expected ' . implode('/', $ok) . ', got ' . trim($reply);
        return false;
    };

    if (!$step($read(), ['220'], 'greeting')) { $bye(); return false; }

    $say('EHLO ' . $helo);
    $ehlo = $read();
    if (!$step($ehlo, ['250'], 'EHLO')) { $bye(); return false; }

    if ($secure === 'tls') {
        $say('STARTTLS');
        if (!$step($read(), ['220'], 'STARTTLS')) { $bye(); return false; }
        $crypto = STREAM_CRYPTO_METHOD_TLS_CLIENT;
        if (defined('STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT')) {
            $crypto |= STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT;
        }
        if (@stream_socket_enable_crypto($fp, true, $crypto) !== true) {
            $err = 'STARTTLS negotiation failed (server accepted STARTTLS but TLS did not come up)';
            @fclose($fp);
            return false;
        }
        /* EHLO again: the extension list before TLS is not to be trusted, and
           AUTH is usually only advertised once the channel is encrypted. */
        $say('EHLO ' . $helo);
        $ehlo = $read();
        if (!$step($ehlo, ['250'], 'EHLO after STARTTLS')) { $bye(); return false; }
    }

    if (stripos($ehlo, 'AUTH') === false) {
        $err = 'server advertises no AUTH mechanism'
             . ($secure === '' ? ' (unencrypted connection: set secure to tls or ssl)' : '');
        $bye();
        return false;
    }

    $say('AUTH LOGIN');
    if (!$step($read(), ['334'], 'AUTH LOGIN')) { $bye(); return false; }
    $say(base64_encode($user));
    if (!$step($read(), ['334'], 'AUTH username')) { $bye(); return false; }
    $say(base64_encode($pass));
    if (!$step($read(), ['235'], 'AUTH password (for Gmail this must be a 16-character app password, not the account password)')) {
        $bye();
        return false;
    }

    $say('MAIL FROM:<' . $from . '>');
    if (!$step($read(), ['250'], 'MAIL FROM')) { $bye(); return false; }
    $say('RCPT TO:<' . $to . '>');
    if (!$step($read(), ['250', '251'], 'RCPT TO')) { $bye(); return false; }
    $say('DATA');
    if (!$step($read(), ['354'], 'DATA')) { $bye(); return false; }

    /* A Message-ID and a Date are not optional in practice: a message without
       them looks machine-generated to a spam filter. */
    $domain = strpos($from, '@') !== false ? substr($from, strpos($from, '@') + 1) : 'apms.ai';
    $headers = [
        'Date: ' . date('r'),
        'Message-ID: <' . bin2hex(random_bytes(12)) . '@' . $domain . '>',
        'From: ' . apms_smtp_addr($from, $fromName),
        'To: ' . apms_smtp_addr($to),
        'Subject: ' . apms_smtp_header_value($subject),
        'MIME-Version: 1.0',
    ];
    if ($replyEmail !== '') {
        /* So hitting Reply in Gmail answers the person who filled the form,
           not the mailbox the notification was sent from. */
        $headers[] = 'Reply-To: ' . apms_smtp_addr($replyEmail, $replyName);
    }

    if ($html !== '') {
        /* multipart/alternative, not text/html. The plain text stays as the
           fallback: a client that will not render HTML, a plain-text reader, and
           anything that strips HTML all still get the enquiry. Order matters,
           least-rich part first, because a client shows the LAST part it can
           display.

           The boundary is random hex, so it cannot collide with the content:
           both parts are base64, whose alphabet excludes the '=' and '-' runs a
           boundary needs. */
        $b = 'apms_' . bin2hex(random_bytes(10));
        $headers[] = 'Content-Type: multipart/alternative; boundary="' . $b . '"';
        $payload = implode("\r\n", $headers) . "\r\n\r\n"
                 . '--' . $b . "\r\n"
                 . "Content-Type: text/plain; charset=utf-8\r\n"
                 . "Content-Transfer-Encoding: base64\r\n\r\n"
                 . chunk_split(base64_encode($body), 76, "\r\n")
                 . '--' . $b . "\r\n"
                 . "Content-Type: text/html; charset=utf-8\r\n"
                 . "Content-Transfer-Encoding: base64\r\n\r\n"
                 . chunk_split(base64_encode($html), 76, "\r\n")
                 . '--' . $b . "--\r\n";
    } else {
        $headers[] = 'Content-Type: text/plain; charset=utf-8';
        $headers[] = 'Content-Transfer-Encoding: base64';
        $payload = implode("\r\n", $headers) . "\r\n\r\n"
                 . chunk_split(base64_encode($body), 76, "\r\n");
    }
    fwrite($fp, $payload);
    $say('.');
    if (!$step($read(), ['250'], 'end of DATA')) { $bye(); return false; }

    $bye();
    return true;
}

/* ========================================================================== */

/* ---------- how the caller wants to be answered ---------- */
$wantsJson = (
    (isset($_SERVER['HTTP_X_REQUESTED_WITH']) && strtolower($_SERVER['HTTP_X_REQUESTED_WITH']) === 'fetch')
    || (isset($_SERVER['HTTP_ACCEPT']) && strpos($_SERVER['HTTP_ACCEPT'], 'application/json') !== false)
);

function respond(int $code, string $message, bool $json): void
{
    http_response_code($code);
    if ($json) {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok' => $code < 400, 'message' => $message]);
    } else {
        /* No-JS path: land somewhere that says what happened rather than
           dumping raw output on the visitor.

           Relative to this script's own directory, not to the domain root.
           The site is served from a subdirectory (apms.ai/newwebsite/), and a
           root-absolute /contact.html sent the visitor to apms.ai/contact.html
           instead: a different site altogether, since the domain root still
           serves the old WordPress install. The enquiry was saved and the
           person was shown someone else's page. */
        $base = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/')), '/');
        $to = $base . '/contact.html?sent=' . ($code < 400 ? '1' : '0');
        header('Location: ' . $to, true, 303);
    }
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    respond(405, 'Method not allowed.', $wantsJson);
}

$cfgPath = __DIR__ . '/config.php';
$cfg = is_readable($cfgPath) ? require $cfgPath : [];

/* ---------- the honeypot ----------
   A person never sees this field, so anything in it is a bot. Answer 200 so
   the bot believes it succeeded and does not come back to try a variation. */
if (trim((string)($_POST['bot-field'] ?? '')) !== '') {
    respond(200, 'Thanks.', $wantsJson);
}

/* ---------- validate again, here ----------
   redesign.js checks these too, but that is for the person filling the form
   in. Client-side checks are a courtesy, not a control: anything can POST
   here directly, so the real check is the one on this side. */
$f = static function (string $k): string {
    return trim((string)($_POST[$k] ?? ''));
};

$name    = $f('name');
$email   = $f('email');
$phone   = $f('phone');
$company = $f('company');
$message = $f('message');

$errors = [];
if (mb_strlen($name) < 2)                                  { $errors[] = 'name'; }
if (!filter_var($email, FILTER_VALIDATE_EMAIL))            { $errors[] = 'email'; }
if (strlen(preg_replace('/\D/', '', $phone)) < 7)          { $errors[] = 'phone'; }
if (mb_strlen($company) < 2)                               { $errors[] = 'company'; }
if (mb_strlen($message) < 10)                              { $errors[] = 'message'; }

/* Length caps: a 2MB message is either a mistake or an attack, and either way
   it should not reach the database. */
foreach ([[$name, 120], [$email, 190], [$phone, 40], [$company, 160], [$message, 5000]] as $pair) {
    if (mb_strlen($pair[0]) > $pair[1]) { $errors[] = 'length'; break; }
}

/* Header injection: a newline in a field that ends up in a mail header can
   add headers of its own. */
if (preg_match('/[\r\n]/', $name . $email . $phone . $company)) { $errors[] = 'invalid'; }

if ($errors) {
    respond(422, 'Some details are missing or do not look right. Please check and try again.', $wantsJson);
}

$ip = (string)($_SERVER['REMOTE_ADDR'] ?? '');
$ua = mb_substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255);
$now = gmdate('Y-m-d H:i:s');

/* ---------- 1 · the safety net, written first ----------
   First, because it is the write that cannot fail for a reason outside this
   file. Kept out of the web root where the host allows it. */
$csvDir  = $cfg['storage_dir'] ?? (__DIR__ . '/../apms-enquiries');
$csvPath = rtrim($csvDir, '/\\') . '/enquiries.csv';
$csvOk = false;
if (!is_dir($csvDir)) { @mkdir($csvDir, 0750, true); }
if (is_dir($csvDir) && ($fh = @fopen($csvPath, 'ab')) !== false) {
    if (@flock($fh, LOCK_EX)) {
        if (ftell($fh) === 0) {
            fputcsv($fh, ['received_utc', 'name', 'email', 'phone', 'company', 'message', 'ip', 'user_agent']);
        }
        fputcsv($fh, [$now, $name, $email, $phone, $company, $message, $ip, $ua]);
        @flock($fh, LOCK_UN);
        $csvOk = true;
    }
    fclose($fh);
}

/* ---------- 2 · the database ---------- */
$dbOk = false;
$dbErr = '';
if (!empty($cfg['db']['name'])) {
    try {
        $d = $cfg['db'];
        $pdo = new PDO(
            sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
                    $d['host'] ?? 'localhost', (int)($d['port'] ?? 3306), $d['name']),
            $d['user'] ?? '', $d['pass'] ?? '',
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_EMULATE_PREPARES => false]
        );
        /* Prepared statement, so the message field is data and can never be
           read as SQL however it is written. */
        $sql = 'INSERT INTO enquiries
                (received_utc, name, email, phone, company, message, ip, user_agent)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
        $pdo->prepare($sql)->execute([$now, $name, $email, $phone, $company, $message, $ip, $ua]);
        $dbOk = true;
    } catch (Throwable $e) {
        /* Log it for you, never show it to the visitor: a database error
           message tells an attacker about your schema. */
        $dbErr = $e->getMessage();
        @error_log('[apms-enquiry] db insert failed: ' . $dbErr);
    }
}

/* ---------- 3 · tell somebody ----------
   Authenticated SMTP when config.php has an ['smtp'] block, and mail() only as
   a fallback when it does not.

   mail() was the only path here, and on this host it is the path that quietly
   does not work. It hands the message to the local sendmail, which posts it
   from Hostinger's IP claiming to be From: @apms.ai. apms.ai's SPF authorises
   Microsoft 365, because that is where the MX points, and not Hostinger, so
   Gmail sees the domain owner refusing to vouch for the sending server and
   files it as spam or drops it. mail() returns true regardless, and this was
   written as @mail(...) with the result discarded, so nothing ever surfaced.

   Either way the outcome is logged now, and which sender ran decides whether
   delivery can be counted as evidence at the bottom of this file. */
$mailTo = $cfg['notify_to'] ?? 'info@apms.ai';
$mailOk = false;      /* the send was attempted and did not report failure */
$mailProven = false;  /* a mail server took responsibility for the message */
$mailErr = '';
if ($mailTo) {
    $subject = 'Demo enquiry: ' . $company . ' (' . $name . ')';
    $body = "New Book a Demo enquiry\n\n"
          . "Name:     $name\n"
          . "Email:    $email\n"
          . "Phone:    $phone\n"
          . "Company:  $company\n\n"
          . "Message:\n$message\n\n"
          . "-- \nReceived (UTC): $now\nIP: $ip\n";

    /* ---- the HTML part ----------------------------------------------------
       Tables and inline styles only. A mail client may drop <style>, external
       CSS, flex and grid, so none of those are used. Every value goes through
       htmlspecialchars: this is visitor-supplied text landing in a document,
       and an enquiry containing a tag must render as that tag's characters
       rather than as markup. */
    $e = static function (string $v): string {
        return htmlspecialchars($v, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    };
    $row = static function (string $label, string $value, bool $last = false) use ($e): string {
        return '<tr>'
             . '<td style="padding:12px 24px;' . ($last ? '' : 'border-bottom:1px solid #e6ebf0;')
             . 'font:600 12px/1.4 Arial,Helvetica,sans-serif;letter-spacing:.08em;'
             . 'text-transform:uppercase;color:#5f6d7a;width:110px;vertical-align:top;">'
             . $e($label) . '</td>'
             . '<td style="padding:12px 24px 12px 0;' . ($last ? '' : 'border-bottom:1px solid #e6ebf0;')
             . 'font:400 15px/1.5 Arial,Helvetica,sans-serif;color:#0c1a28;">'
             . $value . '</td></tr>';
    };

    $html =
      '<!DOCTYPE html><html><head><meta charset="utf-8">'
    . '<meta name="viewport" content="width=device-width,initial-scale=1">'
    . '<title>' . $e($subject) . '</title></head>'
    . '<body style="margin:0;padding:0;background:#eef2f6;">'
    . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"'
    . ' style="background:#eef2f6;padding:24px 12px;"><tr><td align="center">'

    /* width="100%" with a max-width cap, NOT width="600". A fixed 600 overflowed
       a phone reading pane by 234px when measured, because the HTML width
       attribute wins over max-width in the layout the attribute implies. Fluid
       with a cap fits every width, and desktop Outlook simply fills its pane. */
    . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"'
    . ' style="width:100%;max-width:600px;background:#ffffff;border-radius:12px;'
    . 'overflow:hidden;box-shadow:0 2px 8px rgba(12,26,40,.08);">'

    /* header band */
    . '<tr><td style="background:#0b1826;padding:22px 24px;">'
    . '<div style="font:700 11px/1 Arial,Helvetica,sans-serif;letter-spacing:.18em;'
    . 'text-transform:uppercase;color:#2ee0b4;">APMS.ai</div>'
    . '<div style="font:700 20px/1.3 Arial,Helvetica,sans-serif;color:#ffffff;'
    . 'margin-top:6px;">New Book a Demo enquiry</div>'
    . '</td></tr>'
    . '<tr><td style="height:3px;background:#2ee0b4;font-size:0;line-height:0;">&nbsp;</td></tr>'

    /* the five fields */
    . '<tr><td style="padding:8px 0 0;">'
    . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">'
    . $row('Name', $e($name))
    . $row('Email', '<a href="mailto:' . $e($email) . '" style="color:#0a7a61;">' . $e($email) . '</a>')
    . $row('Phone', '<a href="tel:' . $e(preg_replace('/[^\d+]/', '', $phone))
           . '" style="color:#0a7a61;">' . $e($phone) . '</a>')
    . $row('Company', $e($company), true)
    . '</table></td></tr>'

    /* the message, given room of its own */
    . '<tr><td style="padding:4px 24px 20px;">'
    . '<div style="font:600 12px/1.4 Arial,Helvetica,sans-serif;letter-spacing:.08em;'
    . 'text-transform:uppercase;color:#5f6d7a;margin:12px 0 8px;">Message</div>'
    . '<div style="border-left:3px solid #2ee0b4;background:#f6f8fa;padding:14px 16px;'
    . 'font:400 15px/1.65 Arial,Helvetica,sans-serif;color:#0c1a28;white-space:pre-wrap;'
    . 'word-break:break-word;">' . nl2br($e($message)) . '</div>'
    . '</td></tr>'

    /* one obvious action */
    . '<tr><td style="padding:0 24px 24px;">'
    . '<a href="mailto:' . $e($email) . '?subject=' . rawurlencode('Re: your APMS.ai enquiry')
    . '" style="display:inline-block;background:#17c99b;color:#04231c;'
    . 'font:700 15px/1 Arial,Helvetica,sans-serif;padding:13px 22px;border-radius:8px;'
    . 'text-decoration:none;">Reply to ' . $e($name) . '</a>'
    . '</td></tr>'

    /* provenance */
    . '<tr><td style="background:#f6f8fa;border-top:1px solid #e6ebf0;padding:14px 24px;'
    . 'font:400 12px/1.6 Arial,Helvetica,sans-serif;color:#5f6d7a;">'
    . 'Received ' . $e($now) . ' UTC &nbsp;&middot;&nbsp; IP ' . $e($ip) . '<br>'
    . 'Sent by the contact form on apms.ai. Reply goes straight to the enquirer.'
    . '</td></tr>'

    . '</table></td></tr></table></body></html>';

    $smtp = $cfg['smtp'] ?? [];
    if (!empty($smtp['host']) && !empty($smtp['user']) && !empty($smtp['pass'])) {
        $mailOk = apms_smtp_send($smtp, $mailTo, $subject, $body, $email, $name, $mailErr, $html);
        /* true only after the server answered 250 to the end of DATA */
        $mailProven = $mailOk;
        if (!$mailOk) {
            @error_log('[apms-enquiry] smtp send failed: ' . $mailErr);
        }
    } else {
        $from = $cfg['notify_from'] ?? ('no-reply@' . ($_SERVER['HTTP_HOST'] ?? 'apms.ai'));
        $headers = "From: APMS.ai website <$from>\r\n"
                 . "Reply-To: $name <$email>\r\n"
                 . "Content-Type: text/plain; charset=utf-8\r\n";
        $mailOk = @mail($mailTo, $subject, $body, $headers);
        if (!$mailOk) {
            $mailErr = 'mail() returned false';
            @error_log('[apms-enquiry] mail() failed, and no smtp block is configured');
        } else {
            @error_log('[apms-enquiry] sent via mail(); configure an smtp block in '
                     . 'config.php if it does not arrive, which on this host is likely');
        }
    }
}

/* ---------- answer honestly ----------
   Success is claimed only if the enquiry is actually somewhere we can read it
   back. If every route failed, say so and give another way to reach us: a
   form that swallows an enquiry and says "thanks" is worse than no form.

   A delivered email counts as one of those places, but only when delivery was
   actually established. That is $mailProven, and it is set on the SMTP path
   alone: true there means the server answered 250 to the end of DATA and took
   responsibility for the message. $mailOk is NOT used for this, because on the
   mail() path it is whatever mail() returned, and mail() reports success it
   cannot know about. Trusting that would claim success on nothing, which is
   the failure this whole block exists to prevent.

   It matters in the configuration deployed here: MySQL is switched off and the
   CSV is written above the web root, so if the host forbids that write both of
   the other two are false, and a visitor whose enquiry did reach the inbox
   would have been told it failed. */
if ($dbOk || $csvOk || $mailProven) {
    respond(200, "Thanks. Your enquiry is with us and we'll be in touch shortly.", $wantsJson);
}
respond(500, "That didn't send. Please email info@apms.ai or call +91 80501 76508.", $wantsJson);
