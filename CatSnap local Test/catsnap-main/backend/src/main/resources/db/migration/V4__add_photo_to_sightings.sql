ALTER TABLE sightings
    ADD COLUMN photo_path    VARCHAR(500),
    ADD COLUMN gps_latitude  DECIMAL(9, 6),
    ADD COLUMN gps_longitude DECIMAL(9, 6);
