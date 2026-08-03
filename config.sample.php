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

    /* ---- where the notification email goes ---- */
    'notify_to'   => 'info@apms.ai',

    /* The envelope sender. Use an address on your own domain: a From: on a
       domain you do not control is the fastest way to land in spam. */
    'notify_from' => 'no-reply@apms.ai',

    /* ---- the CSV safety net ----
       Default is one level ABOVE public_html, so it is not web-reachable.
       If your plan will not let PHP write outside the web root, point this
       somewhere inside it and the .htaccess rule already blocks .csv. */
    'storage_dir' => __DIR__ . '/../apms-enquiries',
];
