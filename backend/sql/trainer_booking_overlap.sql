-- Install the database-level guard against overlapping trainer sessions.
-- The API also checks all non-cancelled/non-expired bookings while holding an
-- advisory lock for that trainer. This index is the database-level race guard for
-- pending/confirmed holds. Run as the owner of public.bookings.
CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$
BEGIN
    ALTER TABLE public.bookings
    DROP CONSTRAINT IF EXISTS excl_trainer_no_overlap;

    IF EXISTS (
        SELECT 1
        FROM public.bookings a
        JOIN public.bookings b
          ON a.booking_id < b.booking_id
         AND a.trainer_id = b.trainer_id
         AND tsrange(a.start_time, a.end_time, '[)')
             && tsrange(b.start_time, b.end_time, '[)')
        WHERE a.trainer_id IS NOT NULL
          AND a.status IN ('pending', 'confirmed')
          AND b.status IN ('pending', 'confirmed')
    ) THEN
        RAISE EXCEPTION 'Overlapping pending/confirmed trainer bookings exist; resolve them before adding excl_trainer_no_overlap.';
    END IF;

    ALTER TABLE public.bookings
    ADD CONSTRAINT excl_trainer_no_overlap
    EXCLUDE USING gist (
        trainer_id WITH =,
        tsrange(start_time, end_time, '[)') WITH &&
    )
    WHERE (status IN ('pending', 'confirmed'));
END;
$$;
