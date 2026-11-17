import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/http/app.ts';
import { dirSource, importUsda } from '../src/import/usda.ts';
import { ImageCache, imageKey, publicImageUrl, setImageBase } from '../src/services/images.ts';
import { getProductByGtin, toPublicProduct } from '../src/services/products.ts';
import { FIXTURES, makeScan, MockVisionProvider, testConfig, testDb } from './helpers.ts';

const SRC = 'https://images.openfoodfacts.org/images/products/005/150/025/5162/front_en.197.400.jpg';
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(500, 7)]);

/** A fake OFF image server that counts requests. */
function fakeFetch(body: Buffer = JPEG, type = 'image/jpeg', status = 200, delayMs = 20) {
  const calls: string[] = [];
  const fn = (async (url: string | URL | Request) => {
    calls.push(String(url));
    await new Promise((r) => setTimeout(r, delayMs));
    return new Response(new Uint8Array(body), { status, headers: { 'Content-Type': type } });
  }) as typeof fetch;
  return { fn, calls };
}

describe('photo cache', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'tappy-img-'));
  after(() => rmSync(dir, { recursive: true, force: true }));

  it('public URLs point at our address only when PUBLIC_URL is set, and only for OFF photos', () => {
    setImageBase('');
    assert.equal(publicImageUrl(5, SRC), SRC);
    setImageBase('https://api.tappy.company/');
    assert.equal(publicImageUrl(5, SRC), `https://api.tappy.company/img/5-${imageKey(SRC)}.jpg`);
    assert.equal(publicImageUrl(5, 'https://evil.example/x.jpg'), 'https://evil.example/x.jpg');
    assert.equal(publicImageUrl(5, null), null);
    setImageBase('');
  });

  it('downloads once, shares concurrent requests, then serves from disk', async () => {
    const f = fakeFetch();
    const cache = new ImageCache(dir, { userAgent: 'test', fetchFn: f.fn });
    const [a, b] = await Promise.all([cache.get(1, SRC), cache.get(1, SRC)]);
    assert.deepEqual(a, JPEG);
    assert.deepEqual(b, JPEG);
    assert.equal(f.calls.length, 1);
    assert.ok(existsSync(cache.fileFor(1, SRC)));
    const again = new ImageCache(dir, { userAgent: 'test', fetchFn: f.fn });
    assert.deepEqual(await again.get(1, SRC), JPEG);
    assert.equal(f.calls.length, 1, 'second read comes from disk');
  });

  it('rejects non-images, non-OFF hosts and errors, and does not retry a failure right away', async () => {
    const html = fakeFetch(Buffer.from('<html>'), 'text/html');
    const c1 = new ImageCache(dir, { userAgent: 'test', fetchFn: html.fn });
    assert.equal(await c1.get(2, SRC), null);
    assert.equal(await c1.get(2, SRC), null);
    assert.equal(html.calls.length, 1, 'failure remembered');
    assert.equal(existsSync(c1.fileFor(2, SRC)), false);

    const fake = fakeFetch(Buffer.from('not a jpeg but says so'), 'image/jpeg');
    assert.equal(await new ImageCache(dir, { userAgent: 'test', fetchFn: fake.fn }).get(3, SRC), null);

    const missing = fakeFetch(JPEG, 'image/jpeg', 404);
    assert.equal(await new ImageCache(dir, { userAgent: 'test', fetchFn: missing.fn }).get(4, SRC), null);

    const any = fakeFetch();
    assert.equal(await new ImageCache(dir, { userAgent: 'test', fetchFn: any.fn }).get(5, 'https://evil.example/x.jpg'), null);
    assert.equal(any.calls.length, 0);
  });

  it('limits downloads running at once', async () => {
    let active = 0;
    let peak = 0;
    const fn = (async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 15));
      active--;
      return new Response(new Uint8Array(JPEG), { headers: { 'Content-Type': 'image/jpeg' } });
    }) as typeof fetch;
    const cache = new ImageCache(mkdtempSync(path.join(dir, 'c-')), { userAgent: 'test', fetchFn: fn, concurrency: 3 });
    await Promise.all(Array.from({ length: 10 }, (_, i) => cache.get(100 + i, SRC)));
    assert.equal(peak, 3);
  });
});

describe('GET /img/…', () => {
  let server: Server;
  let base: string;
  const dir = mkdtempSync(path.join(tmpdir(), 'tappy-img-http-'));
  const db = testDb();
  const config = testConfig({ rateLimitPerMinute: 100 });
  const f = fakeFetch();
  let id = 0;

  before(async () => {
    await importUsda(db, dirSource(path.join(FIXTURES, 'usda')), () => {});
    id = getProductByGtin(db, '00013764027503')!.id;
    db.prepare('UPDATE products SET image_url = ? WHERE id = ?').run(SRC, id);
    setImageBase('https://api.tappy.company');
    const { scan } = makeScan(db, new MockVisionProvider(), config);
    const images = new ImageCache(dir, { userAgent: 'test', fetchFn: f.fn });
    server = createServer(createApp({ db, config, scan, images }));
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(() => {
    server.close();
    setImageBase('');
    rmSync(dir, { recursive: true, force: true });
  });

  it('serves the product photo with a long cache header', async () => {
    const url = toPublicProduct(getProductByGtin(db, '00013764027503')!).image_url!;
    assert.ok(url.startsWith('https://api.tappy.company/img/'));
    const res = await fetch(base + new URL(url).pathname);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/jpeg');
    assert.match(res.headers.get('cache-control')!, /max-age=31536000/);
    assert.deepEqual(Buffer.from(await res.arrayBuffer()), JPEG);
    // No X-Tappy-User needed, and the second request doesn't go to OFF again.
    assert.equal((await fetch(base + new URL(url).pathname)).status, 200);
    assert.equal(f.calls.length, 1);
  });

  it('404s for a wrong hash, unknown product or product without a photo, without caching the error', async () => {
    const wrong = await fetch(`${base}/img/${id}-000000000000.jpg`);
    assert.equal(wrong.status, 404);
    assert.equal(wrong.headers.get('cache-control'), 'no-store');
    assert.equal((await fetch(`${base}/img/99999999-${imageKey(SRC)}.jpg`)).status, 404);
    assert.equal((await fetch(`${base}/img/abc-${imageKey(SRC)}.jpg`)).status, 404);
    assert.equal(f.calls.length, 1);
  });
});
