import type { DB } from '../db/index.ts';
import { mergeRecords, type SourceRecord } from '../lib/merge.ts';
import { displayName } from '../lib/names.ts';
import { publicImageUrl } from './images.ts';

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

const MAX_FTS_TOKENS = 24;

/** Lowercased letter/digit tokens of 3+ chars (trigrams need 3), deduplicated and bounded. */
function ftsTokens(...parts: (string | null | undefined)[]): string[] {
  const tokens = new Set<string>();
  for (const p of parts) {
    for (const t of (p ?? '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)) {
      if (t.length >= 3) tokens.add(t.slice(0, 64));
    }
  }
  return [...tokens].slice(0, MAX_FTS_TOKENS);
}

// Every token is reduced to letters/digits and double-quoted, so FTS5 operators (OR, NEAR, *, ^,
// column filters) in extracted text are matched literally.
const quote = (t: string) => `"${t.replace(/"/g, '""')}"`;
const all = (ts: string[]) => ts.map(quote).join(' AND ');
const any = (ts: string[]) => ts.map(quote).join(' OR ');

/** Turn free text into an FTS5 trigram OR-query. Bounded so a long string can't build a huge query. */
export function buildFtsQuery(...parts: (string | null | undefined)[]): string | null {
  const tokens = ftsTokens(...parts);
  return tokens.length ? any(tokens) : null;
}

/**
 * FTS queries for a front-of-package search, most specific first. A single OR over every token
 * ranks every product sharing a common word ("whole", "grain") and takes seconds on the full
 * database, so each tier requires all of its terms (tens to hundreds of ms each).
 */
export function searchTiers(q: { brand?: string | null; name?: string | null; variant?: string | null }): string[] {
  const brand = ftsTokens(q.brand);
  const rest = ftsTokens(q.name, q.variant).filter((t) => !brand.includes(t));
  const name = ftsTokens(q.name).filter((t) => !brand.includes(t));
  const tiers: string[] = [];
  if (brand.length + rest.length) tiers.push(all([...brand, ...rest]));
  if (brand.length && rest.length) tiers.push(`${all(brand)} AND (${any(rest)})`);
  if (name.length > 1) tiers.push(all(name));
  if (brand.length) tiers.push(all(brand));
  return [...new Set(tiers)];
}

/** Candidate products for a front-of-package query: tiered FTS (see searchTiers), best rank first within each tier. */
export function searchProducts(db: DB, q: { brand?: string | null; name?: string | null; variant?: string | null }, limit = 25): Product[] {
  const stmt = db.prepare(
    `SELECT p.* FROM product_search s JOIN products p ON p.id = s.rowid
     WHERE product_search MATCH ? ORDER BY bm25(product_search, 3.0, 4.0, 1.5, 0.5) LIMIT ?`,
  );
  const out = new Map<number, Product>();
  for (const fts of searchTiers(q)) {
    for (const p of stmt.all(fts, limit) as unknown as Product[]) if (!out.has(p.id)) out.set(p.id, p);
    if (out.size >= limit) break;
  }
  return [...out.values()].slice(0, limit);
}

/**
 * Candidates for "Similar items": other products in the same category that have an ingredient list,
 * same brand first. The app decides which of them fit the user's profile (the profile never leaves
 * the phone), so this returns more than it shows. Products without a category fall back to a name
 * search without the brand ("Creamy Peanut Butter" → other peanut butters).
 */
export function similarProducts(db: DB, product: Product, limit = 60): Product[] {
  const out = new Map<number, Product>();
  const usable = (p: Product) =>
    p.id !== product.id && p.gtin14 !== product.gtin14 && !!p.ingredients_text && p.ingredients_text.length >= 10 && !p.needs_review;
  if (product.category) {
    const rows = db
      .prepare(
        `SELECT * FROM products WHERE category = ? AND id != ? AND ingredients_text IS NOT NULL
         ORDER BY (brand IS ?) DESC, report_count ASC, source_updated_at DESC LIMIT ?`,
      )
      .all(product.category, product.id, product.brand, limit * 2) as unknown as Product[];
    for (const p of rows) if (usable(p) && out.size < limit) out.set(p.id, p);
  }
  if (out.size < 10) {
    const brandWords = new Set((product.brand ?? '').toLowerCase().split(/\s+/));
    const name = product.name
      .split(/\s+/)
      .filter((w) => !brandWords.has(w.toLowerCase()))
      .join(' ');
    for (const p of searchProducts(db, { name }, limit)) if (usable(p) && !out.has(p.id) && out.size < limit) out.set(p.id, p);
  }
  return [...out.values()];
}

/** Store aisles for the Grocery tab (see migration 006_aisles.sql). */
export const AISLES = ['snacks', 'sweets', 'breakfast', 'bakery', 'drinks', 'pantry', 'dairy', 'frozen', 'meat', 'produce'] as const;
export type Aisle = (typeof AISLES)[number];
export const GROCERY_PAGE = 40;

/**
 * Grocery tab: products matching a search and/or in an aisle, products with an ingredient list
 * only (the verdict needs it), photos first. The app checks which fit the profile (the profile
 * never leaves the phone), and asks for the next page when too few do.
 */
export function browseProducts(db: DB, opts: { q?: string | null; aisle?: Aisle | null; offset?: number }): { products: Product[]; nextOffset: number | null } {
  const offset = Math.max(0, Math.min(2000, Math.floor(opts.offset ?? 0)));
  const tokens = ftsTokens(opts.q);
  let rows: Product[];
  if (tokens.length) {
    // Every word must match ("peanut butter" isn't every peanut product).
    rows = db
      .prepare(
        `SELECT p.* FROM product_search s JOIN products p ON p.id = s.rowid
         WHERE product_search MATCH ? AND p.ingredients_text IS NOT NULL ${opts.aisle ? 'AND p.aisle = ?' : ''}
         ORDER BY (p.image_url IS NULL), bm25(product_search, 3.0, 4.0, 1.5, 0.5) LIMIT ? OFFSET ?`,
      )
      .all(...([all(tokens), ...(opts.aisle ? [opts.aisle] : []), GROCERY_PAGE + 1, offset] as (string | number)[])) as unknown as Product[];
  } else if (opts.aisle) {
    rows = db
      .prepare(
        `SELECT * FROM products WHERE aisle = ? AND ingredients_text IS NOT NULL
         ORDER BY (image_url IS NULL), id LIMIT ? OFFSET ?`,
      )
      .all(opts.aisle, GROCERY_PAGE + 1, offset) as unknown as Product[];
  } else {
    return { products: [], nextOffset: null };
  }
  const more = rows.length > GROCERY_PAGE;
  const page = rows.slice(0, GROCERY_PAGE).filter((p) => !p.needs_review && (p.ingredients_text?.length ?? 0) >= 10);
  return { products: page, nextOffset: more ? offset + GROCERY_PAGE : null };
}

/** Current data for up to 50 product ids (used to tell the app when a watched product changed). */
export function productsByIds(db: DB, ids: number[]): Product[] {
  const unique = [...new Set(ids)].filter((x) => Number.isSafeInteger(x) && x > 0).slice(0, 50);
  if (!unique.length) return [];
  return db.prepare(`SELECT * FROM products WHERE id IN (${unique.map(() => '?').join(',')})`).all(...unique) as unknown as Product[];
}

/** Strip control/bidi characters, collapse whitespace, cap length. Empty -> null. */
export function sanitizeReason(v: unknown, max = 500): string | null {
  if (typeof v !== 'string') return null;
  const t = v
    .normalize('NFC')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F-\u009F\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return t ? Array.from(t).slice(0, max).join('') : null;
}

/**
 * One report per user per product: a repeat report from the same user is a no-op
 * (returns the product with duplicate = true) so one device can't inflate report_count.
 */
export function reportProduct(db: DB, productId: number, userId: string, reason: string | null) {
  const product = getProductById(db, productId);
  if (!product) return null;
  const res = db
    .prepare('INSERT INTO product_reports (product_id, user_id, reason) VALUES (?, ?, ?) ON CONFLICT (product_id, user_id) DO NOTHING')
    .run(productId, userId, sanitizeReason(reason));
  if (Number(res.changes) === 0) return Object.assign(product, { duplicate: true as const });
  db.prepare(
    `UPDATE products SET report_count = report_count + 1, needs_review = 1,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
  ).run(productId);
  db.prepare('DELETE FROM scan_cache WHERE gtin14 = ?').run(product.gtin14);
  return Object.assign(getProductById(db, productId)!, { duplicate: false as const });
}

/** Mark a product as under review (shown to everyone) and drop its cached scan result. */
export function flagForReview(db: DB, productId: number) {
  const p = getProductById(db, productId);
  if (!p) return;
  db.prepare(`UPDATE products SET needs_review = 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`).run(productId);
  db.prepare('DELETE FROM scan_cache WHERE gtin14 = ?').run(p.gtin14);
}

export type PendingContribution = {
  id: number;
  gtin14: string | null;
  created_at: string;
  confidence: number | null;
  ingredients_text: string;
  allergens_text: string | null;
  product_name: string | null;
  current_ingredients: string | null;
};

/** Label photos waiting for review, oldest first, next to what the database has now. */
export function pendingContributions(db: DB, limit = 50): PendingContribution[] {
  return db
    .prepare(
      `SELECT c.id, c.gtin14, c.created_at, c.confidence, c.ingredients_text, c.allergens_text,
         p.name AS product_name, p.ingredients_text AS current_ingredients
       FROM contributions c LEFT JOIN products p ON p.gtin14 = c.gtin14
       WHERE c.status = 'pending' AND c.gtin14 IS NOT NULL ORDER BY c.id LIMIT ?`,
    )
    .all(limit) as unknown as PendingContribution[];
}

/**
 * Approve a label photo: its ingredients become the product's data for everyone, as reviewed
 * ("verified") OCR data that imports never overwrite. Other pending photos for the same product are
 * left for review. Returns the updated product, or an error reason.
 */
export function approveContribution(db: DB, id: number): { ok: true; product: Product } | { ok: false; reason: string } {
  const c = db.prepare(`SELECT * FROM contributions WHERE id = ?`).get(id) as
    | { id: number; gtin14: string | null; status: string; ingredients_text: string; allergens_text: string | null; nutrition_json: string | null; created_at: string }
    | undefined;
  if (!c) return { ok: false, reason: 'not found' };
  if (c.status !== 'pending') return { ok: false, reason: `already ${c.status}` };
  if (!c.gtin14) return { ok: false, reason: 'no barcode: nothing to attach it to' };
  const product = getProductByGtin(db, c.gtin14);
  if (!product) return { ok: false, reason: 'no product with this barcode yet (scan it once so it exists)' };
  db.exec('BEGIN');
  try {
    db.prepare(
      `UPDATE products SET ingredients_text = ?, allergens_text = ?, nutrition_json = coalesce(?, nutrition_json),
         source = 'ocr', source_record_id = ?, source_updated_at = ?, verified = 1, needs_review = 0,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
    ).run(c.ingredients_text, c.allergens_text, c.nutrition_json, `contribution:${c.id}`, c.created_at, product.id);
    db.prepare(`UPDATE contributions SET status = 'approved' WHERE id = ?`).run(c.id);
    db.prepare('DELETE FROM scan_cache WHERE gtin14 = ?').run(c.gtin14);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return { ok: true, product: getProductById(db, product.id)! };
}

/** Reject a label photo. If no other photo for the product is waiting, the product leaves review. */
export function rejectContribution(db: DB, id: number): { ok: true } | { ok: false; reason: string } {
  const c = db.prepare(`SELECT id, gtin14, status FROM contributions WHERE id = ?`).get(id) as
    | { id: number; gtin14: string | null; status: string }
    | undefined;
  if (!c) return { ok: false, reason: 'not found' };
  if (c.status !== 'pending') return { ok: false, reason: `already ${c.status}` };
  db.prepare(`UPDATE contributions SET status = 'rejected' WHERE id = ?`).run(c.id);
  if (c.gtin14) {
    const others = db.prepare(`SELECT count(*) AS n FROM contributions WHERE gtin14 = ? AND status = 'pending'`).get(c.gtin14) as { n: number };
    const reports = db
      .prepare(`SELECT count(*) AS n FROM product_reports r JOIN products p ON p.id = r.product_id WHERE p.gtin14 = ?`)
      .get(c.gtin14) as { n: number };
    if (!others.n && !reports.n) {
      db.prepare(`UPDATE products SET needs_review = 0 WHERE gtin14 = ?`).run(c.gtin14);
      db.prepare('DELETE FROM scan_cache WHERE gtin14 = ?').run(c.gtin14);
    }
  }
  return { ok: true };
}

/** Shape sent to the app. Parsed nutrition, explicit provenance. */
export function toPublicProduct(p: Product) {
  return {
    id: p.id,
    gtin14: p.gtin14,
    // Cleaned for display only; the stored name stays as imported (search uses it).
    name: displayName(p.name, p.brand, p.category),
    brand: p.brand,
    variant_or_flavor: p.variant_or_flavor,
    size_text: p.size_text,
    ingredients_text: p.ingredients_text,
    allergens_text: p.allergens_text,
    nutrition: p.nutrition_json ? (JSON.parse(p.nutrition_json) as Record<string, unknown>) : null,
    category: p.category,
    // Our cached copy (fast, via Cloudflare) rather than Open Food Facts' slow image server.
    image_url: publicImageUrl(p.id, p.image_url),
    source: p.source,
    source_updated_at: p.source_updated_at,
    verified: !!p.verified,
    under_review: !!p.needs_review,
  };
}
export type PublicProduct = ReturnType<typeof toPublicProduct>;
