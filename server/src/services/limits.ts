import { isIP } from 'node:net';
import { transaction, type DB } from '../db/index.ts';

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

/**
 * Sliding-window limiter (in memory, per process). Use Redis or similar if you run several instances.
 * Memory is bounded: at most `maxKeys` keys (least recently used evicted) and `perMinute` timestamps each.
 */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  private readonly perMinute: number;
  private readonly now: () => number;
  private readonly maxKeys: number;
  constructor(perMinute: number, now: () => number = Date.now, maxKeys = 100_000) {
    this.perMinute = perMinute;
    this.now = now;
    this.maxKeys = maxKeys;
  }
  get size() {
    return this.hits.size;
  }
  check(key: string) {
    const t = this.now();
    const recent = (this.hits.get(key) ?? []).filter((x) => t - x < 60_000);
    // Re-insert so Map order is least-recently-used first.
    this.hits.delete(key);
    if (recent.length >= this.perMinute) {
      const retry = Math.max(1, Math.ceil((60_000 - (t - recent[0])) / 1000));
      this.hits.set(key, recent);
      throw new LimitError('rate_limited', 'Too many requests. Please slow down.', retry);
    }
    recent.push(t);
    this.hits.set(key, recent);
    if (this.hits.size > this.maxKeys) this.prune(t);
  }
  private prune(t: number) {
    for (const [k, v] of this.hits) if (!v.some((x) => t - x < 60_000)) this.hits.delete(k);
    // Still too many live keys (e.g. a flood of fresh ids): drop the least recently used.
    for (const k of this.hits.keys()) {
      if (this.hits.size <= this.maxKeys) break;
      this.hits.delete(k);
    }
  }
}

/**
 * Rate-limit / quota key for a client address. IPv4-mapped IPv6 is unwrapped and IPv6 is
 * truncated to its /64 (one subscriber typically owns a whole /64, so rotating within it is free).
 */
export function ipKey(ip: string): string {
  let a = ip.trim();
  if (a.toLowerCase().startsWith('::ffff:') && isIP(a.slice(7)) === 4) a = a.slice(7);
  if (isIP(a) === 6) {
    const [head, tail = ''] = a.toLowerCase().split('::');
    const h = head ? head.split(':') : [];
    const t = tail ? tail.split(':') : [];
    const full = a.includes('::') ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t] : h;
    return `${full
      .slice(0, 4)
      .map((x) => x.replace(/^0+(?=.)/, ''))
      .join(':')}::/64`;
  }
  return isIP(a) === 4 ? a : 'unknown';
}

const utcDay = (d = new Date()) => d.toISOString().slice(0, 10);
const secondsUntilUtcMidnight = (d = new Date()) => {
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  return Math.ceil((next - d.getTime()) / 1000);
};

export type DailyLimits = { dailyFreeScans: number; dailyFreePhotoScans: number };
export type QuotaSubject = { key: string; limits: DailyLimits; message?: { barcode: string; photo: string } };

/**
 * Count a scan against several daily quotas at once (e.g. the device id and the client IP).
 * Either every counter is incremented or none is; throws LimitError when any is exhausted.
 * A limit of 0 for an IP subject means "no cap" (subjects with key prefix "ip:").
 * Photo scans (which call a vision model) have their own, smaller quota.
 */
export function consumeDailyQuota(db: DB, subjects: QuotaSubject[], kind: 'barcode' | 'photo', now = new Date()) {
  const day = utcDay(now);
  transaction(db, () => {
    for (const s of subjects) {
      const unlimitedWhenZero = s.key.startsWith('ip:');
      const cap = (n: number) => (unlimitedWhenZero && n === 0 ? Infinity : n);
      const row = (db.prepare('SELECT scans, photo_scans FROM usage_daily WHERE user_id = ? AND day = ?').get(s.key, day) as
        | { scans: number; photo_scans: number }
        | undefined) ?? { scans: 0, photo_scans: 0 };
      if (row.scans >= cap(s.limits.dailyFreeScans) || (kind === 'photo' && row.photo_scans >= cap(s.limits.dailyFreePhotoScans))) {
        const msg = s.message ?? { barcode: 'You have used today’s free scans.', photo: 'You have used today’s free photo scans.' };
        throw new LimitError('daily_limit_reached', kind === 'photo' ? msg.photo : msg.barcode, secondsUntilUtcMidnight(now));
      }
    }
    const inc = db.prepare(
      `INSERT INTO usage_daily (user_id, day, scans, photo_scans) VALUES (?, ?, 1, ?)
       ON CONFLICT (user_id, day) DO UPDATE SET scans = scans + 1, photo_scans = photo_scans + excluded.photo_scans`,
    );
    for (const s of subjects) inc.run(s.key, day, kind === 'photo' ? 1 : 0);
  });
}

/** Single-subject form (per-user quota only). */
export function consumeDailyScan(db: DB, userId: string, kind: 'barcode' | 'photo', limits: DailyLimits, now = new Date()) {
  consumeDailyQuota(db, [{ key: userId, limits }], kind, now);
}

/**
 * Estimated vision spend for the current UTC day. Calls on models without a price entry but with
 * token usage are counted at a deliberately pessimistic rate so the ceiling still holds.
 */
export function visionSpendToday(db: DB, now = new Date()): number {
  const row = db
    .prepare(
      `SELECT coalesce(sum(coalesce(est_cost_usd,
         CASE WHEN input_tokens IS NULL THEN 0 ELSE (input_tokens * 5.0 + coalesce(output_tokens, 0) * 25.0) / 1000000 END)), 0) AS usd
       FROM vision_calls WHERE created_at >= ?`,
    )
    .get(utcDay(now)) as { usd: number };
  return row.usd;
}
