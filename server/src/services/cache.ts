import { nowSeconds, type DB } from '../db/index.ts';
import { hammingDistance, hashBands } from '../lib/image.ts';

// ---------- scan_cache (barcode results) ----------
export function getScanCache<T>(db: DB, gtin14: string): { found: boolean; result: T } | null {
  const row = db.prepare('SELECT found, result_json, expires_at FROM scan_cache WHERE gtin14 = ?').get(gtin14) as
    | { found: number; result_json: string; expires_at: number }
    | undefined;
  if (!row) return null;
  if (row.expires_at <= nowSeconds()) {
    db.prepare('DELETE FROM scan_cache WHERE gtin14 = ?').run(gtin14);
    return null;
  }
  return { found: !!row.found, result: JSON.parse(row.result_json) as T };
}

export function setScanCache(db: DB, gtin14: string, found: boolean, result: unknown, ttlSeconds: number) {
  const now = nowSeconds();
  db.prepare(
    `INSERT INTO scan_cache (gtin14, found, result_json, expires_at, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (gtin14) DO UPDATE SET found = excluded.found, result_json = excluded.result_json,
       expires_at = excluded.expires_at, created_at = excluded.created_at`,
  ).run(gtin14, found ? 1 : 0, JSON.stringify(result), now + ttlSeconds, now);
}

// ---------- missed scans (barcodes with no product) ----------
/** Count one scan of a barcode we have no product for. Barcode only, never who scanned it. */
export function recordMissedScan(db: DB, gtin14: string) {
  const now = nowSeconds();
  db.prepare(
    `INSERT INTO missed_scans (gtin14, scans, first_at, last_at) VALUES (?, 1, ?, ?)
     ON CONFLICT (gtin14) DO UPDATE SET scans = scans + 1, last_at = excluded.last_at`,
  ).run(gtin14, now, now);
}

/** A product now exists for this barcode: it is no longer missing. */
export function clearMissedScan(db: DB, gtin14: string) {
  db.prepare('DELETE FROM missed_scans WHERE gtin14 = ?').run(gtin14);
}

// ---------- vision_cache (perceptual-hash keyed) ----------
export type VisionCacheRow = {
  id: number;
  kind: 'front' | 'label';
  phash: string;
  model: string;
  parsed_json: string;
  chosen_product_id: number | null;
  hit_count: number;
  user_id: string | null;
  content_sha256: string | null;
};

/**
 * Front-of-package photos: exact or near-duplicate (Hamming distance ≤ maxDistance, max 3 for
 * guaranteed band recall) match, shared across users (results only ever produce candidates the
 * user must confirm). Never use this for ingredient panels: see findLabelCache.
 */
export function findVisionCache(db: DB, kind: 'front', phash: string, maxDistance: number): VisionCacheRow | null {
  const [b0, b1, b2, b3] = hashBands(phash);
  const rows = db
    .prepare(
      `SELECT * FROM vision_cache WHERE kind = ? AND (band0 = ? OR band1 = ? OR band2 = ? OR band3 = ?)
       ORDER BY created_at DESC LIMIT 200`,
    )
    .all(kind, b0, b1, b2, b3) as unknown as VisionCacheRow[];
  let best: { row: VisionCacheRow; d: number } | null = null;
  for (const row of rows) {
    const d = hammingDistance(row.phash, phash);
    if (d <= maxDistance && (!best || d < best.d)) best = { row, d };
  }
  if (!best) return null;
  db.prepare('UPDATE vision_cache SET hit_count = hit_count + 1 WHERE id = ?').run(best.row.id);
  return best.row;
}

/**
 * Ingredient-panel results are safety-critical (allergens) and text panels have look-alike
 * perceptual hashes, so they are reused only for the same user and the byte-identical upload
 * (e.g. a retried request).
 */
export function findLabelCache(db: DB, userId: string, contentSha256: string): VisionCacheRow | null {
  const row = db
    .prepare(`SELECT * FROM vision_cache WHERE kind = 'label' AND user_id = ? AND content_sha256 = ? ORDER BY id DESC LIMIT 1`)
    .get(userId, contentSha256) as unknown as VisionCacheRow | undefined;
  if (!row) return null;
  db.prepare('UPDATE vision_cache SET hit_count = hit_count + 1 WHERE id = ?').run(row.id);
  return row;
}

export function insertVisionCache(
  db: DB,
  kind: 'front' | 'label',
  phash: string,
  model: string,
  parsed: unknown,
  owner: { userId?: string | null; contentSha256?: string | null } = {},
): number {
  if (!/^[0-9a-f]{16}$/.test(phash)) throw new Error('invalid perceptual hash');
  const [b0, b1, b2, b3] = hashBands(phash);
  const res = db
    .prepare(
      `INSERT INTO vision_cache (kind, phash, band0, band1, band2, band3, model, parsed_json, created_at, user_id, content_sha256)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(kind, phash, b0, b1, b2, b3, model, JSON.stringify(parsed), nowSeconds(), owner.userId ?? null, owner.contentSha256 ?? null);
  return Number(res.lastInsertRowid);
}

// ---------- front-photo offers + confirmations ----------
const MAX_OFFERED = 20;

/** Remember which products a user was shown for a front photo (merged with earlier offers). */
export function recordVisionOffer(db: DB, visionCacheId: number, userId: string, productIds: number[]) {
  const prev = db.prepare('SELECT product_ids FROM vision_offers WHERE vision_cache_id = ? AND user_id = ?').get(visionCacheId, userId) as
    | { product_ids: string }
    | undefined;
  const ids = [...new Set([...productIds, ...(prev ? (JSON.parse(prev.product_ids) as number[]) : [])])].slice(0, MAX_OFFERED);
  db.prepare(
    `INSERT INTO vision_offers (vision_cache_id, user_id, product_ids, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (vision_cache_id, user_id) DO UPDATE SET product_ids = excluded.product_ids, created_at = excluded.created_at`,
  ).run(visionCacheId, userId, JSON.stringify(ids), nowSeconds());
}

export function wasOffered(db: DB, visionCacheId: number, userId: string, productId: number): boolean {
  const row = db.prepare('SELECT product_ids FROM vision_offers WHERE vision_cache_id = ? AND user_id = ?').get(visionCacheId, userId) as
    | { product_ids: string }
    | undefined;
  return !!row && (JSON.parse(row.product_ids) as number[]).includes(productId);
}

export function getUserConfirmation(db: DB, visionCacheId: number, userId: string): number | null {
  const row = db
    .prepare('SELECT product_id FROM vision_confirmations WHERE vision_cache_id = ? AND user_id = ?')
    .get(visionCacheId, userId) as { product_id: number } | undefined;
  return row?.product_id ?? null;
}

/**
 * Record (or change) one user's confirmation, then recompute the shared choice: a product becomes
 * the shared choice only when users on at least `consensus` distinct networks confirmed it and it
 * holds a strict majority of all confirmations for that photo. Returns the shared choice.
 */
export function confirmVisionChoice(
  db: DB,
  visionCacheId: number,
  userId: string,
  ipKey: string,
  productId: number,
  consensus: number,
): number | null {
  db.prepare(
    `INSERT INTO vision_confirmations (vision_cache_id, user_id, ip_key, product_id, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (vision_cache_id, user_id) DO UPDATE SET product_id = excluded.product_id, ip_key = excluded.ip_key,
       created_at = excluded.created_at`,
  ).run(visionCacheId, userId, ipKey, productId, nowSeconds());
  const tallies = db
    .prepare(
      `SELECT product_id, count(*) AS users, count(DISTINCT ip_key) AS networks FROM vision_confirmations
       WHERE vision_cache_id = ? GROUP BY product_id ORDER BY networks DESC, users DESC`,
    )
    .all(visionCacheId) as { product_id: number; users: number; networks: number }[];
  const total = tallies.reduce((a, t) => a + t.users, 0);
  const top = tallies[0];
  const chosen = top && top.networks >= consensus && top.users * 2 > total ? top.product_id : null;
  db.prepare('UPDATE vision_cache SET chosen_product_id = ? WHERE id = ?').run(chosen, visionCacheId);
  return chosen;
}
