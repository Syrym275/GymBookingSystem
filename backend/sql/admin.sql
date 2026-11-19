-- Admin area: trainer approval, staff names, audit log, and a single admin account.
-- Run after auth_schema.sql and email_verification.sql. Safe to run more than once,
-- including on the shared Azure database that already has data.

-- 1. Trainer approval -------------------------------------------------------
-- A trainer who signed up waits for the admin. "Pending" = never approved, which is
-- different from "deactivated later" (is_active = FALSE but approved_at is set).
ALTER TABLE trainers
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP;

-- Active trainers were approved before this column existed (seed data, or approved by
-- hand in pgAdmin). Re-running this only touches active rows that still have no date.
UPDATE trainers
SET approved_at = CURRENT_TIMESTAMP
WHERE is_active = TRUE
  AND approved_at IS NULL;

-- 2. Display name for staff logins ------------------------------------------
-- Members and trainers take their name from their own row; receptionists and the
-- admin have no such row, so the login keeps its own name.
ALTER TABLE users
ADD COLUMN IF NOT EXISTS full_name VARCHAR(100);

-- 3. Exactly one admin ------------------------------------------------------
-- A partial unique index on a constant: at most one row can have role = 'admin'.
DO $$
DECLARE
    admin_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO admin_count FROM users WHERE role = 'admin';
    IF admin_count > 1 THEN
        RAISE EXCEPTION 'There are % admin accounts in users. Keep one (change the role of the others) and run the migration again.', admin_count;
    END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_single_admin
    ON users ((TRUE))
    WHERE role = 'admin';

-- 4. Audit log --------------------------------------------------------------
-- Who did what and when. The actor's email is copied, so the row stays readable
-- even if that account is removed later.
CREATE TABLE IF NOT EXISTS audit_log (
    audit_id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_user_id INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
    actor_email   VARCHAR(255),
    actor_role    VARCHAR(20),
    action        VARCHAR(60) NOT NULL,
    target_type   VARCHAR(30),
    target_id     INTEGER,
    details       JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created
    ON audit_log (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_action
    ON audit_log (action, created_at DESC);
