-- Persist each trainer's current availability status and optional staff note.
-- Run after task09_reference.sql and before using the trainer status page.

ALTER TABLE trainers
ADD COLUMN IF NOT EXISTS availability_status VARCHAR(12) NOT NULL DEFAULT 'available';

ALTER TABLE trainers
ADD COLUMN IF NOT EXISTS availability_note VARCHAR(120);

ALTER TABLE trainers
ADD COLUMN IF NOT EXISTS availability_break_until TIMESTAMP;

ALTER TABLE trainers
ADD COLUMN IF NOT EXISTS availability_updated_at TIMESTAMP;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_trainer_availability_status'
    ) THEN
        ALTER TABLE trainers
        ADD CONSTRAINT chk_trainer_availability_status
        CHECK (availability_status IN ('available', 'break', 'off'));
    END IF;
END
$$;
