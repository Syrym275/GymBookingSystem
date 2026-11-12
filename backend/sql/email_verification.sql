-- Email verification for sign-ups. Run after auth_schema.sql.
-- Safe to run more than once, and on a database that already has users.

-- Accounts that exist before this runs are treated as verified, so nobody is locked out.
-- The column is added with DEFAULT TRUE (which fills existing rows), then new rows default to FALSE.
ALTER TABLE users
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE users
ALTER COLUMN email_verified SET DEFAULT FALSE;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP;

-- One row per emailed link. Only a SHA-256 hash of the token is stored, never the token itself.
-- Rows are kept after use or expiry: the resend limit counts them.
CREATE TABLE IF NOT EXISTS email_verification_tokens (
    token_id   INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    token_hash CHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    used_at    TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user
    ON email_verification_tokens (user_id, created_at);

-- Left over from an earlier 6-digit-code version that was never released.
DROP TABLE IF EXISTS email_verifications;
