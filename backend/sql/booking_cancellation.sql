-- Allow the dedicated application role to mark approved payments refunded
-- when a paid booking is cancelled. Safe when gym_app is not present.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gym_app') THEN
        EXECUTE 'GRANT UPDATE (payment_status) ON TABLE public.payments TO gym_app';
    END IF;
END
$$;
