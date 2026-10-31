import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { estimateCostUsd } from '../src/services/vision/provider.ts';
import { parseJson, VisionService } from '../src/services/vision/index.ts';
import { FrontResult, LabelResult } from '../src/services/vision/schemas.ts';
import { frontJson, labelJson, MockVisionProvider, testDb } from './helpers.ts';

const IMG = Buffer.from('fake-jpeg');
const opts = { primaryModel: 'claude-haiku-5-5', escalationModel: 'claude-sonnet-5-5', escalateBelow: 0.6 };
const calls = (db: ReturnType<typeof testDb>) =>
  db.prepare('SELECT model, attempt, ok, error, input_tokens, output_tokens, est_cost_usd FROM vision_calls ORDER BY id').all() as {
    model: string;
    attempt: number;
    ok: number;
    error: string | null;
    input_tokens: number | null;
    output_tokens: number | null;
    est_cost_usd: number | null;
  }[];

describe('vision JSON validation', () => {
  it('accepts a valid response in one call and logs tokens + cost', async () => {
    const db = testDb();
    const provider = new MockVisionProvider([{ text: frontJson({ brand: 'Sunny', product_name: 'Chips' }) }]);
    const out = await new VisionService(db, provider, opts).run('front', IMG, 'user-1');
    assert.ok(out.ok);
    assert.equal(out.result.brand, 'Sunny');
    assert.equal(out.calls, 1);
    assert.equal(out.escalated, false);
    const [log] = calls(db);
    assert.deepEqual(
      { ...log },
      {
        model: 'claude-haiku-5-5',
        attempt: 1,
        ok: 1,
        error: null,
        input_tokens: 1200,
        output_tokens: 150,
        est_cost_usd: estimateCostUsd('claude-haiku-5-5', { input_tokens: 1200, output_tokens: 150 }),
      },
    );
    // The provider is asked for structured output with the front schema.
    assert.equal(provider.calls[0].task, 'front');
  });

  it('retries once on invalid JSON with a corrective instruction', async () => {
    const db = testDb();
    const provider = new MockVisionProvider([{ text: 'Sure! Here it is: {brand: oops' }, { text: frontJson() }]);
    const out = await new VisionService(db, provider, opts).run('front', IMG, null);
    assert.ok(out.ok);
    assert.equal(out.calls, 2);
    assert.match(provider.calls[1].prompt, /not valid JSON/);
    assert.deepEqual(
      calls(db).map((c) => [c.attempt, c.ok, c.error]),
      [
        [1, 0, 'invalid_json'],
        [2, 1, null],
      ],
    );
  });

  it('treats schema violations (e.g. confidence 2) as invalid', async () => {
    const db = testDb();
    const provider = new MockVisionProvider([{ text: frontJson({ confidence: 2 }) }, { text: frontJson({ confidence: 0.8 }) }]);
    const out = await new VisionService(db, provider, opts).run('front', IMG, null);
    assert.ok(out.ok);
    assert.equal(calls(db)[0].error, 'schema_mismatch');
  });

  it('escalates once to the stronger model when confidence is low', async () => {
    const db = testDb();
    const provider = new MockVisionProvider([
      { text: frontJson({ confidence: 0.3 }) },
      { text: frontJson({ confidence: 0.9, brand: 'B' }) },
    ]);
    const out = await new VisionService(db, provider, opts).run('front', IMG, null);
    assert.ok(out.ok);
    assert.equal(out.escalated, true);
    assert.equal(out.model, 'claude-sonnet-5-5');
    assert.equal(out.result.brand, 'B');
    assert.deepEqual(
      provider.calls.map((c) => c.model),
      ['claude-haiku-5-5', 'claude-sonnet-5-5'],
    );
  });

  it('keeps the primary result if escalation is not better', async () => {
    const db = testDb();
    const provider = new MockVisionProvider([
      { text: frontJson({ confidence: 0.5, brand: 'A' }) },
      { text: frontJson({ confidence: 0.4, brand: 'B' }) },
    ]);
    const out = await new VisionService(db, provider, opts).run('front', IMG, null);
    assert.ok(out.ok);
    assert.equal(out.result.brand, 'A');
    assert.equal(provider.calls.length, 2); // never a third model call
  });

  it('escalates after two invalid primary replies, then gives up cleanly', async () => {
    const db = testDb();
    const provider = new MockVisionProvider([{ text: 'x' }, { text: 'y' }, { text: 'z' }, { text: 'w' }]);
    const out = await new VisionService(db, provider, opts).run('label', IMG, null);
    assert.equal(out.ok, false);
    assert.equal(out.calls, 4);
    assert.deepEqual(
      provider.calls.map((c) => c.model),
      ['claude-haiku-5-5', 'claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-sonnet-5-5'],
    );
  });

  it('a refusal is not retried on the same model but does escalate', async () => {
    const db = testDb();
    const provider = new MockVisionProvider([{ text: '', refused: true }, { text: frontJson({ confidence: 0.8 }) }]);
    const out = await new VisionService(db, provider, opts).run('front', IMG, null);
    assert.ok(out.ok);
    assert.deepEqual(
      provider.calls.map((c) => c.model),
      ['claude-haiku-5-5', 'claude-sonnet-5-5'],
    );
    assert.deepEqual(
      calls(db).map((c) => c.error),
      ['refused', null],
    );
  });

  it('provider errors (auth, outage) fail fast: no retry, no escalation', async () => {
    const db = testDb();
    const provider = new MockVisionProvider([new Error('authentication failed')]);
    const out = await new VisionService(db, provider, opts).run('front', IMG, null);
    assert.equal(out.ok, false);
    assert.equal(provider.calls.length, 1);
    assert.deepEqual(
      calls(db).map((c) => [c.ok, c.error]),
      [[0, 'authentication failed']],
    );
  });

  it('does not escalate when primary and escalation models are the same', async () => {
    const db = testDb();
    const provider = new MockVisionProvider([{ text: frontJson({ confidence: 0.1 }) }]);
    const out = await new VisionService(db, provider, { ...opts, escalationModel: 'claude-haiku-5-5' }).run('front', IMG, null);
    assert.ok(out.ok);
    assert.equal(provider.calls.length, 1);
  });

  it('normalizes extracted fields', () => {
    const f = FrontResult.parse(JSON.parse(frontJson({ barcode_if_visible: '0 36000 29145 2' })));
    assert.equal(f.barcode_if_visible, '036000291452');
    assert.equal(FrontResult.parse(JSON.parse(frontJson({ barcode_if_visible: '12' }))).barcode_if_visible, null);
    const l = LabelResult.parse(JSON.parse(labelJson({ ingredients_text: 'INGREDIENTS:  Peanuts,\n salt' })));
    assert.equal(l.ingredients_text, 'Peanuts, salt');
  });

  it('parses JSON wrapped in a code fence', () => {
    assert.deepEqual(parseJson('```json\n{"a":1}\n```'), { a: 1 });
    assert.equal(parseJson('not json'), undefined);
  });

  it('estimates cost from token usage', () => {
    assert.equal(estimateCostUsd('claude-sonnet-5-5', { input_tokens: 1_000_000, output_tokens: 100_000 }), 3);
    assert.equal(estimateCostUsd('unknown-model', { input_tokens: 1, output_tokens: 1 }), null);
  });
});
