CREATE TABLE IF NOT EXISTS users (
    user_id       INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role          VARCHAR(20) NOT NULL DEFAULT 'member',
    member_id     INTEGER UNIQUE REFERENCES members(member_id),
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_user_role
        CHECK (role IN ('member', 'trainer', 'receptionist', 'admin'))
);

-- Links a trainer's login to their trainers row. Safe to run on an existing database.
ALTER TABLE users
ADD COLUMN IF NOT EXISTS trainer_id INTEGER UNIQUE REFERENCES trainers(trainer_id);

-- Email confirmation. Existing accounts are marked verified so they keep working;
-- new sign-ups are inserted as unverified and must enter the emailed code.
ALTER TABLE users
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE users
ALTER COLUMN email_verified SET DEFAULT FALSE;

-- One active code per user. Only a SHA-256 hash of the code is stored.
CREATE TABLE IF NOT EXISTS email_verifications (
    user_id    INTEGER PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    code_hash  CHAR(64)  NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    sent_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    attempts   SMALLINT  NOT NULL DEFAULT 0
);
