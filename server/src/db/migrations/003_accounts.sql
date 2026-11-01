-- Accounts: email + password and/or Sign in with Apple. The dietary profile is synced as an opaque JSON blob.
CREATE TABLE users (
  id                  INTEGER PRIMARY KEY,
  email               TEXT COLLATE NOCASE,           -- NULL when Apple hides it and never shared one
  password_hash       TEXT,                          -- NULL for Apple-only accounts
  apple_sub           TEXT,
  profile_json        TEXT,
  profile_updated_at  INTEGER,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL
);
CREATE UNIQUE INDEX users_email ON users (email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX users_apple_sub ON users (apple_sub) WHERE apple_sub IS NOT NULL;

-- Only a SHA-256 of each bearer token is stored, so a database copy can't be used to sign in.
CREATE TABLE sessions (
  token_hash    TEXT PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at    INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL,
  last_used_at  INTEGER NOT NULL
) WITHOUT ROWID;
CREATE INDEX sessions_user ON sessions (user_id);
CREATE INDEX sessions_expires ON sessions (expires_at);

-- Password reset codes (hashed), single use, short-lived.
CREATE TABLE password_resets (
  user_id     INTEGER PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  code_hash   TEXT NOT NULL,
  expires_at  INTEGER NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0
);
