<?php
/* ==========================================================================
   APMS.ai — server configuration TEMPLATE

   Copy this file to config.php ON THE SERVER and fill it in.
   config.php is gitignored and must never be committed: it holds the
   database password.

   Everything here is optional. With no config.php at all the form still
   works: enquiries go to the CSV and an email is attempted to info@apms.ai.
   ========================================================================== */

return [

    /* ---- MySQL, from Hostinger hPanel > Databases > Management ----
       Hostinger prefixes both the database and the user, so they look like
       u123456789_apms and u123456789_apmsuser. Copy them exactly. */
    'db' => [
        'host' => 'localhost',
        'port' => 3306,
        'name' => '',   // e.g. u123456789_apms
        'user' => '',   // e.g. u123456789_apmsuser
        'pass' => '',
    ],

    /* ---- where the notification email goes ----
       Put the Gmail address here if you want enquiries in Gmail. */
    'notify_to'   => 'info@apms.ai',

    /* ---- how it is sent ------------------------------------------------
       FILL THIS IN, or the mail will not arrive.

       Without an smtp block submit.php falls back to PHP's mail(), which on
       this host is the path that silently fails. mail() posts the message from
       Hostinger's IP claiming to be From: @apms.ai, but apms.ai's SPF record
       authorises Microsoft 365 (that is where the MX points) and not
       Hostinger. Gmail reads that as the domain owner refusing to vouch for
       the sending server, and spams or drops it.

       Sending through Gmail's own SMTP with an app password fixes the cause:
       the message is submitted to a provider that has agreed to send for that
       account, so SPF and DKIM pass and it lands in the inbox.

       Gmail, personal account:
         host   smtp.gmail.com
         port   587      (or 465 with 'secure' => 'ssl')
         user   the full Gmail address
         pass   a 16-character APP PASSWORD, not the account password.
                Google account > Security > 2-Step Verification must be ON
                first, then Security > App passwords. Spaces are stripped for
                you, so it does not matter how you paste it.
         from   must be the same Gmail address, or an alias Gmail has verified
                under Settings > Accounts > Send mail as. Gmail rewrites or
                rejects anything else.

       Microsoft 365 instead, to keep the From: on @apms.ai:
         host smtp.office365.com, port 587, user the full mailbox address,
         pass its password, from that same address. SMTP AUTH is off by
         default on many tenants and an admin has to enable it per mailbox.

       Leave 'host' empty to keep using mail(). */
    'smtp' => [
        'host'      => '',                    // e.g. smtp.gmail.com
        'port'      => 587,                   // 587 with tls, or 465 with ssl
        'secure'    => 'tls',                 // 'tls' | 'ssl' | '' for none
        'user'      => '',                    // the full email address
        'pass'      => '',                    // app password for Gmail
        'from'      => '',                    // defaults to 'user' if blank
        'from_name' => 'APMS.ai website',
        'timeout'   => 20,
    ],

    /* Only used by the mail() fallback. Use an address on your own domain: a
       From: on a domain you do not control is the fastest way to land in
       spam. Ignored once the smtp block above is filled in. */
    'notify_from' => 'no-reply@apms.ai',

    /* ---- the CSV safety net ----
       Default is one level ABOVE public_html, so it is not web-reachable.
       If your plan will not let PHP write outside the web root, point this
       somewhere inside it and the .htaccess rule already blocks .csv. */
    'storage_dir' => __DIR__ . '/../apms-enquiries',
];
