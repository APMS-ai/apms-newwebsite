-- ==========================================================================
-- APMS.ai — enquiries table
--
-- Run once, in Hostinger hPanel > Databases > phpMyAdmin > SQL tab.
--
-- utf8mb4 throughout, so a name or a message can hold any character a
-- visitor can type, emoji included. utf8 alone in MySQL is only three bytes
-- and truncates at the first four-byte character.
-- ==========================================================================

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
