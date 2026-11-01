import { z } from 'zod';
import type { VisionProvider, VisionRequest, VisionResponse } from './provider.ts';

type ResponsesBody = {
  model?: string;
  status?: string;
  output?: { type: string; content?: { type: string; text?: string; refusal?: string }[] }[];
  usage?: { input_tokens: number; output_tokens: number };
  error?: { message?: string } | null;
};

/**
 * OpenAI vision via the Responses API with Structured Outputs (strict JSON schema), called with
 * fetch so no SDK is needed. A refusal is reported as `refused`; the vision service handles retries.
 */
export class OpenAIVisionProvider implements VisionProvider {
  readonly name = 'openai';
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: { apiKey: string; timeoutMs?: number; fetchImpl?: typeof fetch }) {
    this.apiKey = opts.apiKey;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async extract(req: VisionRequest): Promise<VisionResponse> {
    const { $schema: _ignored, ...schema } = z.toJSONSchema(req.outputSchema) as Record<string, unknown>;
    const res = await this.fetchImpl('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(this.timeoutMs),
      body: JSON.stringify({
        model: req.model,
        instructions: req.system,
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_image', image_url: `data:image/jpeg;base64,${req.imageJpeg.toString('base64')}` },
              { type: 'input_text', text: req.prompt },
            ],
          },
        ],
        text: { format: { type: 'json_schema', name: `${req.task}_extraction`, schema, strict: true } },
        // Extraction is simple for the primary model; give the escalation model a bit more room to think.
        reasoning: { effort: req.model.includes('luna') ? 'low' : 'medium' },
        max_output_tokens: 4000,
        store: false,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as ResponsesBody;
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${body.error?.message ?? 'request failed'}`);

    const parts = (body.output ?? []).filter((o) => o.type === 'message').flatMap((o) => o.content ?? []);
    return {
      text: parts
        .filter((p) => p.type === 'output_text')
        .map((p) => p.text ?? '')
        .join(''),
      model: body.model ?? req.model,
      usage: body.usage ? { input_tokens: body.usage.input_tokens, output_tokens: body.usage.output_tokens } : null,
      refused: parts.some((p) => p.type === 'refusal'),
    };
  }
}
