import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/http/app.ts';
import { dirSource, importUsda } from '../src/import/usda.ts';
import { getProductByGtin } from '../src/services/products.ts';
import { FIXTURES, makeScan, MockVisionProvider, packagePhoto, testConfig, testDb } from './helpers.ts';

describe('HTTP API', () => {
  let server: Server;
  let base: string;
  const db = testDb();
  const config = testConfig({ dailyFreeScans: 5, dailyFreePhotoScans: 1, rateLimitPerMinute: 100 });

  before(async () => {
    await importUsda(db, dirSource(path.join(FIXTURES, 'usda')), () => {});
    const { scan } = makeScan(db, new MockVisionProvider(), config);
    server = createServer(createApp({ db, config, scan }));
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(() => server.close());

  const post = (p: string, body: unknown, user = 'device-test-1') =>
    fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Tapi-User': user }, body: JSON.stringify(body) });

  it('POST /api/scan/barcode resolves a product', async () => {
    const res = await post('/api/scan/barcode', { barcode: '013764027503' });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { status: string; product: { name: string; source: string; source_updated_at: string } };
    assert.equal(body.status, 'found');
    assert.equal(body.product.source, 'usda');
    assert.ok(body.product.source_updated_at);
  });

  it('unknown barcode returns needs_label_photo with 200', async () => {
    const res = await post('/api/scan/barcode', { barcode: '036000291452' });
    assert.equal(res.status, 200);
    assert.equal(((await res.json()) as { status: string }).status, 'needs_label_photo');
  });

  it('requires the anonymous user header', async () => {
    const res = await fetch(base + '/api/scan/barcode', { method: 'POST', body: '{}' });
    assert.equal(res.status, 400);
  });

  it('rejects bad JSON and missing images', async () => {
    const bad = await fetch(base + '/api/scan/barcode', {
      method: 'POST',
      headers: { 'X-Tapi-User': 'device-test-2', 'Content-Type': 'application/json' },
      body: 'nope',
    });
    assert.equal(bad.status, 400);
    const noImg = await post('/api/scan/front', {}, 'device-test-2');
    assert.equal(noImg.status, 400);
  });

  it('enforces the per-user daily photo limit with 429 + Retry-After', async () => {
    const user = 'device-limit-1';
    const provider = new MockVisionProvider();
    void provider;
    const img = (await packagePhoto(9)).toString('base64');
    // First photo is allowed (vision mock has no response queued -> vision_unavailable, still counted).
    const first = await post('/api/scan/front', { image_base64: img }, user);
    assert.equal(first.status, 200);
    const second = await post('/api/scan/front', { image_base64: img }, user);
    assert.equal(second.status, 429);
    assert.equal(((await second.json()) as { error: string }).error, 'daily_limit_reached');
    assert.ok(Number(second.headers.get('retry-after')) > 0);
  });

  it('POST /api/products/:id/report flags the product for review', async () => {
    const p = getProductByGtin(db, '00013764027503')!;
    const res = await post(`/api/products/${p.id}/report`, { reason: 'Ingredients changed' });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { product: { under_review: boolean } };
    assert.equal(body.product.under_review, true);
    assert.equal(getProductByGtin(db, '00013764027503')!.report_count, 1);
    assert.equal((await post('/api/products/999999/report', {})).status, 404);
  });

  it('rate-limits bursts per user', async () => {
    const tight = testConfig({ rateLimitPerMinute: 2, dailyFreeScans: 100 });
    const { scan } = makeScan(db, new MockVisionProvider(), tight);
    const s = createServer(createApp({ db, config: tight, scan }));
    await new Promise<void>((r) => s.listen(0, r));
    const url = `http://127.0.0.1:${(s.address() as AddressInfo).port}/api/scan/barcode`;
    const hit = () =>
      fetch(url, {
        method: 'POST',
        headers: { 'X-Tapi-User': 'device-burst-1', 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcode: '013764027503' }),
      });
    assert.equal((await hit()).status, 200);
    assert.equal((await hit()).status, 200);
    const third = await hit();
    assert.equal(third.status, 429);
    assert.equal(((await third.json()) as { error: string }).error, 'rate_limited');
    s.close();
  });
});

describe('clientIp() behind Cloudflare Tunnel', async () => {
  const { clientIp } = await import('../src/http/app.ts');
  const req = (headers: Record<string, string>) =>
    ({ headers, socket: { remoteAddress: '127.0.0.1' } }) as unknown as import('node:http').IncomingMessage;

  it('TRUST_PROXY=1 takes the address cloudflared appended, even if the client spoofed X-Forwarded-For', () => {
    assert.equal(clientIp(req({ 'x-forwarded-for': '203.0.113.7' }), 1), '203.0.113.7');
    assert.equal(clientIp(req({ 'x-forwarded-for': '6.6.6.6, 203.0.113.7' }), 1), '203.0.113.7');
    assert.equal(clientIp(req({ 'x-forwarded-for': '203.0.113.7' }), 0), '127.0.0.1'); // not trusted by default
  });
});
