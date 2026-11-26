-- Combined bookings: ONE booking can hold a hall AND a trainer for the same time
-- ("3-way connection": member + hall + trainer).
--
-- Adds the booking type 'combined'. Existing rows and rules are untouched:
--   training    -> trainer, no hall
--   hall_rental -> hall, no trainer
--   combined    -> trainer AND hall (new)
-- The no-overlap constraints (trainer / hall / member) are defined on the columns, so a
-- combined booking is protected by all three automatically. Safe to run more than once.
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS chk_booking_type;
ALTER TABLE bookings ADD CONSTRAINT chk_booking_type
    CHECK (booking_type IN ('training', 'hall_rental', 'combined'));

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS chk_booking_resource;
ALTER TABLE bookings ADD CONSTRAINT chk_booking_resource CHECK (
    (booking_type = 'training'    AND trainer_id IS NOT NULL AND hall_id IS NULL) OR
    (booking_type = 'hall_rental' AND hall_id IS NOT NULL    AND trainer_id IS NULL) OR
    (booking_type = 'combined'    AND trainer_id IS NOT NULL AND hall_id IS NOT NULL)
);
