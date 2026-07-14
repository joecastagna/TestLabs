ALTER TABLE sightings
    ADD COLUMN coat_type_detected VARCHAR(50),
    ADD COLUMN coat_confidence    DECIMAL(5, 4),
    ADD COLUMN cat_name           VARCHAR(100);
