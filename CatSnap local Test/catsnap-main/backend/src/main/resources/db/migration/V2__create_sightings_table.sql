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
