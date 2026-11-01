import { nowSeconds, type DB } from '../db/index.ts';
import type { Mailer } from './auth.ts';

export const FEEDBACK_MAX_CHARS = 2000;
export const FEEDBACK_TOPIC_MAX_CHARS = 80;
export const FEEDBACK_PER_DEVICE_PER_DAY = 20;

export class FeedbackError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Strips control characters (keeps newlines and tabs) and trims. */
const cleanText = (v: unknown, max: number) =>
  typeof v === 'string'
    ? v
        .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
        .trim()
        .slice(0, max)
    : '';

/**
 * Saves a feedback message and, when email is set up, forwards it to the support address.
 * The email is best-effort: the message is already stored, so a mail failure doesn't fail the request.
 */
export function submitFeedback(
  db: DB,
  userId: string,
  input: { topic?: unknown; message?: unknown },
  notify?: { mailer: Mailer; to: string } | null,
  now = nowSeconds(),
) {
  const message = cleanText(input.message, FEEDBACK_MAX_CHARS);
  const topic = cleanText(input.topic, FEEDBACK_TOPIC_MAX_CHARS) || 'Feedback';
  if (!message) throw new FeedbackError(400, 'bad_request', 'Please write a message first.');
  const { n } = db.prepare('SELECT count(*) AS n FROM feedback WHERE user_id = ? AND created_at > ?').get(userId, now - 86400) as {
    n: number;
  };
  if (n >= FEEDBACK_PER_DEVICE_PER_DAY)
    throw new FeedbackError(429, 'daily_limit_reached', 'Thanks for all the feedback! Please try again tomorrow.');
  const { lastInsertRowid } = db
    .prepare('INSERT INTO feedback (user_id, topic, message, created_at) VALUES (?, ?, ?, ?)')
    .run(userId, topic, message, now);
  if (notify) {
    notify.mailer(notify.to, `Tappy feedback: ${topic}`, `${message}\n\n(feedback #${lastInsertRowid})`).catch(() => {});
  }
  return { id: Number(lastInsertRowid) };
}
