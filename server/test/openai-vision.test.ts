import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateConfig } from '../src/config.ts';
import { redact } from '../src/lib/log.ts';
import { OpenAIVisionProvider } from '../src/services/vision/openai.ts';
import { FrontOutput, FRONT_PROMPT, SYSTEM_PROMPT } from '../src/services/vision/schemas.ts';
import { testConfig } from './helpers.ts';

const req = {
  task: 'front' as const,
  model: 'gpt-6-luna',
  imageJpeg: Buffer.from('jpeg-bytes'),
  system: SYSTEM_PROMPT,
  prompt: FRONT_PROMPT,
  outputSchema: FrontOutput,
};

describe('OpenAIVisionProvider', () => {
  it('sends the image with a strict JSON schema and returns the text, model and usage', async () => {
    let sent: { url: string; headers: Record<string, string>; body: Record<string, any> } | null = null;
    const provider = new OpenAIVisionProvider({
      apiKey: 'sk-proj-test',
      fetchImpl: (async (url: string, init: RequestInit) => {
        sent = { url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) };
        return new Response(
          JSON.stringify({
            model: 'gpt-6-luna-2026-09-22',
            output: [
              { type: 'reasoning', content: [] },
              { type: 'message', content: [{ type: 'output_text', text: '{"is_food_package":true}' }] },
            ],
            usage: { input_tokens: 900, output_tokens: 80 },
          }),
        );
      }) as unknown as typeof fetch,
    });
    const out = await provider.extract(req);
    assert.deepEqual(out, {
      text: '{"is_food_package":true}',
      model: 'gpt-6-luna-2026-09-22',
      usage: { input_tokens: 900, output_tokens: 80 },
      refused: false,
    });
    assert.equal(sent!.url, 'https://api.openai.com/v1/responses');
    assert.equal(sent!.headers.Authorization, 'Bearer sk-proj-test');
    const format = sent!.body.text.format;
    assert.equal(format.type, 'json_schema');
    assert.equal(format.strict, true);
    assert.equal(format.schema.$schema, undefined);
    assert.equal(format.schema.additionalProperties, false);
    assert.deepEqual([...format.schema.required].sort(), Object.keys(FrontOutput.shape).sort());
    assert.match(sent!.body.input[0].content[0].image_url, /^data:image\/jpeg;base64,/);
    assert.equal(sent!.body.reasoning.effort, 'low');
    assert.equal(sent!.body.store, false);
  });

  it('reports refusals and throws on HTTP errors', async () => {
    const refusing = new OpenAIVisionProvider({
      apiKey: 'k',
      fetchImpl: (async () =>
        new Response(JSON.stringify({ output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'no' }] }] }))) as unknown as typeof fetch,
    });
    assert.equal((await refusing.extract(req)).refused, true);
    const failing = new OpenAIVisionProvider({
      apiKey: 'k',
      fetchImpl: (async () => new Response(JSON.stringify({ error: { message: 'Incorrect API key' } }), { status: 401 })) as unknown as typeof fetch,
    });
    await assert.rejects(failing.extract(req), /OpenAI 401: Incorrect API key/);
  });
});

describe('OpenAI config', () => {
  it('needs OPENAI_API_KEY when the provider is openai', () => {
    const base = testConfig({ visionProvider: 'openai', openaiApiKey: '', photoScanningMode: 'on' });
    assert.throws(() => validateConfig(base), /OPENAI_API_KEY/);
    assert.doesNotThrow(() => validateConfig({ ...base, openaiApiKey: 'sk-proj-abc' }));
    assert.throws(() => validateConfig({ ...base, visionProvider: 'gemini' }), /VISION_PROVIDER/);
  });

  it('redacts OpenAI keys from logs', () => {
    assert.doesNotMatch(redact('401 for sk-proj-AbCdEfGhIjKlMnOpQrStUvWxYz_123'), /AbCdEfGh/);
  });
});
