import { nowSeconds, type DB } from '../db/index.ts';
import { pruneSessions } from './auth.ts';

/** Retention promised in the Privacy Policy (server/src/legal/content.ts, section 6). */
export const SCAN_RETENTION_DAYS = 90;
export const FEEDBACK_RETENTION_DAYS = 365;

/** Drops per-device scan records older than the retention window, old feedback, expired sessions and reset codes. */
export function pruneOldData(db: DB, now = nowSeconds()) {
  const cutoff = now - SCAN_RETENTION_DAYS * 86400;
  const cutoffDay = new Date(cutoff * 1000).toISOString().slice(0, 10);
  const cutoffIso = new Date(cutoff * 1000).toISOString();
  db.prepare('DELETE FROM usage_daily WHERE day < ?').run(cutoffDay);
  db.prepare('DELETE FROM vision_offers WHERE created_at < ?').run(cutoff);
  // Spend rows stay for cost reporting, without the device id.
  db.prepare('UPDATE vision_calls SET user_id = NULL WHERE user_id IS NOT NULL AND created_at < ?').run(cutoffIso);
  db.prepare('DELETE FROM scan_cache WHERE expires_at <= ?').run(now);
  db.prepare('DELETE FROM feedback WHERE created_at < ?').run(now - FEEDBACK_RETENTION_DAYS * 86400);
  db.prepare('DELETE FROM missed_scans WHERE last_at < ?').run(now - FEEDBACK_RETENTION_DAYS * 86400);
  pruneSessions(db);
}
