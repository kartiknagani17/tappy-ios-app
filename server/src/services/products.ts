import type { DB } from '../db/index.ts';
import { mergeRecords, type SourceRecord } from '../lib/merge.ts';

export type Product = {
  id: number;
  gtin14: string;
  name: string;
  brand: string | null;
  variant_or_flavor: string | null;
  size_text: string | null;
  ingredients_text: string | null;
  allergens_text: string | null;
  nutrition_json: string | null;
  category: string | null;
  image_url: string | null;
  source: 'usda' | 'off' | 'user' | 'ocr';
  source_record_id: string | null;
  source_updated_at: string | null;
  verified: number;
  report_count: number;
  needs_review: number;
  created_at: string;
  updated_at: string;
};

export type IncomingRecord = SourceRecord & { raw: Record<string, unknown> };

/**
 * Store one source record and re-merge its product. Idempotent: re-running an import
 * with the same data leaves the database unchanged. If a source has several records for
 * one GTIN (USDA often does), the newest source_updated_at is kept.
 * Returns true when the stored record changed.
 */
export function upsertSourceRecord(db: DB, rec: IncomingRecord): boolean {
  const res = db
    .prepare(
      `INSERT INTO source_records (source, gtin14, source_record_id, name, brand, variant_or_flavor, size_text,
         ingredients_text, allergens_text, nutrition_json, category, image_url, source_updated_at, raw_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (source, gtin14) DO UPDATE SET
         source_record_id = excluded.source_record_id, name = excluded.name, brand = excluded.brand,
         variant_or_flavor = excluded.variant_or_flavor, size_text = excluded.size_text,
         ingredients_text = excluded.ingredients_text, allergens_text = excluded.allergens_text,
         nutrition_json = excluded.nutrition_json, category = excluded.category, image_url = excluded.image_url,
         source_updated_at = excluded.source_updated_at, raw_json = excluded.raw_json,
         imported_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE coalesce(excluded.source_updated_at, '') >= coalesce(source_records.source_updated_at, '')
         AND excluded.raw_json IS NOT source_records.raw_json`,
    )
    .run(
      rec.source,
      rec.gtin14,
      rec.source_record_id,
      rec.name,
      rec.brand,
      rec.variant_or_flavor,
      rec.size_text,
      rec.ingredients_text,
      rec.allergens_text,
      rec.nutrition_json,
      rec.category,
      rec.image_url,
      rec.source_updated_at,
      JSON.stringify(rec.raw),
    );
  if (Number(res.changes) === 0) return false;
  rebuildProduct(db, rec.gtin14);
  return true;
}

/** Recompute the products row for a GTIN from its source records. */
export function rebuildProduct(db: DB, gtin14: string): Product | null {
  const existing = getProductByGtin(db, gtin14);
  // Reviewed user/OCR data is authoritative; imports never overwrite it.
  if (existing && existing.verified && (existing.source === 'user' || existing.source === 'ocr')) return existing;

  const records = db.prepare('SELECT * FROM source_records WHERE gtin14 = ?').all(gtin14) as unknown as SourceRecord[];
  const merged = mergeRecords(records);
  if (!merged) return existing;

  db.prepare(
    `INSERT INTO products (gtin14, name, brand, variant_or_flavor, size_text, ingredients_text, allergens_text,
       nutrition_json, category, image_url, source, source_record_id, source_updated_at, verified)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
     ON CONFLICT (gtin14) DO UPDATE SET
       name = excluded.name, brand = excluded.brand, variant_or_flavor = excluded.variant_or_flavor,
       size_text = excluded.size_text, ingredients_text = excluded.ingredients_text,
       allergens_text = excluded.allergens_text, nutrition_json = excluded.nutrition_json,
       category = excluded.category, image_url = excluded.image_url, source = excluded.source,
       source_record_id = excluded.source_record_id, source_updated_at = excluded.source_updated_at,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
  ).run(
    gtin14,
    merged.name!.trim(),
    merged.brand,
    merged.variant_or_flavor,
    merged.size_text,
    merged.ingredients_text,
    merged.allergens_text,
    merged.nutrition_json,
    merged.category,
    merged.image_url,
    merged.source,
    merged.source_record_id,
    merged.source_updated_at,
  );
  // Product data changed: drop any cached barcode result.
  db.prepare('DELETE FROM scan_cache WHERE gtin14 = ?').run(gtin14);
  return getProductByGtin(db, gtin14);
}

export function getProductByGtin(db: DB, gtin14: string): Product | null {
  return (db.prepare('SELECT * FROM products WHERE gtin14 = ?').get(gtin14) as Product | undefined) ?? null;
}

export function getProductById(db: DB, id: number): Product | null {
  return (db.prepare('SELECT * FROM products WHERE id = ?').get(id) as Product | undefined) ?? null;
}

/** Turn free text into an FTS5 trigram OR-query (tokens shorter than 3 chars can't use trigrams). */
export function buildFtsQuery(...parts: (string | null | undefined)[]): string | null {
  const tokens = new Set<string>();
  for (const p of parts) {
    for (const t of (p ?? '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)) {
      if (t.length >= 3) tokens.add(t);
    }
  }
  if (!tokens.size) return null;
  return [...tokens].map((t) => `"${t.replace(/"/g, '""')}"`).join(' OR ');
}

/** Candidate products for a front-of-package query, best FTS rank first. */
export function searchProducts(db: DB, q: { brand?: string | null; name?: string | null; variant?: string | null }, limit = 25): Product[] {
  const fts = buildFtsQuery(q.brand, q.name, q.variant);
  if (!fts) return [];
  return db
    .prepare(
      `SELECT p.* FROM product_search s JOIN products p ON p.id = s.rowid
       WHERE product_search MATCH ? ORDER BY bm25(product_search, 3.0, 4.0, 1.5, 0.5) LIMIT ?`,
    )
    .all(fts, limit) as unknown as Product[];
}

export function reportProduct(db: DB, productId: number, userId: string, reason: string | null) {
  const product = getProductById(db, productId);
  if (!product) return null;
  db.prepare('INSERT INTO product_reports (product_id, user_id, reason) VALUES (?, ?, ?)').run(productId, userId, reason);
  db.prepare(
    `UPDATE products SET report_count = report_count + 1, needs_review = 1,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
  ).run(productId);
  db.prepare('DELETE FROM scan_cache WHERE gtin14 = ?').run(product.gtin14);
  return getProductById(db, productId);
}

/** Shape sent to the app. Parsed nutrition, explicit provenance. */
export function toPublicProduct(p: Product) {
  return {
    id: p.id,
    gtin14: p.gtin14,
    name: p.name,
    brand: p.brand,
    variant_or_flavor: p.variant_or_flavor,
    size_text: p.size_text,
    ingredients_text: p.ingredients_text,
    allergens_text: p.allergens_text,
    nutrition: p.nutrition_json ? (JSON.parse(p.nutrition_json) as Record<string, unknown>) : null,
    category: p.category,
    image_url: p.image_url,
    source: p.source,
    source_updated_at: p.source_updated_at,
    verified: !!p.verified,
    under_review: !!p.needs_review,
  };
}
export type PublicProduct = ReturnType<typeof toPublicProduct>;
