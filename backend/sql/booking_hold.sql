ALTER TABLE bookings
ADD COLUMN IF NOT EXISTS payment_expires_at TIMESTAMP NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_pending_expiry
ON bookings (payment_expires_at)
WHERE status = 'pending';

CREATE OR REPLACE FUNCTION expire_pending_bookings()
RETURNS INTEGER AS $$
DECLARE
    expired_count INTEGER;
BEGIN
    UPDATE bookings
    SET status = 'expired'
    WHERE status = 'pending'
      AND payment_expires_at IS NOT NULL
      AND payment_expires_at <= CURRENT_TIMESTAMP;

    GET DIAGNOSTICS expired_count = ROW_COUNT;

    RETURN expired_count;
END;
$$ LANGUAGE plpgsql;