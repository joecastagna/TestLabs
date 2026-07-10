UPDATE users SET username = split_part(email, '@', 1) WHERE username IS NULL;
