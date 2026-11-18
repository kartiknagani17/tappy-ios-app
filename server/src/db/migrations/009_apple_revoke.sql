-- Sign in with Apple refresh token, kept only so it can be revoked with Apple when the account is deleted.
ALTER TABLE users ADD COLUMN apple_refresh_token TEXT;
