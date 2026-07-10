-- Users created before email verification was introduced are grandfathered in as verified.
UPDATE users SET email_verified = TRUE;
