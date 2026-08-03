<?php
/* ==========================================================================
   APMS.ai — a small SMTP sender

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

   It speaks to any SMTP server. Gmail is the documented case in
   config.sample.php because that is what was asked for.
   ========================================================================== */

declare(strict_types=1);

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
    ?string &$err = null
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
        'Content-Type: text/plain; charset=utf-8',
        'Content-Transfer-Encoding: base64',
    ];
    if ($replyEmail !== '') {
        /* So hitting Reply in Gmail answers the person who filled the form,
           not the mailbox the notification was sent from. */
        $headers[] = 'Reply-To: ' . apms_smtp_addr($replyEmail, $replyName);
    }

    $payload = implode("\r\n", $headers) . "\r\n\r\n"
             . chunk_split(base64_encode($body), 76, "\r\n");
    fwrite($fp, $payload);
    $say('.');
    if (!$step($read(), ['250'], 'end of DATA')) { $bye(); return false; }

    $bye();
    return true;
}
