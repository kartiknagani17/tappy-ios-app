import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/http/app.ts';
import { pruneOldData } from '../src/services/retention.ts';
import { makeScan, MockVisionProvider, testConfig, testDb } from './helpers.ts';

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-kid', alg: 'RS256', use: 'sig' };

function appleToken(claims: Record<string, unknown>, kid = 'test-kid') {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = `${enc({ alg: 'RS256', kid })}.${enc(claims)}`;
  return `${head}.${sign('RSA-SHA256', Buffer.from(head), privateKey).toString('base64url')}`;
}
const nonceHash = (raw: string) => createHash('sha256').update(raw).digest('hex');

describe('accounts API', () => {
  let server: Server;
  let base: string;
  const db = testDb();
  const config = testConfig({ authRateLimitPerMinute: 1000, appleBundleId: 'company.tappy.app', googleClientIds: ['test-client.apps.googleusercontent.com'] });
  const sent: { to: string; text: string }[] = [];
  const revoked: string[] = [];

  before(async () => {
    const { scan } = makeScan(db, new MockVisionProvider(), config);
    server = createServer(
      createApp({
        db,
        config,
        scan,
        mailer: async (to, _subject, text) => void sent.push({ to, text }),
        appleKeys: async () => [jwk as never],
        googleKeys: async () => [jwk as never],
        appleTokens: { exchangeCode: async (code) => `refresh-for-${code}`, revoke: async (t) => void revoked.push(t) },
      }),
    );
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(() => server.close());

  const post = (p: string, body: unknown, token?: string) =>
    fetch(base + p, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
  const me = (token: string) => fetch(base + '/api/account', { headers: { Authorization: `Bearer ${token}` } });

  it('signs up, logs in, syncs a profile, logs out', async () => {
    const su = await post('/api/auth/signup', { email: 'Ana@Example.com', password: 'correct horse' });
    assert.equal(su.status, 200);
    const { token, account } = (await su.json()) as { token: string; account: { email: string; provider: string } };
    assert.equal(account.email, 'ana@example.com');
    assert.equal(account.provider, 'email');

    const dup = await post('/api/auth/signup', { email: 'ana@example.com', password: 'another one' });
    assert.equal(dup.status, 409);

    const wrong = await post('/api/auth/login', { email: 'ana@example.com', password: 'wrong password' });
    assert.equal(wrong.status, 401);
    const unknown = await post('/api/auth/login', { email: 'nobody@example.com', password: 'whatever1' });
    assert.equal(unknown.status, 401);

    const li = await post('/api/auth/login', { email: 'ANA@example.com', password: 'correct horse' });
    assert.equal(li.status, 200);

    assert.equal((await post('/api/account/profile', { profile: { restrictions: { peanut: { level: 'severe' } } } }, token)).status, 200);
    const got = (await (await me(token)).json()) as { profile: { restrictions: Record<string, unknown> } };
    assert.deepEqual(got.profile.restrictions, { peanut: { level: 'severe' } });

    assert.equal((await post('/api/auth/logout', {}, token)).status, 200);
    assert.equal((await me(token)).status, 401);
  });

  it('rejects short passwords and bad emails', async () => {
    assert.equal((await post('/api/auth/signup', { email: 'b@example.com', password: 'short' })).status, 400);
    assert.equal((await post('/api/auth/signup', { email: 'not-an-email', password: 'long enough' })).status, 400);
  });

  it('resets a password with an emailed code and signs out other sessions', async () => {
    const { token: old } = (await (await post('/api/auth/signup', { email: 'reset@example.com', password: 'first password' })).json()) as {
      token: string;
    };
    assert.equal((await post('/api/auth/reset/request', { email: 'reset@example.com' })).status, 200);
    // Unknown email answers the same way and sends nothing.
    assert.equal((await post('/api/auth/reset/request', { email: 'ghost@example.com' })).status, 200);
    assert.equal(sent.length, 1);
    const code = /(\d{6})/.exec(sent[0].text)![1];

    const bad = await post('/api/auth/reset/confirm', { email: 'reset@example.com', code: '000000' === code ? '111111' : '000000', password: 'new password' });
    assert.equal(bad.status, 400);
    const ok = await post('/api/auth/reset/confirm', { email: 'reset@example.com', code, password: 'new password' });
    assert.equal(ok.status, 200);
    assert.equal((await me(old)).status, 401);
    assert.equal((await post('/api/auth/login', { email: 'reset@example.com', password: 'new password' })).status, 200);
    // Codes are single use.
    assert.equal((await post('/api/auth/reset/confirm', { email: 'reset@example.com', code, password: 'third password' })).status, 400);
  });

  it('signs in with Apple and links a matching verified email', async () => {
    const now = Math.floor(Date.now() / 1000);
    const claims = { iss: 'https://appleid.apple.com', aud: 'company.tappy.app', exp: now + 600, sub: 'apple-123', email: 'ana@example.com', email_verified: true, nonce: nonceHash('n1') };
    const res = await post('/api/auth/apple', { identity_token: appleToken(claims), nonce: 'n1' });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { account: { email: string } };
    assert.equal(body.account.email, 'ana@example.com'); // linked to the email account from the first test

    const wrongNonce = await post('/api/auth/apple', { identity_token: appleToken(claims), nonce: 'other' });
    assert.equal(wrongNonce.status, 401);
    const wrongAud = await post('/api/auth/apple', { identity_token: appleToken({ ...claims, aud: 'com.evil.app' }), nonce: 'n1' });
    assert.equal(wrongAud.status, 401);
    const expired = await post('/api/auth/apple', { identity_token: appleToken({ ...claims, exp: now - 3600 }), nonce: 'n1' });
    assert.equal(expired.status, 401);
    const tampered = appleToken(claims).replace(/\.[^.]+\./, `.${Buffer.from(JSON.stringify({ ...claims, sub: 'someone-else' })).toString('base64url')}.`);
    assert.equal((await post('/api/auth/apple', { identity_token: tampered, nonce: 'n1' })).status, 401);
  });

  it('fills in a missing email on a later Apple sign-in, unless another account has it', async () => {
    const now = Math.floor(Date.now() / 1000);
    const base = { iss: 'https://appleid.apple.com', aud: 'company.tappy.app', exp: now + 600, sub: 'apple-noemail', nonce: nonceHash('n2') };
    const first = (await (await post('/api/auth/apple', { identity_token: appleToken(base), nonce: 'n2' })).json()) as { account: { id: number; email: string | null } };
    assert.equal(first.account.email, null);
    const later = { ...base, email: 'abc123@privaterelay.appleid.com', email_verified: 'true' };
    const again = (await (await post('/api/auth/apple', { identity_token: appleToken(later), nonce: 'n2' })).json()) as { account: { id: number; email: string | null } };
    assert.equal(again.account.id, first.account.id);
    assert.equal(again.account.email, 'abc123@privaterelay.appleid.com');

    // An address that belongs to another account is not copied onto this one.
    const other = { ...base, sub: 'apple-noemail-2' };
    const made = (await (await post('/api/auth/apple', { identity_token: appleToken(other), nonce: 'n2' })).json()) as { account: { id: number } };
    const taken = (await (
      await post('/api/auth/apple', { identity_token: appleToken({ ...other, email: 'ana@example.com', email_verified: true }), nonce: 'n2' })
    ).json()) as { account: { id: number; email: string | null } };
    assert.equal(taken.account.id, made.account.id);
    assert.equal(taken.account.email, null);
  });

  it('signs in with Google, links a matching verified email and rejects bad tokens', async () => {
    const now = Math.floor(Date.now() / 1000);
    const aud = 'test-client.apps.googleusercontent.com';
    const claims = { iss: 'https://accounts.google.com', aud, exp: now + 600, sub: 'google-123', email: 'gina@example.com', email_verified: true, nonce: 'g1' };
    const first = await post('/api/auth/google', { id_token: appleToken(claims), nonce: 'g1' });
    assert.equal(first.status, 200);
    const body = (await first.json()) as { account: { id: number; email: string; provider: string } };
    assert.equal(body.account.email, 'gina@example.com');
    assert.equal(body.account.provider, 'google');
    // Same Google user again: same account.
    const again = (await (await post('/api/auth/google', { id_token: appleToken(claims), nonce: 'g1' })).json()) as { account: { id: number } };
    assert.equal(again.account.id, body.account.id);

    // An existing email account with the same verified email is linked, not duplicated.
    await post('/api/auth/signup', { email: 'link@example.com', password: 'a long password' });
    const linked = (await (await post('/api/auth/google', { id_token: appleToken({ ...claims, sub: 'google-456', email: 'link@example.com' }), nonce: 'g1' })).json()) as {
      account: { email: string; provider: string };
    };
    assert.equal(linked.account.email, 'link@example.com');
    // The unverified password is dropped when a verified owner links: it can't be used to get back in.
    assert.equal(linked.account.provider, 'google');
    assert.equal((await post('/api/auth/login', { email: 'link@example.com', password: 'a long password' })).status, 401);

    // An unverified email is never used to link accounts.
    const unverified = (await (
      await post('/api/auth/google', { id_token: appleToken({ ...claims, sub: 'google-789', email: 'ana@example.com', email_verified: false }), nonce: 'g1' })
    ).json()) as { account: { email: string | null } };
    assert.equal(unverified.account.email, null);

    assert.equal((await post('/api/auth/google', { id_token: appleToken(claims), nonce: 'other' })).status, 401);
    assert.equal((await post('/api/auth/google', { id_token: appleToken({ ...claims, aud: 'someone-else.apps.googleusercontent.com' }), nonce: 'g1' })).status, 401);
    assert.equal((await post('/api/auth/google', { id_token: appleToken({ ...claims, iss: 'https://evil.example.com' }), nonce: 'g1' })).status, 401);
    assert.equal((await post('/api/auth/google', { id_token: appleToken({ ...claims, exp: now - 3600 }), nonce: 'g1' })).status, 401);
    assert.equal((await post('/api/auth/google', { id_token: 'not.a.token', nonce: 'g1' })).status, 401);
  });

  it('blocks pre-registering a password on an email someone else owns', async () => {
    const now = Math.floor(Date.now() / 1000);
    const aud = 'test-client.apps.googleusercontent.com';
    // Attacker signs up first with the victim's (unverified) email and keeps a session open.
    const attacker = (await (await post('/api/auth/signup', { email: 'victim@example.com', password: 'attacker password' })).json()) as { token: string };
    // The real owner signs in with Google (verified email): the attacker's password and session stop working.
    const owner = await post('/api/auth/google', {
      id_token: appleToken({ iss: 'https://accounts.google.com', aud, exp: now + 600, sub: 'g-victim', email: 'victim@example.com', email_verified: true, nonce: 'v' }),
      nonce: 'v',
    });
    assert.equal(owner.status, 200);
    assert.equal((await me(attacker.token)).status, 401);
    assert.equal((await post('/api/auth/login', { email: 'victim@example.com', password: 'attacker password' })).status, 401);
    // Signing up with the email of an Apple/Google account doesn't attach a password to it.
    const grab = await post('/api/auth/signup', { email: 'victim@example.com', password: 'another attacker pw' });
    assert.equal(grab.status, 409);
    assert.equal((await post('/api/auth/login', { email: 'victim@example.com', password: 'another attacker pw' })).status, 401);
  });

  it('revokes the Sign in with Apple token when the account is deleted', async () => {
    const now = Math.floor(Date.now() / 1000);
    const claims = { iss: 'https://appleid.apple.com', aud: 'company.tappy.app', exp: now + 600, sub: 'apple-revoke', nonce: nonceHash('r1') };
    const res = await post('/api/auth/apple', { identity_token: appleToken(claims), nonce: 'r1', authorization_code: 'code-1' });
    assert.equal(res.status, 200);
    const { token } = (await res.json()) as { token: string };
    assert.equal((await post('/api/account/delete', {}, token)).status, 200);
    assert.deepEqual(revoked, ['refresh-for-code-1']);
  });

  it('deletes the account and everything tied to it', async () => {
    const { token } = (await (await post('/api/auth/signup', { email: 'gone@example.com', password: 'delete me please' })).json()) as { token: string };
    assert.equal((await post('/api/account/delete', {}, token)).status, 200);
    assert.equal((await me(token)).status, 401);
    assert.equal((await post('/api/auth/login', { email: 'gone@example.com', password: 'delete me please' })).status, 401);
    assert.equal((db.prepare("SELECT count(*) AS n FROM users WHERE email = 'gone@example.com'").get() as { n: number }).n, 0);
  });

  it('serves the home page with links to the legal pages', async () => {
    const res = await fetch(base + '/');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /text\/html/);
    const html = await res.text();
    assert.match(html, /Find food you can eat/);
    assert.match(html, /href="\/privacy"/);
    assert.match(html, /href="\/terms"/);
  });

  it('serves the legal pages as HTML', async () => {
    for (const p of ['/terms', '/privacy']) {
      const res = await fetch(base + p);
      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-type') ?? '', /text\/html/);
      assert.match(await res.text(), p === '/terms' ? /Terms of Use/ : /Privacy Policy/);
    }
  });

  it('reports password reset availability on /api/health', async () => {
    const body = (await (await fetch(base + '/api/health')).json()) as { password_reset: boolean };
    assert.equal(body.password_reset, true);
  });

  it('rate limits login attempts per email', async () => {
    const { scan } = makeScan(db, new MockVisionProvider(), config);
    const strict = createServer(createApp({ db, config: { ...config, authRateLimitPerMinute: 3 }, scan }));
    await new Promise<void>((r) => strict.listen(0, r));
    const url = `http://127.0.0.1:${(strict.address() as AddressInfo).port}/api/auth/login`;
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'ana@example.com', password: 'nope nope' }) });
      statuses.push(r.status);
    }
    strict.close();
    assert.deepEqual(statuses, [401, 401, 401, 429]);
  });

  it('prunes old per-device usage rows', () => {
    db.prepare("INSERT INTO usage_daily (user_id, day, scans, photo_scans) VALUES ('old-device', '2000-01-01', 1, 0)").run();
    pruneOldData(db);
    assert.equal((db.prepare("SELECT count(*) AS n FROM usage_daily WHERE user_id = 'old-device'").get() as { n: number }).n, 0);
  });
});
