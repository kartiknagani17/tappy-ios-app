-- Messages from the in-app feedback forms ("Don't see an ingredient?", restriction feedback).
CREATE TABLE feedback (
  id          INTEGER PRIMARY KEY,
  user_id     TEXT NOT NULL,      -- anonymous device id, for the per-device daily cap
  topic       TEXT NOT NULL,
  message     TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX feedback_user_created ON feedback (user_id, created_at);
CREATE INDEX feedback_created ON feedback (created_at);
