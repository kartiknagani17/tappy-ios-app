import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/http/app.ts';
import { RateLimiter } from '../src/services/limits.ts';
import { FEEDBACK_PER_DEVICE_PER_DAY } from '../src/services/feedback.ts';
import { makeScan, MockVisionProvider, testConfig, testDb } from './helpers.ts';

describe('POST /api/feedback', () => {
  let server: Server;
  let base: string;
  const db = testDb();
  const config = testConfig({ rateLimitPerMinute: 1000, supportEmail: 'support@example.com' });
  const sent: { to: string; subject: string; text: string }[] = [];

  before(async () => {
    const { scan } = makeScan(db, new MockVisionProvider(), config);
    const mailer = async (to: string, subject: string, text: string) => void sent.push({ to, subject, text });
    server = createServer(createApp({ db, config, scan, mailer, feedbackLimiter: new RateLimiter(1000) }));
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(() => server.close());

  const post = (body: unknown, user = 'device-feedback-1') =>
    fetch(base + '/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Tappy-User': user },
      body: JSON.stringify(body),
    });

  it('stores the message and emails support', async () => {
    const res = await post({ topic: "Don't see an ingredient?", message: '  Please add lupin \u0007flour  ' });
    assert.equal(res.status, 200);
    const row = db.prepare('SELECT topic, message, user_id FROM feedback').get() as Record<string, string>;
    assert.deepEqual({ ...row }, { topic: "Don't see an ingredient?", message: 'Please add lupin flour', user_id: 'device-feedback-1' });
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, 'support@example.com');
    assert.match(sent[0].subject, /Don't see an ingredient/);
  });

  it('rejects empty messages', async () => {
    assert.equal((await post({ message: '   ' })).status, 400);
    assert.equal((await post({ message: 42 })).status, 400);
  });

  it('caps messages per network per minute', async () => {
    const { db: db2, config: c2 } = { db: testDb(), config: testConfig() };
    const { scan: s2 } = makeScan(db2, new MockVisionProvider(), c2);
    const srv = createServer(createApp({ db: db2, config: c2, scan: s2, feedbackLimiter: new RateLimiter(2) }));
    await new Promise<void>((r) => srv.listen(0, r));
    const url = `http://127.0.0.1:${(srv.address() as AddressInfo).port}/api/feedback`;
    const send = (dev: string) =>
      fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Tappy-User': dev }, body: JSON.stringify({ message: 'hi' }) });
    assert.equal((await send('device-net-0001')).status, 200);
    assert.equal((await send('device-net-0002')).status, 200);
    assert.equal((await send('device-net-0003')).status, 429); // new device id, same network
    srv.close();
  });

  it('caps messages per device per day', async () => {
    for (let i = 0; i < FEEDBACK_PER_DEVICE_PER_DAY; i++) assert.equal((await post({ message: `m${i}` }, 'device-feedback-2')).status, 200);
    assert.equal((await post({ message: 'one more' }, 'device-feedback-2')).status, 429);
  });
});
