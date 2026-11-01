import { createHash, createPublicKey, randomBytes, randomInt, scrypt, timingSafeEqual, verify } from 'node:crypto';
import { promisify } from 'node:util';
import { nowSeconds, transaction, type DB } from '../db/index.ts';

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number, opts: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>;

export const MIN_PASSWORD = 8;
export const MAX_PASSWORD = 128;
const SESSION_TTL_SECONDS = 180 * 24 * 3600;
const RESET_TTL_SECONDS = 15 * 60;
const RESET_MAX_ATTEMPTS = 5;
const PROFILE_MAX_BYTES = 64 * 1024;

export class AuthError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export type User = {
  id: number;
  email: string | null;
  password_hash: string | null;
  apple_sub: string | null;
  profile_json: string | null;
  profile_updated_at: number | null;
};

export type PublicAccount = { id: number; email: string | null; provider: 'email' | 'apple' };

export function toPublicAccount(u: User): PublicAccount {
  return { id: u.id, email: u.email, provider: u.password_hash ? 'email' : 'apple' };
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export function normalizeEmail(input: unknown): string {
  if (typeof input !== 'string') throw new AuthError(400, 'bad_request', 'Enter a valid email address.');
  const email = input.normalize('NFKC').trim().toLowerCase();
  if (email.length < 6 || email.length > 254 || !/^[^\s@]{1,64}@[^\s@.]+(?:\.[^\s@.]+)*\.[a-z]{2,}$/i.test(email)) {
    throw new AuthError(400, 'bad_request', 'Enter a valid email address.');
  }
  return email;
}

export function readPassword(input: unknown): string {
  if (typeof input !== 'string' || input.length < MIN_PASSWORD) {
    throw new AuthError(400, 'weak_password', `Password must be at least ${MIN_PASSWORD} characters.`);
  }
  if (input.length > MAX_PASSWORD) throw new AuthError(400, 'bad_request', `Password must be at most ${MAX_PASSWORD} characters.`);
  return input;
}

// ---------- passwords (scrypt, N=2^15) ----------

const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password.normalize('NFKC'), salt, 32, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, saltB64, keyB64] = stored.split('$');
  if (alg !== 'scrypt' || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, 'base64');
  const key = await scryptAsync(password.normalize('NFKC'), Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT.maxmem,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Spent on unknown emails too, so response time doesn't reveal which emails have accounts. */
const DUMMY_HASH = hashPassword('not-a-real-password');

// ---------- sessions ----------

export function createSession(db: DB, userId: number): string {
  const token = randomBytes(32).toString('base64url');
  const now = nowSeconds();
  db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_used_at) VALUES (?, ?, ?, ?, ?)').run(
    sha256(token),
    userId,
    now,
    now + SESSION_TTL_SECONDS,
    now,
  );
  return token;
}

/** The signed-in user for a bearer token, or null. Sliding expiry: use extends the session. */
export function userForToken(db: DB, token: string): User | null {
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) return null;
  const now = nowSeconds();
  const h = sha256(token);
  const row = db
    .prepare(
      `SELECT u.id, u.email, u.password_hash, u.apple_sub, u.profile_json, u.profile_updated_at, s.last_used_at
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .get(h, now) as (User & { last_used_at: number }) | undefined;
  if (!row) return null;
  if (now - row.last_used_at > 3600) {
    db.prepare('UPDATE sessions SET last_used_at = ?, expires_at = ? WHERE token_hash = ?').run(now, now + SESSION_TTL_SECONDS, h);
  }
  const { last_used_at: _l, ...user } = row;
  return user;
}

export function deleteSession(db: DB, token: string) {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
}

export function pruneSessions(db: DB) {
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(nowSeconds());
  db.prepare('DELETE FROM password_resets WHERE expires_at <= ?').run(nowSeconds());
}

const getUser = (db: DB, where: string, value: unknown) =>
  db.prepare(`SELECT id, email, password_hash, apple_sub, profile_json, profile_updated_at FROM users WHERE ${where} = ?`).get(value as string) as
    | User
    | undefined;

// ---------- email + password ----------

export async function signUp(db: DB, emailIn: unknown, passwordIn: unknown): Promise<{ user: User; token: string }> {
  const email = normalizeEmail(emailIn);
  const password = readPassword(passwordIn);
  const hash = await hashPassword(password);
  const now = nowSeconds();
  return transaction(db, () => {
    const existing = getUser(db, 'email', email);
    if (existing?.password_hash) throw new AuthError(409, 'email_taken', 'An account with this email already exists. Log in instead.');
    if (existing) {
      // Apple account that shared this email: add a password to it.
      db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(hash, now, existing.id);
      return { user: { ...existing, password_hash: hash }, token: createSession(db, existing.id) };
    }
    const id = Number(
      db.prepare('INSERT INTO users (email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?)').run(email, hash, now, now).lastInsertRowid,
    );
    return { user: getUser(db, 'id', id)!, token: createSession(db, id) };
  });
}

export async function logIn(db: DB, emailIn: unknown, passwordIn: unknown): Promise<{ user: User; token: string }> {
  const email = normalizeEmail(emailIn);
  const password = typeof passwordIn === 'string' ? passwordIn.slice(0, MAX_PASSWORD) : '';
  const user = getUser(db, 'email', email);
  const ok = user?.password_hash ? await verifyPassword(password, user.password_hash) : (await verifyPassword(password, await DUMMY_HASH), false);
  if (!user || !ok) throw new AuthError(401, 'invalid_credentials', 'Wrong email or password.');
  return { user, token: createSession(db, user.id) };
}

// ---------- password reset (6-digit code by email) ----------

export type Mailer = (to: string, subject: string, text: string) => Promise<void>;

/** Always resolves the same way whether or not the email has an account. */
export async function requestPasswordReset(db: DB, emailIn: unknown, mailer: Mailer): Promise<void> {
  const email = normalizeEmail(emailIn);
  const user = getUser(db, 'email', email);
  if (!user) return;
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  db.prepare(
    `INSERT INTO password_resets (user_id, code_hash, expires_at, attempts) VALUES (?, ?, ?, 0)
     ON CONFLICT (user_id) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0`,
  ).run(user.id, sha256(`${user.id}:${code}`), nowSeconds() + RESET_TTL_SECONDS);
  await mailer(
    email,
    'Your Tappy password reset code',
    `Your Tappy password reset code is ${code}.\n\nIt expires in 15 minutes. If you didn't ask to reset your password, you can ignore this email.`,
  );
}

export async function confirmPasswordReset(db: DB, emailIn: unknown, codeIn: unknown, passwordIn: unknown): Promise<{ user: User; token: string }> {
  const email = normalizeEmail(emailIn);
  const password = readPassword(passwordIn);
  const code = typeof codeIn === 'string' ? codeIn.replace(/\s/g, '') : '';
  const invalid = new AuthError(400, 'invalid_code', 'That code is wrong or has expired. Request a new one.');
  const user = getUser(db, 'email', email);
  if (!user) throw invalid;
  const row = db.prepare('SELECT code_hash, expires_at, attempts FROM password_resets WHERE user_id = ?').get(user.id) as
    | { code_hash: string; expires_at: number; attempts: number }
    | undefined;
  if (!row || row.expires_at <= nowSeconds() || row.attempts >= RESET_MAX_ATTEMPTS) throw invalid;
  const given = Buffer.from(sha256(`${user.id}:${code}`));
  if (!/^\d{6}$/.test(code) || !timingSafeEqual(given, Buffer.from(row.code_hash))) {
    db.prepare('UPDATE password_resets SET attempts = attempts + 1 WHERE user_id = ?').run(user.id);
    throw invalid;
  }
  const hash = await hashPassword(password);
  return transaction(db, () => {
    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(hash, nowSeconds(), user.id);
    db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(user.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id); // sign out everywhere else
    return { user: { ...user, password_hash: hash }, token: createSession(db, user.id) };
  });
}

/** Sends through Resend (https://resend.com) when RESEND_API_KEY is set. */
export function resendMailer(apiKey: string, from: string): Mailer {
  return async (to, subject, text) => {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Resend responded ${res.status}`);
  };
}

// ---------- Sign in with Apple ----------

type AppleKey = { kid: string; kty: string; n: string; e: string; alg?: string; use?: string };
export type AppleKeySource = () => Promise<AppleKey[]>;

let appleKeyCache: { keys: AppleKey[]; at: number } | null = null;
export const fetchAppleKeys: AppleKeySource = async () => {
  if (appleKeyCache && Date.now() - appleKeyCache.at < 3600_000) return appleKeyCache.keys;
  const res = await fetch('https://appleid.apple.com/auth/keys', { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Apple keys responded ${res.status}`);
  const { keys } = (await res.json()) as { keys: AppleKey[] };
  appleKeyCache = { keys, at: Date.now() };
  return keys;
};

const b64json = (s: string) => JSON.parse(Buffer.from(s, 'base64url').toString('utf8')) as Record<string, unknown>;

/**
 * Verifies an Apple identity token (RS256 JWT): signature against Apple's published keys, issuer,
 * audience (the app's bundle id), expiry and nonce (the app sends the raw nonce; the token carries its SHA-256).
 */
export async function verifyAppleToken(
  token: unknown,
  rawNonce: unknown,
  audience: string,
  keys: AppleKeySource = fetchAppleKeys,
): Promise<{ sub: string; email: string | null }> {
  const bad = new AuthError(401, 'invalid_apple_token', 'Sign in with Apple failed. Please try again.');
  if (typeof token !== 'string' || token.length > 4096) throw bad;
  const parts = token.split('.');
  if (parts.length !== 3) throw bad;
  let header: Record<string, unknown>, claims: Record<string, unknown>;
  try {
    header = b64json(parts[0]);
    claims = b64json(parts[1]);
  } catch {
    throw bad;
  }
  if (header.alg !== 'RS256') throw bad;
  let jwk = (await keys()).find((k) => k.kid === header.kid);
  if (!jwk) {
    appleKeyCache = null; // Apple rotated keys
    jwk = (await keys()).find((k) => k.kid === header.kid);
  }
  if (!jwk) throw bad;
  const ok = verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({ key: { kty: jwk.kty, n: jwk.n, e: jwk.e }, format: 'jwk' }), Buffer.from(parts[2], 'base64url'));
  if (!ok) throw bad;
  const now = nowSeconds();
  if (claims.iss !== 'https://appleid.apple.com' || claims.aud !== audience) throw bad;
  if (typeof claims.exp !== 'number' || claims.exp < now - 60) throw bad;
  if (typeof claims.sub !== 'string' || !claims.sub) throw bad;
  if (typeof rawNonce !== 'string' || !rawNonce || claims.nonce !== createHash('sha256').update(rawNonce).digest('hex')) throw bad;
  const verified = claims.email_verified === true || claims.email_verified === 'true';
  const email = verified && typeof claims.email === 'string' ? claims.email.toLowerCase() : null;
  return { sub: claims.sub, email };
}

export function signInWithApple(db: DB, apple: { sub: string; email: string | null }): { user: User; token: string } {
  const now = nowSeconds();
  return transaction(db, () => {
    let user = getUser(db, 'apple_sub', apple.sub);
    if (!user && apple.email) {
      // Same verified email as an existing account: link Apple to it.
      const byEmail = getUser(db, 'email', apple.email);
      if (byEmail && !byEmail.apple_sub) {
        db.prepare('UPDATE users SET apple_sub = ?, updated_at = ? WHERE id = ?').run(apple.sub, now, byEmail.id);
        user = { ...byEmail, apple_sub: apple.sub };
      }
    }
    if (!user) {
      const id = Number(
        db
          .prepare('INSERT INTO users (email, apple_sub, created_at, updated_at) VALUES (?, ?, ?, ?)')
          .run(apple.email, apple.sub, now, now).lastInsertRowid,
      );
      user = getUser(db, 'id', id)!;
    }
    return { user, token: createSession(db, user.id) };
  });
}

// ---------- account data ----------

export function saveProfile(db: DB, userId: number, profile: unknown): number {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) throw new AuthError(400, 'bad_request', 'profile must be an object');
  const json = JSON.stringify(profile);
  if (Buffer.byteLength(json) > PROFILE_MAX_BYTES) throw new AuthError(413, 'too_large', 'Profile is too large');
  const now = nowSeconds();
  db.prepare('UPDATE users SET profile_json = ?, profile_updated_at = ?, updated_at = ? WHERE id = ?').run(json, now, now, userId);
  return now;
}

/** App Store Guideline 5.1.1(v): deleting the account removes it and everything tied to it. */
export function deleteAccount(db: DB, userId: number) {
  db.prepare('DELETE FROM users WHERE id = ?').run(userId); // sessions + resets cascade
}
