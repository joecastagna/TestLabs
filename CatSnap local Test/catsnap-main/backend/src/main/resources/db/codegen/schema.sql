-- Consolidated DDL-only schema for jOOQ code generation.
-- This file mirrors the Flyway migrations (db/migration/) but omits DML statements
-- that are incompatible with the H2 in-memory database used by DDLDatabase.
-- Keep this in sync whenever a new Flyway DDL migration is added.

CREATE TABLE users (
    id              BIGSERIAL       PRIMARY KEY,
    email           VARCHAR(255)    NOT NULL UNIQUE,
    hashed_password VARCHAR(255)    NOT NULL,
    last_login      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN username VARCHAR(50);
ALTER TABLE users ALTER COLUMN username SET NOT NULL;
ALTER TABLE users ADD CONSTRAINT users_username_key UNIQUE (username);
ALTER TABLE users
    ADD COLUMN email_verified              BOOLEAN      NOT NULL DEFAULT FALSE,
    ADD COLUMN verification_code           VARCHAR(6),
    ADD COLUMN verification_code_expires_at TIMESTAMPTZ;

CREATE TABLE sightings (
    id          BIGSERIAL       PRIMARY KEY,
    user_id     BIGINT          NOT NULL REFERENCES users(id),
    color       VARCHAR(255)    NOT NULL,
    pattern     VARCHAR(255)    NOT NULL,
    description VARCHAR(255),
    latitude    DECIMAL(9, 6)   NOT NULL,
    longitude   DECIMAL(9, 6)   NOT NULL,
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

ALTER TABLE sightings
    ADD COLUMN photo_path    VARCHAR(500),
    ADD COLUMN gps_latitude  DECIMAL(9, 6),
    ADD COLUMN gps_longitude DECIMAL(9, 6);
ALTER TABLE sightings
    ADD COLUMN coat_type_detected VARCHAR(50),
    ADD COLUMN coat_confidence    DECIMAL(5, 4),
    ADD COLUMN cat_name           VARCHAR(100);
