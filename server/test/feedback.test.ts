import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/http/app.ts';
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
    server = createServer(createApp({ db, config, scan, mailer }));
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

  it('caps messages per device per day', async () => {
    for (let i = 0; i < FEEDBACK_PER_DEVICE_PER_DAY; i++) assert.equal((await post({ message: `m${i}` }, 'device-feedback-2')).status, 200);
    assert.equal((await post({ message: 'one more' }, 'device-feedback-2')).status, 429);
  });
});
