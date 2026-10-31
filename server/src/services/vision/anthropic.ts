import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { VisionProvider, VisionRequest, VisionResponse } from './provider.ts';

/**
 * Claude vision via the Messages API with structured outputs (output_config.format).
 * Claude Sonnet 5.5 calls opt into server-side refusal fallback ("default" routing), so a
 * rare safety-classifier decline is retried on a fallback model instead of failing the scan.
 * Claude Haiku 5.5 has no server-side fallback; a refusal is reported as `refused`.
 */
export class AnthropicVisionProvider implements VisionProvider {
  readonly name = 'anthropic';
  private client: Anthropic;
  private refusalFallback: boolean;

  constructor(opts: { apiKey?: string; refusalFallback?: boolean } = {}) {
    // With no apiKey the SDK resolves credentials from the environment (ANTHROPIC_API_KEY, etc.).
    this.client = new Anthropic(opts.apiKey ? { apiKey: opts.apiKey } : {});
    this.refusalFallback = opts.refusalFallback ?? true;
  }

  async extract(req: VisionRequest): Promise<VisionResponse> {
    const content: Anthropic.Beta.BetaContentBlockParam[] = [
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: req.imageJpeg.toString('base64') } },
      { type: 'text', text: req.prompt },
    ];
    const useFallback = this.refusalFallback && req.model.startsWith('claude-sonnet-5-5');
    const response = await this.client.beta.messages.create({
      model: req.model,
      max_tokens: 4000,
      system: req.system,
      messages: [{ role: 'user', content }],
      // Extraction is simple for Haiku; give the escalation model a bit more room to think.
      output_config: {
        effort: req.model.includes('haiku') ? 'low' : 'medium',
        format: zodOutputFormat(req.outputSchema),
      },
      ...(useFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
    });

    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    return {
      text,
      model: response.model,
      usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens },
      refused: response.stop_reason === 'refusal',
    };
  }
}
