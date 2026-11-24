-- Sign-in lockout against password guessing. Run after auth_schema.sql. Safe to run more than once.

-- One row per email that has failed to sign in recently. Keyed by the typed email, not by user_id,
-- so guessing against an address with no account is slowed down the same way (and looks the same).
-- After 5 failures within 15 minutes the email is locked for 15 minutes.
-- A successful sign-in or a password reset deletes the row.
CREATE TABLE IF NOT EXISTS login_lockouts (
    email             VARCHAR(255) PRIMARY KEY,
    failed_count      INTEGER   NOT NULL DEFAULT 0,
    window_started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    locked_until      TIMESTAMP
);
