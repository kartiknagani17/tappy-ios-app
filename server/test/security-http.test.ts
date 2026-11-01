import assert from 'node:assert/strict';
import { createServer, request, type Server } from 'node:http';
import { connect, type AddressInfo } from 'node:net';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/http/app.ts';
import { dirSource, importUsda } from '../src/import/usda.ts';
import { getProductByGtin } from '../src/services/products.ts';
import type { Config } from '../src/config.ts';
import type { DB } from '../src/db/index.ts';
import { FIXTURES, frontJson, makeScan, MockVisionProvider, packagePhoto, testConfig, testDb } from './helpers.ts';

type Started = { base: string; server: Server; provider: MockVisionProvider; db: DB; config: Config };

async function start(overrides: Partial<Config> = {}, db?: DB): Promise<Started> {
  const database = db ?? testDb();
  if (!db) await importUsda(database, dirSource(path.join(FIXTURES, 'usda')), () => {});
  const config = testConfig({ rateLimitPerMinute: 1000, dailyFreeScans: 1000, dailyFreePhotoScans: 1000, ...overrides });
  const provider = new MockVisionProvider();
  const { scan } = makeScan(database, provider, config);
  const server = createServer(createApp({ db: database, config, scan }));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server, provider, db: database, config };
}

const post = (base: string, p: string, body: unknown, user = 'device-sec-1', headers: Record<string, string> = {}) =>
  fetch(base + p, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Tappy-User': user, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

/** Raw HTTP/1.1 exchange for requests fetch() refuses to send. */
function raw(base: string, text: string): Promise<string> {
  const { port } = new URL(base);
  return new Promise((resolve, reject) => {
    const s = connect(Number(port), '127.0.0.1', () => s.write(text));
    let out = '';
    s.on('data', (d) => (out += d.toString()));
    s.on('end', () => resolve(out));
    s.on('error', reject);
    s.setTimeout(3000, () => s.destroy(new Error('raw request timed out')));
  });
}

describe('HTTP hardening: headers, CORS, routing, bodies', () => {
  let s: Started;
  before(async () => {
    s = await start({ corsOrigins: ['https://tappy.example'] });
  });
  after(() => s.server.close());

  it('sets security headers and no-store on every response, including errors', async () => {
    for (const res of [await fetch(`${s.base}/api/health`), await fetch(`${s.base}/nope`)]) {
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(res.headers.get('cache-control'), 'no-store');
      assert.equal(res.headers.get('x-frame-options'), 'DENY');
      assert.match(res.headers.get('content-security-policy') ?? '', /default-src 'none'/);
      assert.match(res.headers.get('content-type') ?? '', /^application\/json/);
    }
  });

  it('health reports ok and photo-scanning availability', async () => {
    const res = await fetch(`${s.base}/api/health`);
    assert.deepEqual(await res.json(), { ok: true, photo_scanning: true, password_reset: false });
  });

  it('CORS: no wildcard; only configured origins are echoed', async () => {
    const evil = await fetch(`${s.base}/api/health`, { headers: { Origin: 'https://evil.example' } });
    assert.equal(evil.headers.get('access-control-allow-origin'), null);
    const ok = await fetch(`${s.base}/api/health`, { headers: { Origin: 'https://tappy.example' } });
    assert.equal(ok.headers.get('access-control-allow-origin'), 'https://tappy.example');
    assert.equal(ok.headers.get('vary'), 'Origin');
    const pre = await fetch(`${s.base}/api/scan/barcode`, { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } });
    assert.equal(pre.status, 204);
    assert.equal(pre.headers.get('access-control-allow-origin'), null);
  });

  it('unknown paths are 404, wrong methods are 405 with Allow', async () => {
    assert.equal((await fetch(`${s.base}/`)).status, 404);
    assert.equal((await fetch(`${s.base}/api/scan/barcodes`, { method: 'POST' })).status, 404);
    const get = await fetch(`${s.base}/api/scan/barcode`);
    assert.equal(get.status, 405);
    assert.match(get.headers.get('allow') ?? '', /POST/);
    const del = await fetch(`${s.base}/api/products/1`, { method: 'DELETE' });
    assert.equal(del.status, 405);
    // Absurd ids don't reach SQLite as floats.
    assert.equal((await fetch(`${s.base}/api/products/99999999999999999999999`)).status, 404);
  });

  it('non-JSON content types are rejected with 415 (no text/plain "simple" requests)', async () => {
    const res = await fetch(`${s.base}/api/scan/barcode`, {
      method: 'POST',
      headers: { 'X-Tappy-User': 'device-sec-ct', 'Content-Type': 'text/plain' },
      body: JSON.stringify({ barcode: '013764027503' }),
    });
    assert.equal(res.status, 415);
  });

  it('JSON bodies over 16KB are rejected on non-image endpoints', async () => {
    const res = await post(s.base, '/api/scan/barcode', { barcode: '013764027503', pad: 'x'.repeat(20_000) });
    assert.equal(res.status, 413);
    assert.equal(((await res.json()) as { error: string }).error, 'too_large');
  });

  it('a lying/absent Content-Length still hits the streaming body cap', async () => {
    const big = JSON.stringify({ barcode: '1', pad: 'x'.repeat(40_000) });
    const out = await raw(
      s.base,
      `POST /api/scan/barcode HTTP/1.1\r\nHost: x\r\nX-Tappy-User: device-sec-chunk\r\nContent-Type: application/json\r\n` +
        `Transfer-Encoding: chunked\r\n\r\n${big.length.toString(16)}\r\n${big}\r\n0\r\n\r\n`,
    );
    assert.match(out, /^HTTP\/1\.1 413/);
  });

  it('rejects null / array / primitive JSON bodies', async () => {
    for (const body of ['null', '[]', '42', '"x"', '{"a":']) {
      const res = await post(s.base, '/api/scan/barcode', body);
      assert.equal(res.status, 400, body);
      assert.equal(((await res.json()) as { error: string }).error, 'bad_json');
    }
  });

  it('prototype-pollution keys are dropped and never affect Object.prototype', async () => {
    const res = await post(s.base, '/api/scan/barcode', '{"barcode":"013764027503","__proto__":{"polluted":1},"constructor":{"prototype":{"x":1}}}');
    assert.equal(res.status, 200);
    assert.equal(({} as Record<string, unknown>).polluted, undefined);
  });

  it('malformed request targets get a 4xx, never crash the process', async () => {
    const out = await raw(s.base, 'GET http://[ HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n');
    assert.match(out, /^HTTP\/1\.1 (400|404)/);
    assert.equal((await fetch(`${s.base}/api/health`)).status, 200);
  });

  it('error responses never include stack traces', async () => {
    const res = await post(s.base, '/api/scan/front', { image_base64: Buffer.from('not an image').toString('base64') });
    assert.equal(res.status, 400);
    const text = await res.text();
    assert.doesNotMatch(text, /sharp|\bat \S+:\d+|\.ts\b|vips/);
  });
});

describe('HTTP hardening: input edge cases', () => {
  let s: Started;
  before(async () => {
    s = await start();
  });
  after(() => s.server.close());

  const barcode = async (b: unknown) => {
    const res = await post(s.base, '/api/scan/barcode', { barcode: b }, 'device-edge-1');
    return { status: res.status, body: (await res.json()) as { status?: string; reason?: string; error?: string } };
  };

  it('accepts whitespace, dashes and full-width digits in barcodes', async () => {
    assert.equal((await barcode(' 0-13764-02750-3 ')).body.status, 'found');
    assert.equal((await barcode('０１３７６４０２７５０３')).body.status, 'found');
    assert.equal((await barcode('0013764027503')).body.status, 'found'); // EAN-13 with leading zero
  });

  it('numbers as JSON are accepted when safe; junk types are 400', async () => {
    assert.equal((await barcode(13764027503)).body.status, 'found'); // numeric UPC: lost leading zeros are re-padded to GTIN-14
    assert.equal((await barcode(1e300)).status, 400);
    assert.equal((await barcode(-5)).status, 400);
    assert.equal((await barcode(null)).status, 400);
    assert.equal((await barcode({ $gt: '' })).status, 400);
    assert.equal((await barcode(['013764027503'])).status, 400);
    assert.equal((await barcode('')).status, 400);
  });

  it('long and SQL-ish barcodes are rejected without errors', async () => {
    assert.equal((await barcode('1'.repeat(65))).status, 400);
    assert.equal((await barcode("013764027503' OR 1=1 --")).body.status, 'invalid_barcode');
    assert.equal((await barcode('😀😀😀')).body.status, 'invalid_barcode');
  });

  it('validates base64 strictly and caps image size before decoding', async () => {
    const bad = await post(s.base, '/api/scan/front', { image_base64: '!!!not*base64***' }, 'device-edge-2');
    assert.equal(bad.status, 400);
    const huge = await post(s.base, '/api/scan/front', { image_base64: 'A'.repeat(s.config.visionMaxImageBytes * 2) }, 'device-edge-2');
    assert.equal(huge.status, 413);
    const notString = await post(s.base, '/api/scan/front', { image_base64: 12345 }, 'device-edge-2');
    assert.equal(notString.status, 400);
    // Data-URL prefixes for real image types are accepted.
    s.provider.push({ text: frontJson({ is_food_package: false }) });
    const img = (await packagePhoto(31)).toString('base64');
    const ok = await post(s.base, '/api/scan/front', { image_base64: `data:image/jpeg;base64,${img}` }, 'device-edge-2');
    assert.equal(ok.status, 200);
  });

  it('a non-image upload is 400 and does not consume photo quota', async () => {
    const before = s.db.prepare(`SELECT coalesce(sum(photo_scans),0) n FROM usage_daily WHERE user_id = 'device-edge-3'`).get() as { n: number };
    const res = await post(s.base, '/api/scan/front', { image_base64: 'abc' }, 'device-edge-3');
    assert.equal(res.status, 400);
    const after = s.db.prepare(`SELECT coalesce(sum(photo_scans),0) n FROM usage_daily WHERE user_id = 'device-edge-3'`).get() as { n: number };
    assert.equal(after.n, before.n);
  });

  it('rejects malformed X-Tappy-User values', async () => {
    for (const u of ['short', 'x'.repeat(65), 'bad id with spaces', '../../etc/passwd', 'ip:1.2.3.4-aaaa']) {
      const res = await fetch(`${s.base}/api/scan/barcode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Tappy-User': u },
        body: '{"barcode":"013764027503"}',
      });
      assert.equal(res.status, 400, u);
    }
  });

  it('concurrent duplicate barcode scans all succeed and are each counted once', async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => post(s.base, '/api/scan/barcode', { barcode: '013764027503' }, 'device-concurrent')));
    assert.deepEqual(new Set(results.map((r) => r.status)), new Set([200]));
    const row = s.db.prepare(`SELECT scans FROM usage_daily WHERE user_id = 'device-concurrent'`).get() as { scans: number };
    assert.equal(row.scans, 10);
  });
});

describe('HTTP hardening: abuse limits', () => {
  it('X-Forwarded-For is ignored unless TRUST_PROXY is set (spoofing cannot dodge the IP limit)', async () => {
    const s = await start({ rateLimitPerMinute: 2 }); // IP limit = 8/min
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 10; i++) {
        const res = await post(s.base, '/api/scan/barcode', { barcode: '013764027503' }, `device-xff-${i}-aaaa`, {
          'X-Forwarded-For': `10.0.0.${i}`,
        });
        statuses.push(res.status);
      }
      assert.equal(statuses.filter((x) => x === 429).length, 2);
    } finally {
      s.server.close();
    }
  });

  it('with TRUST_PROXY=1 the proxy-appended (rightmost) address is used, not a client-supplied one', async () => {
    const s = await start({ rateLimitPerMinute: 1, trustProxyHops: 1 }); // IP limit = 4/min
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 6; i++) {
        // Client forges a different leftmost entry each time; the proxy appends the real address.
        const res = await post(s.base, '/api/scan/barcode', { barcode: '013764027503' }, `device-proxy-${i}-aaaa`, {
          'X-Forwarded-For': `6.6.6.${i}, 203.0.113.7`,
        });
        statuses.push(res.status);
      }
      assert.deepEqual(statuses, [200, 200, 200, 200, 429, 429]);
      // A different real client behind the same proxy has its own bucket.
      const other = await post(s.base, '/api/scan/barcode', { barcode: '013764027503' }, 'device-proxy-x-aaaa', {
        'X-Forwarded-For': '198.51.100.9',
      });
      assert.equal(other.status, 200);
    } finally {
      s.server.close();
    }
  });

  it('per-IP daily photo cap stops minting device ids to bypass the per-user quota', async () => {
    const s = await start({ dailyFreePhotoScans: 1, ipDailyPhotoScans: 3 });
    try {
      const img = (await packagePhoto(41)).toString('base64');
      s.provider.push({ text: frontJson({ is_food_package: false }) });
      const statuses: number[] = [];
      for (let i = 0; i < 5; i++) statuses.push((await post(s.base, '/api/scan/front', { image_base64: img }, `device-mint-${i}-aaaa`)).status);
      assert.deepEqual(statuses, [200, 200, 200, 429, 429]);
      // The per-user counter for the rejected device was not incremented (all-or-nothing).
      const row = s.db.prepare(`SELECT photo_scans FROM usage_daily WHERE user_id = 'device-mint-4-aaaa'`).get();
      assert.equal(row, undefined);
    } finally {
      s.server.close();
    }
  });

  it('photo endpoints return 503 without consuming quota when photo scanning is off', async () => {
    const s = await start({ photoScanningMode: 'off' });
    try {
      const img = (await packagePhoto(42)).toString('base64');
      const res = await post(s.base, '/api/scan/front', { image_base64: img }, 'device-off-1');
      assert.equal(res.status, 503);
      assert.equal(((await res.json()) as { error: string }).error, 'photo_scanning_disabled');
      assert.equal(s.provider.calls.length, 0);
      assert.deepEqual(await (await fetch(`${s.base}/api/health`)).json(), { ok: true, photo_scanning: false, password_reset: false });
      assert.equal((await post(s.base, '/api/scan/barcode', { barcode: '013764027503' }, 'device-off-1')).status, 200);
    } finally {
      s.server.close();
    }
  });

  it('one report per user per product; reasons are sanitized', async () => {
    const s = await start();
    try {
      const p = getProductByGtin(s.db, '00013764027503')!;
      const r1 = await post(s.base, `/api/products/${p.id}/report`, { reason: '  bad\u0000‮data\n\n' + 'x'.repeat(2000) }, 'device-rep-1');
      assert.equal(r1.status, 200);
      for (let i = 0; i < 5; i++) {
        const again = await post(s.base, `/api/products/${p.id}/report`, { reason: 'spam' }, 'device-rep-1');
        assert.equal(((await again.json()) as { already_reported: boolean }).already_reported, true);
      }
      assert.equal(getProductByGtin(s.db, '00013764027503')!.report_count, 1);
      const row = s.db.prepare('SELECT reason FROM product_reports').get() as { reason: string };
      assert.ok(row.reason.startsWith('bad data x'));
      assert.ok(row.reason.length <= 500);
      assert.doesNotMatch(row.reason, /[\u0000-\u001F‮]/);
      await post(s.base, `/api/products/${p.id}/report`, { reason: 42 }, 'device-rep-2');
      assert.equal(getProductByGtin(s.db, '00013764027503')!.report_count, 2);
    } finally {
      s.server.close();
    }
  });
});

describe('HTTP hardening: /front/confirm cannot poison the shared cache', () => {
  it('only offered products are accepted; a lone confirmation affects only that user', async () => {
    const s = await start({ visionConfirmConsensus: 2 });
    try {
      s.provider.push({
        text: frontJson({ brand: "Dave's Killer Bread", product_name: '21 Whole Grains and Seeds Organic Bread', size_text: '27 oz' }),
      });
      const img = (await packagePhoto(51)).toString('base64');
      const scanAs = async (user: string) =>
        (await (await post(s.base, '/api/scan/front', { image_base64: img }, user)).json()) as {
          status: string;
          vision_cache_id: number;
          candidates: { product: { id: number } }[];
          via: string;
          preselected_product_id: number | null;
        };
      const first = await scanAs('device-victim-1');
      assert.equal(first.status, 'match');
      const offered = first.candidates[0].product.id;
      const other = getProductByGtin(s.db, '00028400090896')!.id; // not offered for this photo
      assert.notEqual(offered, other);

      // An attacker who never scanned this photo can't confirm anything for it.
      const forged = await post(s.base, '/api/scan/front/confirm', { vision_cache_id: first.vision_cache_id, product_id: other }, 'device-attacker');
      assert.equal(forged.status, 400);
      assert.equal(((await forged.json()) as { error: string }).error, 'product_not_offered');

      // Even after scanning it, a product outside the offered candidates is refused.
      await scanAs('device-attacker');
      const notOffered = await post(s.base, '/api/scan/front/confirm', { vision_cache_id: first.vision_cache_id, product_id: other }, 'device-attacker');
      assert.equal(notOffered.status, 400);
      // Type confusion is rejected.
      assert.equal((await post(s.base, '/api/scan/front/confirm', { vision_cache_id: '1', product_id: offered }, 'device-attacker')).status, 400);

      // A legit confirmation by one user only changes that user's repeat scans.
      const ok = await post(s.base, '/api/scan/front/confirm', { vision_cache_id: first.vision_cache_id, product_id: offered }, 'device-attacker');
      assert.equal(ok.status, 200);
      const chosen = s.db.prepare('SELECT chosen_product_id c FROM vision_cache WHERE id = ?').get(first.vision_cache_id) as { c: number | null };
      assert.equal(chosen.c, null, 'one confirmation must not set the shared choice');
      assert.equal(s.provider.calls.length, 1, 'repeat scans hit the cache');
    } finally {
      s.server.close();
    }
  });

  it('vision_cache_id null just echoes the product without side effects', async () => {
    const s = await start();
    try {
      const p = getProductByGtin(s.db, '00013764027503')!;
      const res = await post(s.base, '/api/scan/front/confirm', { vision_cache_id: null, product_id: p.id }, 'device-null-1');
      assert.equal(res.status, 200);
      assert.equal((await post(s.base, '/api/scan/front/confirm', { vision_cache_id: null, product_id: 999999 }, 'device-null-1')).status, 404);
      assert.equal((s.db.prepare('SELECT count(*) n FROM vision_confirmations').get() as { n: number }).n, 0);
    } finally {
      s.server.close();
    }
  });
});

describe('HTTP hardening: product GET is rate-limited per IP', () => {
  it('429s after the IP budget', async () => {
    const s = await start({ rateLimitPerMinute: 1 }); // IP limit = 4/min
    try {
      const codes: number[] = [];
      for (let i = 0; i < 6; i++) codes.push((await fetch(`${s.base}/api/products/1`)).status);
      assert.deepEqual(codes.slice(4), [429, 429]);
      assert.equal((await fetch(`${s.base}/api/health`)).status, 200, 'health is never rate-limited');
    } finally {
      s.server.close();
    }
  });
});

// keep `request` import used for HEAD check
describe('HTTP hardening: HEAD', () => {
  it('HEAD /api/health returns 200 without a body', async () => {
    const s = await start();
    try {
      const { port } = new URL(s.base);
      const status = await new Promise<number>((resolve, reject) => {
        const req = request({ host: '127.0.0.1', port, path: '/api/health', method: 'HEAD' }, (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        });
        req.on('error', reject);
        req.end();
      });
      assert.equal(status, 200);
    } finally {
      s.server.close();
    }
  });
});
