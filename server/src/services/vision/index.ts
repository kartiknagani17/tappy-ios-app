import type { z } from 'zod';
import type { Config } from '../../config.ts';
import type { DB } from '../../db/index.ts';
import { AnthropicVisionProvider } from './anthropic.ts';
import { estimateCostUsd, type VisionProvider, type VisionTask } from './provider.ts';
import { FRONT_PROMPT, FrontOutput, FrontResult, LABEL_PROMPT, LabelOutput, LabelResult, RETRY_SUFFIX, SYSTEM_PROMPT } from './schemas.ts';

export type { VisionProvider } from './provider.ts';

export function createVisionProvider(config: Config): VisionProvider {
  switch (config.visionProvider) {
    case 'anthropic':
      return new AnthropicVisionProvider({ apiKey: config.anthropicApiKey || undefined });
    default:
      throw new Error(`Unknown VISION_PROVIDER "${config.visionProvider}"`);
  }
}

const TASKS = {
  front: { prompt: FRONT_PROMPT, output: FrontOutput, result: FrontResult },
  label: { prompt: LABEL_PROMPT, output: LabelOutput, result: LabelResult },
} as const;

type ResultFor<T extends VisionTask> = T extends 'front' ? FrontResult : LabelResult;

export type VisionOutcome<T extends VisionTask> =
  | { ok: true; result: ResultFor<T>; model: string; escalated: boolean; calls: number }
  | { ok: false; error: string; calls: number };

export class VisionService {
  private readonly db: DB;
  private readonly provider: VisionProvider;
  private readonly opts: { primaryModel: string; escalationModel: string; escalateBelow: number };

  constructor(db: DB, provider: VisionProvider, opts: { primaryModel: string; escalationModel: string; escalateBelow: number }) {
    this.db = db;
    this.provider = provider;
    this.opts = opts;
  }

  /**
   * Primary model first. Invalid JSON is retried once on the same model. If the result is
   * still invalid or its confidence is below the threshold, escalate exactly once to the
   * escalation model (which also gets one retry). The higher-confidence valid result wins.
   */
  async run<T extends VisionTask>(task: T, imageJpeg: Buffer, userId: string | null): Promise<VisionOutcome<T>> {
    let calls = 0;
    const attemptModel = async (model: string) => {
      let lastError = 'no response';
      let providerError = false;
      for (let attempt = 1; attempt <= 2; attempt++) {
        calls++;
        const r = await this.callOnce(task, model, imageJpeg, userId, attempt);
        if (r.ok) return r;
        lastError = r.error;
        providerError = r.kind === 'provider_error';
        if (r.kind !== 'invalid') break; // refusals / API errors: don't spend a retry
      }
      return { ok: false as const, error: lastError, providerError };
    };

    const first = await attemptModel(this.opts.primaryModel);
    // Escalate on low confidence, invalid output or a refusal, but not when the provider itself
    // failed (bad credentials, outage): a second model call would fail the same way.
    const needsEscalation = first.ok ? first.result.confidence < this.opts.escalateBelow : !first.providerError;
    if (!first.ok && first.providerError) return { ok: false, error: first.error, calls };
    if (!needsEscalation || this.opts.escalationModel === this.opts.primaryModel) {
      return first.ok
        ? { ok: true, result: first.result, model: first.model, escalated: false, calls }
        : { ok: false, error: first.error, calls };
    }
    const second = await attemptModel(this.opts.escalationModel);
    if (second.ok && (!first.ok || second.result.confidence >= first.result.confidence)) {
      return { ok: true, result: second.result, model: second.model, escalated: true, calls };
    }
    if (first.ok) return { ok: true, result: first.result, model: first.model, escalated: true, calls };
    return { ok: false, error: second.ok ? 'unreachable' : second.error, calls };
  }

  private async callOnce<T extends VisionTask>(task: T, model: string, imageJpeg: Buffer, userId: string | null, attempt: number) {
    const spec = TASKS[task];
    const started = performance.now();
    let logged: { model: string; usage: { input_tokens: number; output_tokens: number } | null; ok: boolean; error: string | null } = {
      model,
      usage: null,
      ok: false,
      error: null,
    };
    try {
      const res = await this.provider.extract({
        task,
        model,
        imageJpeg,
        system: SYSTEM_PROMPT,
        prompt: attempt > 1 ? spec.prompt + RETRY_SUFFIX : spec.prompt,
        outputSchema: spec.output,
      });
      logged = { model: res.model, usage: res.usage, ok: false, error: null };
      if (res.refused) {
        logged.error = 'refused';
        return { ok: false as const, error: 'The model declined to read this image.', kind: 'refused' as const };
      }
      const parsed = parseJson(res.text);
      const validated = parsed === undefined ? null : (spec.result as z.ZodType).safeParse(parsed);
      if (!validated || !validated.success) {
        logged.error = parsed === undefined ? 'invalid_json' : 'schema_mismatch';
        return { ok: false as const, error: `Model returned ${logged.error}`, kind: 'invalid' as const };
      }
      logged.ok = true;
      return { ok: true as const, result: validated.data as ResultFor<T>, model: res.model };
    } catch (e) {
      logged.error = (e as Error).message.slice(0, 500);
      return { ok: false as const, error: 'Vision service unavailable', kind: 'provider_error' as const };
    } finally {
      this.db
        .prepare(
          `INSERT INTO vision_calls (user_id, task, provider, model, attempt, input_tokens, output_tokens, latency_ms, est_cost_usd, ok, error)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          userId,
          task,
          this.provider.name,
          logged.model,
          attempt,
          logged.usage?.input_tokens ?? null,
          logged.usage?.output_tokens ?? null,
          Math.round(performance.now() - started),
          estimateCostUsd(logged.model, logged.usage),
          logged.ok ? 1 : 0,
          logged.error,
        );
    }
  }
}

/** Tolerant JSON parse: accepts a bare object or one wrapped in a ```json fence. undefined if not JSON. */
export function parseJson(text: string): unknown {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}
