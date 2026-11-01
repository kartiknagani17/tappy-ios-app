import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/http/app.ts';
import { dirSource, importUsda } from '../src/import/usda.ts';
import { RevenueCatEntitlements, type EntitlementChecker } from '../src/services/entitlements.ts';
import { FIXTURES, makeScan, MockVisionProvider, packagePhoto, testConfig, testDb } from './helpers.ts';

const ANON = '$RCAnonymousID:0123456789abcdef0123456789abcdef';

describe('RevenueCatEntitlements', () => {
  const reply = (entitlements: Record<string, unknown>, status = 200) =>
    (async () => new Response(JSON.stringify({ subscriber: { entitlements } }), { status })) as unknown as typeof fetch;

  it('is active until the entitlement expires', async () => {
    let now = Date.parse('2026-11-01T00:00:00Z');
    const rc = new RevenueCatEntitlements({
      secretKey: 'sk_test',
      entitlementId: 'tappy_pro',
      now: () => now,
      fetchImpl: reply({ tappy_pro: { expires_date: '2026-11-08T00:00:00Z' } }),
    });
    assert.equal(await rc.isSubscribed(ANON), true);
    now = Date.parse('2026-11-09T00:00:00Z');
    assert.equal(await rc.isSubscribed(ANON), false);
  });

  it('treats a missing entitlement, other entitlements and API errors as not subscribed', async () => {
    const none = new RevenueCatEntitlements({ secretKey: 'k', entitlementId: 'tappy_pro', fetchImpl: reply({ other: { expires_date: null } }) });
    assert.equal(await none.isSubscribed(ANON), false);
    const down = new RevenueCatEntitlements({ secretKey: 'k', entitlementId: 'tappy_pro', fetchImpl: reply({}, 500) });
    assert.equal(await down.isSubscribed(ANON), false);
  });

  it('counts a lifetime entitlement (no expiry) as active and caches the answer', async () => {
    let calls = 0;
    const rc = new RevenueCatEntitlements({
      secretKey: 'k',
      entitlementId: 'tappy_pro',
      fetchImpl: (async () => {
        calls++;
        return new Response(JSON.stringify({ subscriber: { entitlements: { tappy_pro: { expires_date: null } } } }));
      }) as unknown as typeof fetch,
    });
    assert.equal(await rc.isSubscribed(ANON), true);
    assert.equal(await rc.isSubscribed(ANON), true);
    assert.equal(calls, 1);
  });
});

describe('subscriber scan limits', () => {
  let server: Server;
  let base: string;
  const db = testDb();
  const config = testConfig({ dailyFreeScans: 2, dailyFreePhotoScans: 1, subscriberDailyPhotoScans: 2, rateLimitPerMinute: 1000 });
  const checked: string[] = [];
  const entitlements: EntitlementChecker = {
    isSubscribed: async (id) => {
      checked.push(id);
      return id === ANON || id === 'tappy-user-1';
    },
  };

  before(async () => {
    await importUsda(db, dirSource(path.join(FIXTURES, 'usda')), () => {});
    const { scan } = makeScan(db, new MockVisionProvider(), config);
    server = createServer(createApp({ db, config, scan, entitlements }));
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(() => server.close());

  const post = (p: string, body: unknown, user: string, headers: Record<string, string> = {}) =>
    fetch(base + p, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Tappy-User': user, ...headers },
      body: JSON.stringify(body),
    });

  it('gives subscribers unlimited barcode scans', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await post('/api/scan/barcode', { barcode: '013764027503' }, 'device-sub-1', { 'X-Tappy-Purchaser': ANON });
      assert.equal(res.status, 200);
    }
  });

  it('keeps the free limit for everyone else', async () => {
    const other = '$RCAnonymousID:ffffffffffffffffffffffffffffffff';
    const scan = () => post('/api/scan/barcode', { barcode: '013764027503' }, 'device-free-1', { 'X-Tappy-Purchaser': other });
    assert.equal((await scan()).status, 200);
    assert.equal((await scan()).status, 200);
    assert.equal((await scan()).status, 429);
  });

  it('ignores a client-supplied account purchaser id', async () => {
    checked.length = 0;
    await post('/api/scan/barcode', { barcode: '013764027503' }, 'device-spoof-1', { 'X-Tappy-Purchaser': 'tappy-user-1' });
    assert.deepEqual(checked, []);
  });

  it('applies the fair-use photo cap to subscribers', async () => {
    const img = (await packagePhoto(5)).toString('base64');
    const photo = () => post('/api/scan/front', { image_base64: img }, 'device-sub-2', { 'X-Tappy-Purchaser': ANON });
    assert.equal((await photo()).status, 200);
    assert.equal((await photo()).status, 200);
    const third = await photo();
    assert.equal(third.status, 429);
    assert.match(((await third.json()) as { message: string }).message, /Barcode scans are still unlimited/);
  });
});
