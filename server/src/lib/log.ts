/**
 * Logging helpers that never write secrets. Error objects from HTTP clients can carry request
 * options/headers; we only ever log a redacted message + stack, never the raw object.
 */

const SECRET_PATTERNS: RegExp[] = [
  /sk-ant-[A-Za-z0-9_-]{8,}/g, // Anthropic keys
  /sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}/g, // OpenAI keys
  /\b(?:x-api-key|authorization)\s*[:=]\s*[^\n,}]+/gi,
  /\b(?:api[_-]?key|apikey|token|secret|password)\s*[:=]\s*["']?[^\s"',}]+/gi,
];

const extraSecrets = new Set<string>();

/** Register a configured secret value so it is scrubbed from any log line. */
export function registerSecret(value: string | undefined | null) {
  if (value && value.length >= 8) extraSecrets.add(value);
}

export function redact(text: string): string {
  let out = text;
  for (const s of extraSecrets) out = out.split(s).join('[REDACTED]');
  for (const re of SECRET_PATTERNS) out = out.replace(re, (m) => `${m.slice(0, Math.min(m.length, 7))}[REDACTED]`);
  return out;
}

export function describeError(e: unknown): string {
  if (e instanceof Error) return redact(`${e.name}: ${e.message}${e.stack ? `\n${e.stack.split('\n').slice(1, 8).join('\n')}` : ''}`);
  try {
    return redact(String(e));
  } catch {
    return 'Unprintable error';
  }
}

export function logError(context: string, e: unknown) {
  console.error(`[${new Date().toISOString()}] ${context}: ${describeError(e)}`);
}
