import type { z } from 'zod';

export type VisionTask = 'front' | 'label';

export type VisionRequest = {
  task: VisionTask;
  model: string;
  imageJpeg: Buffer;
  system: string;
  prompt: string;
  /** JSON shape the provider should constrain output to (if it supports structured output). */
  outputSchema: z.ZodType;
};

export type VisionResponse = {
  /** Raw text returned by the model; the vision service parses and validates it. */
  text: string;
  /** Model that actually produced the answer (may differ if the provider fell back). */
  model: string;
  usage: { input_tokens: number; output_tokens: number } | null;
  refused?: boolean;
};

/** Swappable vision backend. Add another implementation and select it with VISION_PROVIDER. */
export interface VisionProvider {
  readonly name: string;
  extract(req: VisionRequest): Promise<VisionResponse>;
}

/** USD per million tokens. Update when pricing changes; unknown models log cost as null. */
export const PRICING: Record<string, { input: number; output: number }> = {
  'claude-haiku-5-5': { input: 0.1, output: 0.5 }, // prompts up to 100K tokens
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-opus-5-5': { input: 4, output: 20 },
  'gpt-6-luna': { input: 0.1, output: 0.5 },
  'gpt-6.1-sol': { input: 2, output: 10 },
};

export function estimateCostUsd(model: string, usage: VisionResponse['usage']): number | null {
  const p = PRICING[model];
  if (!p || !usage) return null;
  return (usage.input_tokens * p.input + usage.output_tokens * p.output) / 1_000_000;
}
