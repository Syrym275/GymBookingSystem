-- Password reset links. Run after auth_schema.sql. Safe to run more than once.

-- One row per emailed link. Only a SHA-256 hash of the token is stored, never the token itself.
-- Rows are kept after use or expiry: the request limit counts them.
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    token_id   INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    token_hash CHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    used_at    TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user
    ON password_reset_tokens (user_id, created_at);
