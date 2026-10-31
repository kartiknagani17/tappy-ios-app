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

// ---------- vision_cache (perceptual-hash keyed) ----------
export type VisionCacheRow = {
  id: number;
  kind: 'front' | 'label';
  phash: string;
  model: string;
  parsed_json: string;
  chosen_product_id: number | null;
  hit_count: number;
};

/** Exact or near-duplicate (Hamming distance ≤ maxDistance, max 3 for guaranteed band recall) match. */
export function findVisionCache(db: DB, kind: 'front' | 'label', phash: string, maxDistance: number): VisionCacheRow | null {
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

export function insertVisionCache(db: DB, kind: 'front' | 'label', phash: string, model: string, parsed: unknown): number {
  const [b0, b1, b2, b3] = hashBands(phash);
  const res = db
    .prepare(
      `INSERT INTO vision_cache (kind, phash, band0, band1, band2, band3, model, parsed_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(kind, phash, b0, b1, b2, b3, model, JSON.stringify(parsed), nowSeconds());
  return Number(res.lastInsertRowid);
}

export function setVisionCacheChoice(db: DB, id: number, productId: number): boolean {
  const res = db.prepare('UPDATE vision_cache SET chosen_product_id = ? WHERE id = ?').run(productId, id);
  return Number(res.changes) > 0;
}
