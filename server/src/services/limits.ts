import type { DB } from '../db/index.ts';

export class LimitError extends Error {
  readonly status = 429;
  readonly code: 'rate_limited' | 'daily_limit_reached';
  readonly retryAfterSeconds: number;
  constructor(code: 'rate_limited' | 'daily_limit_reached', message: string, retryAfterSeconds: number) {
    super(message);
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Sliding-window limiter (in memory, per process). Use Redis or similar if you run several instances. */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  private readonly perMinute: number;
  private readonly now: () => number;
  constructor(perMinute: number, now: () => number = Date.now) {
    this.perMinute = perMinute;
    this.now = now;
  }
  check(key: string) {
    const t = this.now();
    const recent = (this.hits.get(key) ?? []).filter((x) => t - x < 60_000);
    if (recent.length >= this.perMinute) {
      const retry = Math.ceil((60_000 - (t - recent[0])) / 1000);
      this.hits.set(key, recent);
      throw new LimitError('rate_limited', 'Too many requests. Please slow down.', retry);
    }
    recent.push(t);
    this.hits.set(key, recent);
    if (this.hits.size > 50_000) this.prune(t);
  }
  private prune(t: number) {
    for (const [k, v] of this.hits) if (!v.some((x) => t - x < 60_000)) this.hits.delete(k);
  }
}

const utcDay = (d = new Date()) => d.toISOString().slice(0, 10);
const secondsUntilUtcMidnight = (d = new Date()) => {
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  return Math.ceil((next - d.getTime()) / 1000);
};

/**
 * Count a scan against the user's free daily quota; throws LimitError when exhausted.
 * Photo scans (which call a vision model) have their own, smaller quota.
 */
export function consumeDailyScan(
  db: DB,
  userId: string,
  kind: 'barcode' | 'photo',
  limits: { dailyFreeScans: number; dailyFreePhotoScans: number },
  now = new Date(),
) {
  const day = utcDay(now);
  const row = (db.prepare('SELECT scans, photo_scans FROM usage_daily WHERE user_id = ? AND day = ?').get(userId, day) as
    | { scans: number; photo_scans: number }
    | undefined) ?? { scans: 0, photo_scans: 0 };
  if (row.scans >= limits.dailyFreeScans || (kind === 'photo' && row.photo_scans >= limits.dailyFreePhotoScans)) {
    throw new LimitError(
      'daily_limit_reached',
      kind === 'photo' ? 'You have used today’s free photo scans.' : 'You have used today’s free scans.',
      secondsUntilUtcMidnight(now),
    );
  }
  db.prepare(
    `INSERT INTO usage_daily (user_id, day, scans, photo_scans) VALUES (?, ?, 1, ?)
     ON CONFLICT (user_id, day) DO UPDATE SET scans = scans + 1, photo_scans = photo_scans + excluded.photo_scans`,
  ).run(userId, day, kind === 'photo' ? 1 : 0);
}
