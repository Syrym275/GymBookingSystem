-- Group sessions: the member who booked (the owner) invites other members by email.
--
--   * The owner pays the normal price; invited members join for free.
--   * A group is at most 5 people: the owner plus 4 others (invited or accepted).
--   * Works for every booking type (training, hall_rental, combined).
--
-- One row per invited member. Status flow:
--   invited -> accepted | declined
--   accepted -> left (the member leaves) | removed (the owner removes them)
--   declined / left / removed -> invited (the owner invites them again)
--
-- Run after combined_booking.sql. Safe to run more than once, including on the shared
-- Azure database that already has data.

CREATE TABLE IF NOT EXISTS booking_participants (
    booking_id   INTEGER     NOT NULL REFERENCES bookings(booking_id) ON DELETE CASCADE,
    member_id    INTEGER     NOT NULL REFERENCES members(member_id)   ON DELETE CASCADE,
    status       VARCHAR(20) NOT NULL DEFAULT 'invited',
    invited_at   TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    responded_at TIMESTAMP,
    PRIMARY KEY (booking_id, member_id),
    CONSTRAINT chk_participant_status
        CHECK (status IN ('invited', 'accepted', 'declined', 'left', 'removed'))
);

-- "My invitations" and "is this member busy at that time?" both look up by member.
CREATE INDEX IF NOT EXISTS idx_booking_participants_member
    ON booking_participants (member_id, status);

-- A member who joined someone else's session is busy for that time, so they must not
-- book something of their own that overlaps it. The bookings no-overlap constraint only
-- sees the owner, so this trigger covers the guests.
--
-- The name sorts after bookings_check_rules, so it runs after that trigger has locked the
-- member's row. Accepting an invitation locks the same row, so the two cannot race.
CREATE OR REPLACE FUNCTION check_group_overlap() RETURNS trigger AS $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM booking_participants p
        JOIN bookings b ON b.booking_id = p.booking_id
        WHERE p.member_id = NEW.member_id
          AND p.status = 'accepted'
          AND b.status NOT IN ('cancelled', 'expired')
          AND b.start_time < NEW.end_time
          AND b.end_time > NEW.start_time
    ) THEN
        RAISE EXCEPTION 'GB003: member % joined a group session during this time', NEW.member_id
              USING ERRCODE = 'GB003';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bookings_check_rules_group ON bookings;
CREATE TRIGGER bookings_check_rules_group
    BEFORE INSERT ON bookings
    FOR EACH ROW EXECUTE FUNCTION check_group_overlap();
