-- =====================================================================
--  Gym Booking System - Task 9 Database Project Check
--  DBMS: PostgreSQL 13 or newer (tested on PostgreSQL 16.15)
--
--  How to run:
--    psql:    createdb gym_booking
--             psql -d gym_booking -f GymBookingSystem_Task09.sql
--    pgAdmin: create database "gym_booking", open Query Tool,
--             open this file, press Execute (F5).
--
--  The script can be run again: it drops and recreates everything.
--  All names, phones, e-mails and payment numbers are fictional.
--  Fixed dates: past period 12-25 Oct 2026, upcoming week 2-8 Nov 2026,
--  "today" for the demo = Thu 29 Oct 2026.
--
--  Sections
--    1. Clean start + extension
--    2. Tables (keys, data types, CHECK rules)
--    3. No-overlap rules (exclusion constraints)
--    4. Trigger: membership valid + max 2 unpaid bookings
--    5. Transaction function: payment + confirmation together
--    6. Sample data
--    7. SELECT queries (business questions)
--    8. Access control (roles, grants, trainer view)
--    9. Transaction demo (rolled back so the demo can be repeated)
-- =====================================================================


-- =====================================================================
-- 1. CLEAN START
-- =====================================================================
DROP VIEW     IF EXISTS v_trainer_schedule;
DROP TABLE    IF EXISTS payments CASCADE;
DROP TABLE    IF EXISTS bookings CASCADE;
DROP TABLE    IF EXISTS halls    CASCADE;
DROP TABLE    IF EXISTS trainers CASCADE;
DROP TABLE    IF EXISTS members  CASCADE;
DROP FUNCTION IF EXISTS check_booking_rules() CASCADE;
DROP FUNCTION IF EXISTS confirm_booking_payment(INTEGER, NUMERIC, VARCHAR, VARCHAR);

-- btree_gist is a standard PostgreSQL extension. We need it so that one
-- rule can compare an INTEGER (trainer_id = ...) and a time range
-- (overlap &&) at the same time. See section 3.
CREATE EXTENSION IF NOT EXISTS btree_gist;


-- =====================================================================
-- 2. TABLES
-- =====================================================================

-- 2.1 MEMBERS: one row per gym member (the person who books)
CREATE TABLE members (
    member_id             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    full_name             VARCHAR(100) NOT NULL,
    email                 VARCHAR(255) NOT NULL UNIQUE,
    phone                 VARCHAR(16)  NOT NULL UNIQUE,
    qr_code_token         VARCHAR(64)  NOT NULL UNIQUE,   -- value inside the member's QR card (kiosk login)
    membership_plan       VARCHAR(20)  NOT NULL,
    membership_expires_on DATE         NOT NULL,          -- last valid day
    created_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_member_email CHECK (email LIKE '%_@_%._%'),
    CONSTRAINT chk_member_phone CHECK (phone ~ '^\+7[0-9]{10}$'),   -- format +7XXXXXXXXXX
    CONSTRAINT chk_member_plan  CHECK (membership_plan IN ('monthly', 'quarterly', 'annual'))
);

-- 2.2 TRAINERS: one row per personal trainer
CREATE TABLE trainers (
    trainer_id        INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    full_name         VARCHAR(100)  NOT NULL,
    specialization    VARCHAR(60)   NOT NULL,
    session_price_kzt NUMERIC(10,2) NOT NULL CHECK (session_price_kzt > 0),  -- price of one 60-min session
    is_active         BOOLEAN       NOT NULL DEFAULT TRUE                    -- deactivate instead of delete
);

-- 2.3 HALLS: one row per hall / studio that can be rented
CREATE TABLE halls (
    hall_id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    hall_name       VARCHAR(60)   NOT NULL UNIQUE,
    capacity        SMALLINT      NOT NULL CHECK (capacity BETWEEN 1 AND 200),
    hourly_rate_kzt NUMERIC(10,2) NOT NULL CHECK (hourly_rate_kzt > 0),
    is_active       BOOLEAN       NOT NULL DEFAULT TRUE
);

-- 2.4 BOOKINGS: one row per booking (training session OR hall rental).
--     It is also the bridge table: members <-> trainers, members <-> halls.
CREATE TABLE bookings (
    booking_id   INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    member_id    INTEGER       NOT NULL REFERENCES members (member_id),
    booking_type VARCHAR(12)   NOT NULL,
    trainer_id   INTEGER       NULL     REFERENCES trainers (trainer_id),  -- only for 'training'
    hall_id      INTEGER       NULL     REFERENCES halls (hall_id),        -- only for 'hall_rental'
    start_time   TIMESTAMP     NOT NULL,
    end_time     TIMESTAMP     NOT NULL,                                   -- end is NOT included
    status       VARCHAR(10)   NOT NULL DEFAULT 'pending',
    price_kzt    NUMERIC(10,2) NOT NULL CHECK (price_kzt > 0),             -- price agreed at booking time
    created_at   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_booking_type   CHECK (booking_type IN ('training', 'hall_rental')),
    CONSTRAINT chk_booking_status CHECK (status IN ('pending', 'confirmed', 'completed',
                                                    'no_show', 'cancelled', 'expired')),
    -- exactly one resource, and it must match the type
    CONSTRAINT chk_booking_resource CHECK (
        (booking_type = 'training'    AND trainer_id IS NOT NULL AND hall_id IS NULL) OR
        (booking_type = 'hall_rental' AND hall_id IS NOT NULL    AND trainer_id IS NULL)
    ),
    -- the end must be after the start
    CONSTRAINT chk_booking_interval CHECK (end_time > start_time),
    -- inside opening hours 07:00-22:00 and on one day
    CONSTRAINT chk_booking_opening_hours CHECK (
        start_time::date = end_time::date
        AND start_time::time >= TIME '07:00'
        AND end_time::time   <= TIME '22:00'
    ),
    -- a training session is a fixed 60-minute slot that starts on the hour
    CONSTRAINT chk_training_slot CHECK (
        booking_type <> 'training'
        OR (date_trunc('hour', start_time) = start_time
            AND end_time = start_time + INTERVAL '1 hour')
    )
);

-- 2.5 PAYMENTS: every payment attempt for a booking.
--     Card numbers are NEVER stored - only the bank's transaction number.
CREATE TABLE payments (
    payment_id       INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    booking_id       INTEGER       NOT NULL REFERENCES bookings (booking_id),
    amount_kzt       NUMERIC(10,2) NOT NULL,
    method           VARCHAR(10)   NOT NULL,
    payment_status   VARCHAR(10)   NOT NULL,
    provider_txn_ref VARCHAR(40)   NOT NULL UNIQUE,   -- same bank answer cannot be saved twice
    created_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_payment_amount CHECK (amount_kzt > 0),
    CONSTRAINT chk_payment_method CHECK (method IN ('card', 'nfc', 'app', 'cash')),
    CONSTRAINT chk_payment_status CHECK (payment_status IN ('approved', 'declined', 'refunded'))
);

-- At most ONE approved payment per booking (no double charge recorded).
-- A "partial" unique index: uniqueness only for rows with status 'approved'.
CREATE UNIQUE INDEX uq_payments_one_approved_per_booking
    ON payments (booking_id)
    WHERE payment_status = 'approved';


-- =====================================================================
-- 3. NO-OVERLAP RULES (FR-01, FR-02)
-- ---------------------------------------------------------------------
-- A foreign key only checks that trainer 1 EXISTS. It cannot see other
-- bookings, so it cannot stop a double booking.
--
-- An EXCLUSION constraint says: "no two rows may have the same trainer
-- AND overlapping time". tsrange(start, end, '[)') is the time interval:
--   [ = start included,  ) = end NOT included.
-- So 18:00-20:00 and 20:00-22:00 do NOT overlap -> back-to-back is allowed.
-- && means "overlaps" = existing.start < new.end AND new.start < existing.end
-- Only bookings that hold the slot count (pending or confirmed);
-- cancelled / expired / past bookings do not block anything.
-- =====================================================================

-- FR-01: one trainer cannot have two sessions at the same time
ALTER TABLE bookings ADD CONSTRAINT excl_trainer_no_overlap
    EXCLUDE USING gist (trainer_id WITH =, tsrange(start_time, end_time, '[)') WITH &&)
    WHERE (status IN ('pending', 'confirmed'));

-- FR-02: one hall cannot have two overlapping rentals
ALTER TABLE bookings ADD CONSTRAINT excl_hall_no_overlap
    EXCLUDE USING gist (hall_id WITH =, tsrange(start_time, end_time, '[)') WITH &&)
    WHERE (status IN ('pending', 'confirmed'));

-- Extra (Task 7 error E1, double click): one member cannot be in two
-- places at once
ALTER TABLE bookings ADD CONSTRAINT excl_member_no_overlap
    EXCLUDE USING gist (member_id WITH =, tsrange(start_time, end_time, '[)') WITH &&)
    WHERE (status IN ('pending', 'confirmed'));


-- =====================================================================
-- 4. TRIGGER: rules that need to look at OTHER rows
-- ---------------------------------------------------------------------
-- A CHECK constraint sees only one row, so it cannot count bookings or
-- read the members table. A trigger runs automatically BEFORE every
-- INSERT into bookings and can do both:
--   Rule A (GB002): membership must be valid on the booking date.
--   Rule B (GB001): a member may have at most 2 pending (unpaid) bookings.
-- FOR UPDATE locks the member's row, so if the same member sends two
-- bookings at the same second, the second one waits and then counts again.
-- =====================================================================
CREATE FUNCTION check_booking_rules() RETURNS trigger AS $$
DECLARE
    v_expires_on    DATE;
    v_pending_count INTEGER;
BEGIN
    -- read (and lock) the member
    SELECT membership_expires_on INTO v_expires_on
    FROM members
    WHERE member_id = NEW.member_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN NEW;  -- member does not exist: the foreign key / NOT NULL will reject the row
    END IF;

    -- Rule A: membership valid on the booking date
    IF NEW.start_time::date > v_expires_on THEN
        RAISE EXCEPTION 'GB002: membership of member % ends on %, cannot book %',
              NEW.member_id, v_expires_on, NEW.start_time::date
              USING ERRCODE = 'GB002';
    END IF;

    -- Rule B: maximum 2 pending (unpaid) bookings
    IF NEW.status = 'pending' THEN
        SELECT COUNT(*) INTO v_pending_count
        FROM bookings
        WHERE member_id = NEW.member_id AND status = 'pending';

        IF v_pending_count >= 2 THEN
            RAISE EXCEPTION 'GB001: member % already has 2 unpaid bookings - pay or cancel one first',
                  NEW.member_id
                  USING ERRCODE = 'GB001';
        END IF;
    END IF;

    RETURN NEW;  -- all good: save the row
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER bookings_check_rules
    BEFORE INSERT ON bookings
    FOR EACH ROW EXECUTE FUNCTION check_booking_rules();


-- =====================================================================
-- 5. TRANSACTION FUNCTION: save approved payment + confirm booking
-- ---------------------------------------------------------------------
-- Step 1: INSERT the approved payment.
-- Step 2: UPDATE the booking from 'pending' to 'confirmed'.
-- If step 2 changes 0 rows (booking is expired / cancelled / already
-- confirmed) we RAISE an error -> PostgreSQL rolls back the whole
-- transaction, so step 1 is undone too. Never "paid but not confirmed".
-- Called inside BEGIN ... COMMIT (see section 9).
-- =====================================================================
CREATE FUNCTION confirm_booking_payment(
    p_booking_id INTEGER,
    p_amount_kzt NUMERIC,
    p_method     VARCHAR,
    p_txn_ref    VARCHAR
) RETURNS VOID AS $$
BEGIN
    -- Step 1
    INSERT INTO payments (booking_id, amount_kzt, method, payment_status, provider_txn_ref)
    VALUES (p_booking_id, p_amount_kzt, p_method, 'approved', p_txn_ref);

    -- Step 2
    UPDATE bookings
    SET status = 'confirmed'
    WHERE booking_id = p_booking_id
      AND status = 'pending';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'GB003: booking % is not pending - payment is not saved', p_booking_id
              USING ERRCODE = 'GB003';
    END IF;
END;
$$ LANGUAGE plpgsql;


-- =====================================================================
-- 6. SAMPLE DATA (fictional)
-- IDs are generated automatically in insert order: 1, 2, 3, ...
-- =====================================================================

INSERT INTO members (full_name, email, phone, qr_code_token, membership_plan, membership_expires_on) VALUES
  ('Aruzhan Bekova',    'aruzhan.bekova@mail.kz',    '+77011234501', 'QR-7F3A91C2', 'annual',    '2027-08-31'),  -- 1
  ('Dias Nurlanov',     'dias.nurlanov@mail.kz',     '+77011234502', 'QR-2B8D44E7', 'quarterly', '2026-12-31'),  -- 2
  ('Aliya Tulegenova',  'aliya.tulegenova@mail.kz',  '+77011234503', 'QR-9C1E05A3', 'annual',    '2027-03-15'),  -- 3
  ('Yerassyl Omarov',   'yerassyl.omarov@mail.kz',   '+77011234504', 'QR-5A6F7B18', 'monthly',   '2026-11-20'),  -- 4
  ('Kamila Zhumabayeva','kamila.zhumabayeva@mail.kz','+77011234505', 'QR-D40C2E69', 'quarterly', '2027-01-31'),  -- 5
  ('Timur Akhmetov',    'timur.akhmetov@mail.kz',    '+77011234506', 'QR-81E9F3B4', 'monthly',   '2026-10-31'),  -- 6 (ends soon)
  ('Saule Kassymova',   'saule.kassymova@mail.kz',   '+77011234507', 'QR-6E27A0D5', 'annual',    '2027-06-30'),  -- 7
  ('Madina Serikova',   'madina.serikova@mail.kz',   '+77011234508', 'QR-C3B58D1F', 'quarterly', '2027-01-15');  -- 8

INSERT INTO trainers (full_name, specialization, session_price_kzt) VALUES
  ('Aigerim Sadykova', 'Strength training',   8000),  -- 1
  ('Arman Seitkali',   'Functional training', 6500),  -- 2
  ('Daniyar Ospanov',  'Boxing',              7000),  -- 3
  ('Zhanna Iskakova',  'Yoga and stretching', 6000);  -- 4

INSERT INTO halls (hall_name, capacity, hourly_rate_kzt) VALUES
  ('Main Hall',     40, 12000),  -- 1
  ('Yoga Studio',   20,  8000),  -- 2
  ('Boxing Studio', 15,  9000);  -- 3

-- Bookings 1-20: past period 12-25 Oct 2026 (17 trainings + 3 hall rentals)
INSERT INTO bookings (member_id, booking_type, trainer_id, hall_id, start_time, end_time, status, price_kzt) VALUES
  (1, 'training',    1, NULL, '2026-10-12 18:00', '2026-10-12 19:00', 'completed',  8000),  -- 1
  (2, 'training',    1, NULL, '2026-10-12 19:00', '2026-10-12 20:00', 'completed',  8000),  -- 2
  (3, 'training',    4, NULL, '2026-10-13 07:00', '2026-10-13 08:00', 'completed',  6000),  -- 3
  (5, 'training',    2, NULL, '2026-10-13 18:00', '2026-10-13 19:00', 'completed',  6500),  -- 4
  (7, 'hall_rental', NULL, 1, '2026-10-14 18:00', '2026-10-14 20:00', 'completed', 24000),  -- 5
  (4, 'training',    1, NULL, '2026-10-14 18:00', '2026-10-14 19:00', 'completed',  8000),  -- 6
  (8, 'training',    3, NULL, '2026-10-15 10:00', '2026-10-15 11:00', 'completed',  7000),  -- 7
  (6, 'training',    1, NULL, '2026-10-15 19:00', '2026-10-15 20:00', 'no_show',    8000),  -- 8
  (1, 'training',    4, NULL, '2026-10-16 08:00', '2026-10-16 09:00', 'completed',  6000),  -- 9
  (2, 'hall_rental', NULL, 3, '2026-10-17 10:00', '2026-10-17 12:00', 'completed', 18000),  -- 10
  (5, 'training',    1, NULL, '2026-10-19 18:00', '2026-10-19 19:00', 'completed',  8000),  -- 11
  (3, 'training',    4, NULL, '2026-10-20 08:00', '2026-10-20 09:00', 'completed',  6000),  -- 12
  (4, 'training',    2, NULL, '2026-10-20 12:00', '2026-10-20 13:00', 'completed',  6500),  -- 13
  (7, 'training',    1, NULL, '2026-10-21 19:00', '2026-10-21 20:00', 'completed',  8000),  -- 14
  (8, 'training',    3, NULL, '2026-10-21 18:00', '2026-10-21 19:00', 'completed',  7000),  -- 15
  (6, 'training',    2, NULL, '2026-10-22 19:00', '2026-10-22 20:00', 'completed',  6500),  -- 16
  (1, 'training',    1, NULL, '2026-10-22 18:00', '2026-10-22 19:00', 'completed',  8000),  -- 17
  (5, 'hall_rental', NULL, 2, '2026-10-23 17:00', '2026-10-23 19:00', 'completed', 16000),  -- 18
  (2, 'training',    3, NULL, '2026-10-24 12:00', '2026-10-24 13:00', 'completed',  7000),  -- 19
  (8, 'training',    1, NULL, '2026-10-24 19:00', '2026-10-24 20:00', 'completed',  8000);  -- 20

-- Bookings 21-31: upcoming week 2-8 Nov 2026
INSERT INTO bookings (member_id, booking_type, trainer_id, hall_id, start_time, end_time, status, price_kzt) VALUES
  (1, 'training',    1, NULL, '2026-11-02 18:00', '2026-11-02 19:00', 'confirmed',  8000),  -- 21
  (2, 'training',    1, NULL, '2026-11-02 19:00', '2026-11-02 20:00', 'confirmed',  8000),  -- 22 back-to-back with 21
  (3, 'training',    4, NULL, '2026-11-03 08:00', '2026-11-03 09:00', 'confirmed',  6000),  -- 23
  (5, 'hall_rental', NULL, 1, '2026-11-04 18:00', '2026-11-04 20:00', 'confirmed', 24000),  -- 24
  (7, 'hall_rental', NULL, 1, '2026-11-04 20:00', '2026-11-04 22:00', 'confirmed', 24000),  -- 25 back-to-back with 24
  (4, 'training',    1, NULL, '2026-11-04 18:00', '2026-11-04 19:00', 'pending',    8000),  -- 26 unpaid
  (4, 'hall_rental', NULL, 2, '2026-11-06 17:00', '2026-11-06 19:00', 'pending',   16000),  -- 27 unpaid
  (8, 'training',    3, NULL, '2026-11-05 10:00', '2026-11-05 11:00', 'cancelled',  7000),  -- 28
  (5, 'training',    2, NULL, '2026-11-05 19:00', '2026-11-05 20:00', 'confirmed',  6500),  -- 29
  (1, 'training',    3, NULL, '2026-11-07 09:00', '2026-11-07 10:00', 'expired',    7000),  -- 30 not paid in time
  (2, 'hall_rental', NULL, 3, '2026-11-07 10:00', '2026-11-07 12:00', 'confirmed', 18000);  -- 31

-- Realistic creation times: 3 days before the start, but not after "today"
UPDATE bookings
SET created_at = LEAST(start_time - INTERVAL '3 days', TIMESTAMP '2026-10-29 12:00');

-- Payments: one approved payment for every paid booking.
-- Booking 24 shows two attempts (declined, then approved).
-- Booking 30 has only a declined attempt, so it expired.
INSERT INTO payments (booking_id, amount_kzt, method, payment_status, provider_txn_ref) VALUES
  ( 1,  8000, 'card', 'approved', 'TXN-20261009-0001'),  -- 1
  ( 2,  8000, 'app',  'approved', 'TXN-20261009-0002'),  -- 2
  ( 3,  6000, 'card', 'approved', 'TXN-20261010-0003'),  -- 3
  ( 4,  6500, 'nfc',  'approved', 'TXN-20261010-0004'),  -- 4
  ( 5, 24000, 'card', 'approved', 'TXN-20261011-0005'),  -- 5
  ( 6,  8000, 'app',  'approved', 'TXN-20261011-0006'),  -- 6
  ( 7,  7000, 'cash', 'approved', 'TXN-20261012-0007'),  -- 7
  ( 8,  8000, 'card', 'approved', 'TXN-20261012-0008'),  -- 8
  ( 9,  6000, 'nfc',  'approved', 'TXN-20261013-0009'),  -- 9
  (10, 18000, 'card', 'approved', 'TXN-20261014-0010'),  -- 10
  (11,  8000, 'app',  'approved', 'TXN-20261016-0011'),  -- 11
  (12,  6000, 'card', 'approved', 'TXN-20261017-0012'),  -- 12
  (13,  6500, 'cash', 'approved', 'TXN-20261017-0013'),  -- 13
  (14,  8000, 'nfc',  'approved', 'TXN-20261018-0014'),  -- 14
  (15,  7000, 'card', 'approved', 'TXN-20261018-0015'),  -- 15
  (16,  6500, 'app',  'approved', 'TXN-20261019-0016'),  -- 16
  (17,  8000, 'card', 'approved', 'TXN-20261019-0017'),  -- 17
  (18, 16000, 'card', 'approved', 'TXN-20261020-0018'),  -- 18
  (19,  7000, 'nfc',  'approved', 'TXN-20261021-0019'),  -- 19
  (20,  8000, 'app',  'approved', 'TXN-20261021-0020'),  -- 20
  (21,  8000, 'card', 'approved', 'TXN-20261027-0021'),  -- 21
  (22,  8000, 'app',  'approved', 'TXN-20261027-0022'),  -- 22
  (23,  6000, 'nfc',  'approved', 'TXN-20261028-0023'),  -- 23
  (24, 24000, 'card', 'declined', 'TXN-20261028-0024'),  -- 24 first attempt failed
  (24, 24000, 'card', 'approved', 'TXN-20261028-0025'),  -- 25 second attempt OK
  (25, 24000, 'app',  'approved', 'TXN-20261028-0026'),  -- 26
  (29,  6500, 'card', 'approved', 'TXN-20261029-0027'),  -- 27
  (31, 18000, 'nfc',  'approved', 'TXN-20261029-0028'),  -- 28
  (30,  7000, 'card', 'declined', 'TXN-20261029-0029');  -- 29

-- Payment time = 10 minutes after the booking was made
UPDATE payments p
SET created_at = b.created_at + INTERVAL '10 minutes'
FROM bookings b
WHERE b.booking_id = p.booking_id;


-- =====================================================================
-- 7. SELECT QUERIES (business questions)
-- =====================================================================

-- 7.1 JOIN: booking slip - one booking with member, resource and all
--     payment attempts. Shows that one booking can have many payments.
SELECT b.booking_id,
       'BK-' || LPAD(b.booking_id::text, 4, '0') AS slip_number,
       m.full_name                               AS member_name,
       COALESCE(t.full_name, h.hall_name)        AS trainer_or_hall,
       b.start_time, b.end_time, b.status, b.price_kzt,
       p.payment_id, p.amount_kzt, p.method, p.payment_status
FROM bookings b
JOIN members m       ON m.member_id  = b.member_id
LEFT JOIN trainers t ON t.trainer_id = b.trainer_id
LEFT JOIN halls h    ON h.hall_id    = b.hall_id
LEFT JOIN payments p ON p.booking_id = b.booking_id
WHERE b.booking_id = 24
ORDER BY p.payment_id;

-- 7.2 MAIN REPORT QUERY - upcoming bookings.
--     "Which bookings hold a trainer or a hall in the coming week
--      (Mon 2 - Sun 8 Nov 2026): who, which trainer/hall, when,
--      and is it paid (confirmed) or unpaid (pending)?"
--     In the real system the dates would be CURRENT_DATE-based.
SELECT b.booking_id,
       m.full_name AS member_name,
       CASE b.booking_type WHEN 'training' THEN 'Personal training'
                           ELSE 'Hall rental' END AS booking_type,
       COALESCE(t.full_name, h.hall_name) AS trainer_or_hall,
       b.start_time, b.end_time, b.status
FROM bookings b
JOIN members m       ON m.member_id  = b.member_id
LEFT JOIN trainers t ON t.trainer_id = b.trainer_id
LEFT JOIN halls h    ON h.hall_id    = b.hall_id
WHERE b.status IN ('confirmed', 'pending')
  AND b.start_time >= TIMESTAMP '2026-11-02 00:00'
  AND b.start_time <  TIMESTAMP '2026-11-09 00:00'
ORDER BY b.start_time, b.booking_id;

-- 7.3 GYM ACTIVITY - popular trainers in the past two weeks (12-25 Oct)
SELECT t.full_name AS trainer,
       COUNT(*)                                                     AS sessions_held,
       COUNT(*) FILTER (WHERE b.start_time::time >= TIME '17:00')   AS evening_17_22,
       COUNT(*) FILTER (WHERE b.start_time::time <  TIME '17:00')   AS before_17,
       COUNT(*) FILTER (WHERE b.status = 'no_show')                 AS no_shows
FROM bookings b
JOIN trainers t ON t.trainer_id = b.trainer_id
WHERE b.booking_type = 'training'
  AND b.status IN ('completed', 'no_show')
  AND b.start_time >= '2026-10-12' AND b.start_time < '2026-10-26'
GROUP BY t.trainer_id, t.full_name
ORDER BY sessions_held DESC, trainer;

-- 7.4 GYM ACTIVITY - popular start hours for training (same period)
SELECT EXTRACT(HOUR FROM b.start_time) AS start_hour,
       COUNT(*)                        AS sessions
FROM bookings b
WHERE b.booking_type = 'training'
  AND b.status IN ('completed', 'no_show')
  AND b.start_time >= '2026-10-12' AND b.start_time < '2026-10-26'
GROUP BY start_hour
ORDER BY start_hour;

-- 7.5 Members with unpaid (pending) bookings - who is at the limit of 2?
SELECT m.member_id, m.full_name, m.phone,
       COUNT(*) AS pending_bookings
FROM bookings b
JOIN members m ON m.member_id = b.member_id
WHERE b.status = 'pending'
GROUP BY m.member_id, m.full_name, m.phone
ORDER BY pending_bookings DESC;


-- =====================================================================
-- 8. ACCESS CONTROL (least privilege)
-- ---------------------------------------------------------------------
-- Group roles (NOLOGIN). Real staff accounts would be members of them.
-- Roles are shared by the whole PostgreSQL server, so we create them
-- only if they do not exist yet. Needs a user with CREATEROLE
-- (e.g. postgres). If you do not have it, you may skip this section.
-- =====================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gym_app')       THEN CREATE ROLE gym_app       NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gym_reception') THEN CREATE ROLE gym_reception NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gym_trainer')   THEN CREATE ROLE gym_trainer   NOLOGIN; END IF;
END $$;

-- Booking service (app / website / kiosk): makes bookings and payments.
-- Needs e-mail (FR-03) and QR token (kiosk login), not needed: phone.
GRANT SELECT (member_id, full_name, email, qr_code_token, membership_plan, membership_expires_on)
      ON members TO gym_app;
GRANT UPDATE (email) ON members TO gym_app;          -- member can change own e-mail (also allows the trigger's row lock)
GRANT SELECT ON trainers, halls TO gym_app;
GRANT SELECT, INSERT ON bookings TO gym_app;
GRANT UPDATE (status) ON bookings TO gym_app;
GRANT SELECT, INSERT ON payments TO gym_app;
GRANT EXECUTE ON FUNCTION confirm_booking_payment(INTEGER, NUMERIC, VARCHAR, VARCHAR) TO gym_app;

-- Reception: sees name + phone, checks members in (changes status only).
-- No QR token, no e-mail, no payments.
GRANT SELECT (member_id, full_name, phone, membership_plan, membership_expires_on)
      ON members TO gym_reception;
GRANT SELECT ON trainers, halls, bookings TO gym_reception;
GRANT UPDATE (status) ON bookings TO gym_reception;

-- Trainer: only a schedule view with the member's NAME - no phone,
-- no e-mail, no QR token, no payments.
CREATE VIEW v_trainer_schedule AS
SELECT b.booking_id, t.full_name AS trainer, m.full_name AS member_name,
       b.start_time, b.end_time, b.status
FROM bookings b
JOIN trainers t ON t.trainer_id = b.trainer_id
JOIN members m  ON m.member_id  = b.member_id
WHERE b.booking_type = 'training';

GRANT SELECT ON v_trainer_schedule TO gym_trainer;

-- Nobody gets DELETE: history is kept; resources are deactivated instead.


-- =====================================================================
-- 9. TRANSACTION DEMO
-- ---------------------------------------------------------------------
-- The card terminal said "approved" for pending booking 26
-- (Yerassyl Omarov, Aigerim Sadykova, Wed 4 Nov 18:00, 8000 KZT).
-- In the real system this ends with COMMIT. Here we use ROLLBACK at the
-- end only so that the sample data stays the same and the demo can be
-- shown again. The failure case (booking 30, expired) is in the test file.
-- =====================================================================
BEGIN;

SELECT booking_id, status FROM bookings WHERE booking_id = 26;              -- before: pending

SELECT confirm_booking_payment(26, 8000, 'card', 'TXN-20261029-0030');      -- step 1 + step 2

SELECT booking_id, status FROM bookings WHERE booking_id = 26;              -- after: confirmed
SELECT payment_id, booking_id, amount_kzt, payment_status, provider_txn_ref
FROM payments WHERE booking_id = 26;                                        -- new approved payment

ROLLBACK;   -- real system: COMMIT;  then send the in-app message + e-mail (FR-03)

-- The same transaction written without the function (for explanation):
--   BEGIN;
--   INSERT INTO payments (booking_id, amount_kzt, method, payment_status, provider_txn_ref)
--   VALUES (26, 8000, 'card', 'approved', 'TXN-20261029-0030');
--   UPDATE bookings SET status = 'confirmed' WHERE booking_id = 26 AND status = 'pending';
--   -- if the UPDATE says "UPDATE 0" -> ROLLBACK;  otherwise:
--   COMMIT;

-- End of script
