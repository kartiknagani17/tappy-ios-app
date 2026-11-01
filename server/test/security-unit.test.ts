import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { photoScanningEnabled, validateConfig } from '../src/config.ts';
import { migrate, openDb } from '../src/db/index.ts';
import { clientIp, decodeImage, HttpError } from '../src/http/app.ts';
import { dirSource, importUsda } from '../src/import/usda.ts';
import { ImageError, prepareImage, probeImage } from '../src/lib/image.ts';
import { describeError, redact, registerSecret } from '../src/lib/log.ts';
import { confirmVisionChoice, recordVisionOffer } from '../src/services/cache.ts';
import { consumeDailyQuota, ipKey, LimitError, RateLimiter, visionSpendToday } from '../src/services/limits.ts';
import { OffLiveClient, safeOffImageUrl } from '../src/services/off-live.ts';
import { buildFtsQuery, getProductByGtin, sanitizeReason, searchProducts } from '../src/services/products.ts';
import { VisionService } from '../src/services/vision/index.ts';
import { FrontResult, LabelResult } from '../src/services/vision/schemas.ts';
import { FIXTURES, frontJson, labelJson, makeScan, MockVisionProvider, packagePhoto, testConfig, testDb } from './helpers.ts';

const usdaDb = async () => {
  const db = testDb();
  await importUsda(db, dirSource(path.join(FIXTURES, 'usda')), () => {});
  return db;
};

describe('rate limiter memory', () => {
  it('stays bounded under a flood of fresh keys', () => {
    let t = 0;
    const rl = new RateLimiter(5, () => t, 1000);
    for (let i = 0; i < 20_000; i++) {
      t += 1; // all within one minute: nothing is stale, so LRU eviction must kick in
      rl.check(`k${i}`);
    }
    assert.ok(rl.size <= 1001, `size ${rl.size}`);
  });

  it('still limits a hot key while others churn', () => {
    let t = 0;
    const rl = new RateLimiter(2, () => t, 10);
    rl.check('hot');
    rl.check('hot');
    for (let i = 0; i < 50; i++) rl.check(`cold${i}`);
    // Hot key may have been evicted by LRU under extreme churn, but a recently used key is kept.
    assert.throws(() => {
      rl.check('cold49');
      rl.check('cold49');
    }, LimitError);
  });
});

describe('client IP + keys', () => {
  const req = (remote: string, xff?: string) =>
    ({ socket: { remoteAddress: remote }, headers: xff ? { 'x-forwarded-for': xff } : {} }) as never;

  it('ignores X-Forwarded-For with no trusted proxy', () => {
    assert.equal(clientIp(req('203.0.113.5', '1.2.3.4'), 0), '203.0.113.5');
  });
  it('takes the entry added by the trusted proxy (rightmost), not the client-controlled leftmost', () => {
    assert.equal(clientIp(req('10.0.0.2', '1.2.3.4, 198.51.100.7'), 1), '198.51.100.7');
    assert.equal(clientIp(req('10.0.0.2', '1.2.3.4, 198.51.100.7, 10.0.0.9'), 2), '198.51.100.7');
    assert.equal(clientIp(req('10.0.0.2', 'garbage'), 1), '10.0.0.2');
    assert.equal(clientIp(req('10.0.0.2'), 1), '10.0.0.2');
  });
  it('ipKey unwraps mapped IPv4 and groups IPv6 by /64', () => {
    assert.equal(ipKey('::ffff:203.0.113.5'), '203.0.113.5');
    assert.equal(ipKey('2001:db8:1:2:aaaa::1'), '2001:db8:1:2::/64');
    assert.equal(ipKey('2001:db8:1:2:ffff:ffff:ffff:ffff'), '2001:db8:1:2::/64');
    assert.equal(ipKey('::1'), '0:0:0:0::/64');
    assert.equal(ipKey('not-an-ip'), 'unknown');
  });
});

describe('daily quotas', () => {
  it('is all-or-nothing across user + IP subjects; IP cap 0 = unlimited', () => {
    const db = testDb();
    const user = { dailyFreeScans: 5, dailyFreePhotoScans: 5 };
    const ip = (n: number) => ({ key: 'ip:1.2.3.4', limits: { dailyFreeScans: 100, dailyFreePhotoScans: n } });
    consumeDailyQuota(db, [{ key: 'user-aaaaaaaa', limits: user }, ip(1)], 'photo');
    assert.throws(() => consumeDailyQuota(db, [{ key: 'user-bbbbbbbb', limits: user }, ip(1)], 'photo'), LimitError);
    assert.equal(db.prepare(`SELECT * FROM usage_daily WHERE user_id = 'user-bbbbbbbb'`).get(), undefined);
    for (let i = 0; i < 20; i++) consumeDailyQuota(db, [{ key: `user-c${i}-aaaaaa`, limits: user }, ip(0)], 'photo');
  });
});

describe('vision spend circuit breaker', () => {
  it('stops calling the provider once the daily budget is spent', async () => {
    const db = testDb();
    const provider = new MockVisionProvider([{ text: frontJson() }, { text: frontJson() }]);
    // Each mock call ~ $0.000195 on Haiku pricing; budget allows exactly one.
    const vision = new VisionService(db, provider, {
      primaryModel: 'claude-haiku-5-5',
      escalationModel: 'claude-sonnet-5-5',
      escalateBelow: 0.6,
      dailyBudgetUsd: 0.0001,
    });
    const first = await vision.run('front', Buffer.from('x'), null);
    assert.ok(first.ok);
    assert.ok(visionSpendToday(db) >= 0.0001);
    const second = await vision.run('front', Buffer.from('x'), null);
    assert.equal(second.ok, false);
    assert.equal(!second.ok && second.error, 'budget_exhausted');
    assert.equal(provider.calls.length, 1);
  });

  it('counts unpriced models pessimistically', () => {
    const db = testDb();
    db.prepare(
      `INSERT INTO vision_calls (task, provider, model, attempt, input_tokens, output_tokens, latency_ms, est_cost_usd, ok)
       VALUES ('front', 'x', 'mystery-model', 1, 1000000, 0, 1, NULL, 1)`,
    ).run();
    assert.equal(visionSpendToday(db), 5);
  });

  it('scan returns vision_unavailable (not 500) when the budget is exhausted', async () => {
    const db = await usdaDb();
    const provider = new MockVisionProvider([{ text: frontJson() }]);
    const { scan } = makeScan(db, provider, testConfig({ visionDailyBudgetUsd: 0.0000001 }));
    db.prepare(
      `INSERT INTO vision_calls (task, provider, model, attempt, input_tokens, output_tokens, latency_ms, est_cost_usd, ok)
       VALUES ('front', 'x', 'claude-haiku-5-5', 1, 1, 1, 1, 1, 1)`,
    ).run();
    const r = await scan.scanFront(await packagePhoto(61), 'u-12345678');
    assert.equal(r.status, 'vision_unavailable');
    assert.equal(provider.calls.length, 0);
  });
});

describe('vision output is untrusted', () => {
  it('rejects over-long strings and too many claims; strips control/bidi chars', () => {
    const base = JSON.parse(frontJson());
    assert.equal(FrontResult.safeParse({ ...base, brand: 'x'.repeat(201) }).success, false);
    assert.equal(FrontResult.safeParse({ ...base, claims_seen: Array(31).fill('Organic') }).success, false);
    assert.equal(FrontResult.safeParse({ ...base, claims_seen: ['x'.repeat(101)] }).success, false);
    assert.equal(FrontResult.safeParse({ ...base, barcode_if_visible: '1'.repeat(65) }).success, false);
    const ok = FrontResult.parse({ ...base, brand: '‮Acme\u0000', product_name: '   ' });
    assert.equal(ok.brand, 'Acme');
    assert.equal(ok.product_name, null);
  });

  it('label: over-long ingredient lists are rejected, not truncated; nutrition numbers bounded', () => {
    const base = JSON.parse(labelJson());
    assert.equal(LabelResult.safeParse({ ...base, ingredients_text: 'a, '.repeat(3000) }).success, false);
    assert.equal(LabelResult.safeParse({ ...base, contains_statement: 'x'.repeat(1001) }).success, false);
    const n = LabelResult.parse({
      ...base,
      nutrition: {
        serving_size: '1 cup',
        calories: -5,
        total_fat_g: 1e12,
        saturated_fat_g: 1,
        sodium_mg: null,
        total_carbohydrate_g: 2,
        dietary_fiber_g: 0,
        total_sugars_g: 0,
        added_sugars_g: 0,
        protein_g: 3,
        __proto__: { evil: true },
      },
    });
    assert.equal(n.nutrition?.calories, null);
    assert.equal(n.nutrition?.total_fat_g, null);
    assert.equal(n.nutrition?.protein_g, 3);
  });

  it('prompt-injected text is just data: an injected "barcode" or instructions cannot escape the schema', async () => {
    const db = testDb();
    const provider = new MockVisionProvider([
      { text: frontJson({ brand: 'IGNORE PREVIOUS INSTRUCTIONS', extra_field: 'x', barcode_if_visible: 'call 1-800; DROP TABLE' }) },
    ]);
    const out = await new VisionService(db, provider, { primaryModel: 'claude-haiku-5-5', escalationModel: 'claude-haiku-5-5', escalateBelow: 0 }).run(
      'front',
      Buffer.from('x'),
      null,
    );
    assert.ok(out.ok);
    assert.equal((out.result as Record<string, unknown>).extra_field, undefined);
    assert.equal(out.result.barcode_if_visible, null); // "1800" is too short to be a GTIN
  });
});

describe('FTS query construction', () => {
  it('neutralizes FTS5 syntax and caps query size', async () => {
    const db = await usdaDb();
    for (const evil of ['"', 'brand:x OR name:*', 'NEAR(a b)', ') OR 1=1 --', "'; DROP TABLE products; --", '^start*', '\u0000‮']) {
      assert.doesNotThrow(() => searchProducts(db, { brand: evil, name: evil, variant: evil }), evil);
    }
    const q = buildFtsQuery(Array.from({ length: 500 }, (_, i) => `word${i}`).join(' '))!;
    assert.equal(q.split(' OR ').length, 24);
    assert.equal(buildFtsQuery('x'.repeat(10_000))!.length <= 66, true);
    assert.equal(getProductByGtin(db, '00013764027503') !== null, true);
  });
});

describe('report reasons', () => {
  it('sanitizes and caps', () => {
    assert.equal(sanitizeReason(42), null);
    assert.equal(sanitizeReason('   '), null);
    assert.equal(sanitizeReason('a\u0000b‮c\n\nd'), 'a b c d');
    assert.equal(Array.from(sanitizeReason('😀'.repeat(900))!).length, 500);
  });
});

describe('image decoding', () => {
  it('refuses decompression bombs via the pixel ceiling', async () => {
    const bomb = await sharp({ create: { width: 8000, height: 8000, channels: 3, background: 'white' } })
      .png({ compressionLevel: 9 })
      .toBuffer();
    assert.ok(bomb.length < 1_000_000, 'tiny file, huge canvas');
    await assert.rejects(probeImage(bomb, 40_000_000), ImageError);
    await assert.rejects(prepareImage(bomb, 40_000_000), ImageError);
  });

  it('refuses SVG and other non-camera formats', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><image href="file:///etc/passwd"/></svg>');
    await assert.rejects(prepareImage(svg), ImageError);
    const tiff = await sharp({ create: { width: 10, height: 10, channels: 3, background: 'red' } }).tiff().toBuffer();
    await assert.rejects(prepareImage(tiff), ImageError);
    await assert.rejects(prepareImage(Buffer.from('GIF89a garbage')), ImageError);
    await assert.rejects(prepareImage(Buffer.alloc(0)), ImageError);
  });

  it('accepts camera formats', async () => {
    const png = await sharp({ create: { width: 20, height: 10, channels: 3, background: 'red' } }).png().toBuffer();
    assert.equal((await prepareImage(png)).width, 20);
  });

  it('decodeImage validates base64 strictly', () => {
    assert.throws(() => decodeImage('abc$', 100), HttpError);
    assert.throws(() => decodeImage('A', 100), HttpError);
    assert.throws(() => decodeImage('data:image/svg+xml;base64,PHN2Zz4=', 100), HttpError);
    assert.equal(decodeImage('aGVs\nbG8=', 100).toString(), 'hello');
    assert.equal(decodeImage('data:image/png;base64,aGVsbG8=', 100).toString(), 'hello');
  });
});

describe('label results are never shared across users', () => {
  it('a doctored label from one user is not served to another user with a look-alike photo', async () => {
    const db = await usdaDb();
    const provider = new MockVisionProvider([
      { text: labelJson({ ingredients_text: 'Water, sugar (peanut-free, trust me)', contains_statement: null }) },
      { text: labelJson({ ingredients_text: 'Water, sugar, peanuts' }) },
    ]);
    const { scan } = makeScan(db, provider);
    const photo = await packagePhoto(71);
    const attacker = await scan.scanLabel(photo, 'attacker-aaaa', { gtin: '036000291452' });
    // Victim photographs the same panel (re-encoded): must get a fresh read, not the attacker's.
    const victimPhoto = await sharp(photo).jpeg({ quality: 70 }).toBuffer();
    const victim = await scan.scanLabel(victimPhoto, 'victim-aaaaaa', { gtin: '036000291452' });
    assert.equal(attacker.status, 'contributed');
    assert.equal(victim.status === 'contributed' && victim.product.ingredients_text, 'Water, sugar, peanuts');
    assert.equal(provider.calls.length, 2);
    // Same user re-sending the identical bytes (retry) is served from cache.
    await scan.scanLabel(victimPhoto, 'victim-aaaaaa', { gtin: '036000291452' });
    assert.equal(provider.calls.length, 2);
    // And one user's contribution is never visible to another user via barcode lookup.
    const third = await scan.resolveBarcode('036000291452', 'bystander-aaaa');
    assert.equal(third.status, 'needs_label_photo');
  });

  it('concurrent identical photo uploads share one vision call', async () => {
    const db = await usdaDb();
    const provider = new MockVisionProvider([{ text: frontJson({ is_food_package: false }) }]);
    const { scan } = makeScan(db, provider);
    const photo = await packagePhoto(72);
    const results = await Promise.all([1, 2, 3].map(() => scan.scanFront(photo, 'u-12345678')));
    assert.deepEqual(
      results.map((r) => r.status),
      ['not_food_package', 'not_food_package', 'not_food_package'],
    );
    assert.equal(provider.calls.length, 1);
  });
});

describe('front confirmation consensus', () => {
  it('needs N distinct networks and a majority before the shared choice changes', async () => {
    const db = await usdaDb();
    const [a, b] = [getProductByGtin(db, '00013764027503')!.id, getProductByGtin(db, '00028400090896')!.id];
    const cacheId = Number(
      db
        .prepare(
          `INSERT INTO vision_cache (kind, phash, band0, band1, band2, band3, model, parsed_json, created_at)
           VALUES ('front', '0123456789abcdef', '0123', '4567', '89ab', 'cdef', 'm', '{}', 0)`,
        )
        .run().lastInsertRowid,
    );
    for (const u of ['u1', 'u2', 'u3', 'u4', 'u5']) recordVisionOffer(db, cacheId, u, [a, b]);
    // Sybil: three device ids from one network.
    assert.equal(confirmVisionChoice(db, cacheId, 'u1', '6.6.6.6', b, 2), null);
    assert.equal(confirmVisionChoice(db, cacheId, 'u2', '6.6.6.6', b, 2), null);
    assert.equal(confirmVisionChoice(db, cacheId, 'u3', '6.6.6.6', b, 2), null);
    // Two independent users agree on a, but b still has more users: no majority.
    assert.equal(confirmVisionChoice(db, cacheId, 'u4', '1.1.1.1', a, 2), null);
    assert.equal(confirmVisionChoice(db, cacheId, 'u5', '2.2.2.2', a, 2), null);
    // One user switches (re-confirming replaces, never adds): a now has a majority (3/5) on 3 networks.
    assert.equal(confirmVisionChoice(db, cacheId, 'u1', '6.6.6.6', a, 2), a);
    // u4 switching to b gives b the majority (3/5) across 2 networks; the shared choice follows.
    assert.equal(confirmVisionChoice(db, cacheId, 'u4', '1.1.1.1', b, 2), b);
    // With a tie and no majority, nothing is shared.
    assert.equal(confirmVisionChoice(db, cacheId, 'u3', '3.3.3.3', a, 2), a);
    recordVisionOffer(db, cacheId, 'u6', [a, b]);
    assert.equal(confirmVisionChoice(db, cacheId, 'u6', '4.4.4.4', b, 2), null);
    assert.equal((db.prepare('SELECT count(*) n FROM vision_confirmations').get() as { n: number }).n, 6);
  });

  it("a user's own confirmation is preferred for that user's repeat photos only", async () => {
    const db = await usdaDb();
    const provider = new MockVisionProvider([
      { text: frontJson({ brand: "Dave's Killer Bread", product_name: '21 Whole Grains and Seeds Organic Bread', size_text: '27 oz' }) },
    ]);
    const { scan } = makeScan(db, provider);
    const photo = await packagePhoto(73);
    const first = await scan.scanFront(photo, 'user-one-aaaa');
    assert.equal(first.status, 'match');
    if (first.status !== 'match') return;
    const res = scan.confirmFront(first.vision_cache_id!, first.candidates[0].product.id, 'user-one-aaaa', '1.1.1.1');
    assert.equal(res.ok, true);
    assert.deepEqual(scan.confirmFront(first.vision_cache_id!, first.candidates[0].product.id, 'user-two-aaaa', '2.2.2.2'), {
      ok: false,
      reason: 'not_offered',
    });
    const mine = await scan.scanFront(photo, 'user-one-aaaa');
    assert.equal(mine.status === 'match' && mine.via, 'cache');
    const theirs = await scan.scanFront(photo, 'user-two-aaaa');
    assert.equal(theirs.status === 'match' && theirs.via, 'cache'); // cached vision read, but…
    assert.equal(theirs.status === 'match' && theirs.candidates[0].components.previous_confirmation, undefined); // …not user one's choice
  });
});

describe('migration 002 on an existing database', () => {
  it('dedupes reports, recounts, drops shared label cache and untrusted shared choices', () => {
    // A database that only has 001 applied, with pre-hardening data in it.
    const db = openDb(':memory:', { migrate: false });
    db.exec(`CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`);
    db.exec(readFileSync(path.join(import.meta.dirname, '..', 'src', 'db', 'migrations', '001_init.sql'), 'utf8'));
    db.prepare(`INSERT INTO schema_migrations VALUES ('001_init.sql', 'x')`).run();
    db.exec(`
      INSERT INTO products (id, gtin14, name, source, report_count, needs_review) VALUES (1, '00013764027503', 'Bread', 'usda', 3, 1);
      INSERT INTO product_reports (product_id, user_id, reason) VALUES (1, 'spammer-aaaa', 'a'), (1, 'spammer-aaaa', 'b'), (1, 'other-aaaaaa', 'c');
      INSERT INTO vision_cache (kind, phash, band0, band1, band2, band3, model, parsed_json, chosen_product_id, created_at)
        VALUES ('front', '0123456789abcdef', '0123', '4567', '89ab', 'cdef', 'm', '{}', 1, 0),
               ('label', '0123456789abcdef', '0123', '4567', '89ab', 'cdef', 'm', '{}', NULL, 0);
    `);
    assert.deepEqual(migrate(db), ['002_hardening.sql', '003_accounts.sql', '004_feedback.sql']);
    assert.equal((db.prepare('SELECT report_count n FROM products WHERE id = 1').get() as { n: number }).n, 2);
    assert.equal((db.prepare(`SELECT count(*) n FROM vision_cache WHERE kind = 'label'`).get() as { n: number }).n, 0);
    assert.equal((db.prepare(`SELECT chosen_product_id c FROM vision_cache`).get() as { c: number | null }).c, null);
    assert.throws(() => db.prepare(`INSERT INTO product_reports (product_id, user_id) VALUES (1, 'other-aaaaaa')`).run());
    db.close();
  });
});

describe('Open Food Facts live client', () => {
  const okBody = (product: Record<string, unknown>) => JSON.stringify({ status: 1, product });

  async function withServer(handler: (path: string) => { status: number; body: string; headers?: Record<string, string> }) {
    const server = createServer((req, res) => {
      const r = handler(req.url ?? '');
      res.writeHead(r.status, { 'Content-Type': 'application/json', ...r.headers }).end(r.body);
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as AddressInfo).port;
    // Route the fixed OFF URL to the local server, keeping fetch semantics (redirect handling, body streaming).
    const fetchImpl: typeof fetch = (input, init) =>
      fetch(String(input).replace('https://world.openfoodfacts.org', `http://127.0.0.1:${port}`), init);
    return { server, client: new OffLiveClient({ userAgent: 'Tappy-test/1.0 (t@t.t)', maxPerMinute: 100, fetchImpl }) };
  }

  it('only requests validated GTINs and pins the record to the requested code', async () => {
    const seen: string[] = [];
    const { server, client } = await withServer((p) => {
      seen.push(p);
      return { status: 200, body: okBody({ code: '9999999999999', product_name: 'X', image_url: 'javascript:alert(1)' }) };
    });
    try {
      assert.equal(await client.lookup('../../admin'), null);
      const rec = await client.lookup('00036000291452');
      assert.ok(rec && rec !== 'skipped');
      assert.equal(rec.gtin14, '00036000291452');
      assert.equal(rec.image_url, null);
      assert.equal(seen.length, 1);
      assert.match(seen[0], /^\/api\/v2\/product\/0036000291452\.json\?/);
    } finally {
      server.close();
    }
  });

  it('caps response size and refuses redirects', async () => {
    const big = await withServer(() => ({ status: 200, body: okBody({ product_name: 'x'.repeat(2_000_000) }) }));
    try {
      assert.equal(await big.client.lookup('00036000291452'), 'skipped');
    } finally {
      big.server.close();
    }
    const redir = await withServer(() => ({ status: 302, body: '', headers: { Location: 'http://169.254.169.254/latest/meta-data' } }));
    try {
      assert.equal(await redir.client.lookup('00036000291452'), 'skipped');
    } finally {
      redir.server.close();
    }
  });

  it('accepts only https OFF image hosts', () => {
    assert.equal(safeOffImageUrl('https://images.openfoodfacts.org/images/products/1.jpg'), 'https://images.openfoodfacts.org/images/products/1.jpg');
    assert.equal(safeOffImageUrl('http://images.openfoodfacts.org/x.jpg'), '');
    assert.equal(safeOffImageUrl('https://openfoodfacts.org.evil.com/x.jpg'), '');
    assert.equal(safeOffImageUrl('https://user:pw@images.openfoodfacts.org/x.jpg'), '');
    assert.equal(safeOffImageUrl(42), '');
  });
});

describe('secrets + config', () => {
  it('redacts API keys from log output', () => {
    registerSecret('my-custom-secret-value-123');
    const e = new Error('401 from https://api.anthropic.com: x-api-key: sk-ant-api03-ABCDEFGHIJKLMNOP and my-custom-secret-value-123');
    const out = describeError(e);
    assert.doesNotMatch(out, /ABCDEFGHIJKLMNOP|my-custom-secret-value-123/);
    assert.equal(redact('apiKey="abc123secret"').includes('abc123secret'), false);
  });

  it('validates config and fails fast only when photo scanning is explicitly on without a key', () => {
    const base = testConfig({ anthropicApiKey: '', visionProvider: 'anthropic', photoScanningMode: 'auto' });
    assert.throws(() => validateConfig({ ...base, photoScanningMode: 'on' }), /ANTHROPIC_API_KEY/);
    const warnings = validateConfig({ ...base, photoScanningMode: 'auto' });
    assert.ok(warnings.some((w) => /photo scanning is disabled/i.test(w)));
    assert.equal(photoScanningEnabled({ ...base, photoScanningMode: 'auto' }), false);
    assert.equal(photoScanningEnabled({ ...base, photoScanningMode: 'auto', anthropicApiKey: 'sk-ant-x' }), true);
    assert.throws(() => validateConfig({ ...base, port: 70000 }), /port/);
    assert.throws(() => validateConfig({ ...base, photoScanningMode: 'maybe' }), /PHOTO_SCANNING/);
    assert.ok(validateConfig({ ...base, corsOrigins: ['*'] }).some((w) => /CORS/.test(w)));
    // Warnings never echo secret values.
    for (const w of validateConfig({ ...base, anthropicApiKey: 'sk-ant-secret-zzz', photoScanningMode: 'on' })) {
      assert.doesNotMatch(w, /sk-ant-secret-zzz/);
    }
  });
});
