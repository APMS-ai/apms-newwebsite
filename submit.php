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

   Credentials live in config.php, which is NOT in the repository. Copy
   config.sample.php to config.php on the server and fill it in.
   ========================================================================== */

declare(strict_types=1);

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

    $smtp = $cfg['smtp'] ?? [];
    if (!empty($smtp['host']) && !empty($smtp['user']) && !empty($smtp['pass'])) {
        require_once __DIR__ . '/lib/smtp.php';
        $mailOk = apms_smtp_send($smtp, $mailTo, $subject, $body, $email, $name, $mailErr);
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
