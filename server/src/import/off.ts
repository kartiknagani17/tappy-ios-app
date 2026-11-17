import { createReadStream } from 'node:fs';
import { createGunzip } from 'node:zlib';
import type { Readable } from 'node:stream';
import type { DB } from '../db/index.ts';
import { toGtin14Lenient } from '../lib/gtin.ts';
import { upsertSourceRecord, type IncomingRecord } from '../services/products.ts';
import { BatchWriter, clean, finishRun, Progress, readRows, startRun, toNumber, type Logger } from './common.ts';

/** Columns we keep from the ~200-column Open Food Facts export (kept verbatim in raw_json). */
export const OFF_COLUMNS = [
  'code',
  'product_name',
  'generic_name',
  'brands',
  'quantity',
  'countries_tags',
  'ingredients_text',
  'allergens',
  'allergens_en',
  'traces',
  'traces_en',
  'categories_en',
  'main_category_en',
  'image_url',
  'last_modified_t',
  'serving_size',
  'energy-kcal_100g',
  'proteins_100g',
  'fat_100g',
  'saturated-fat_100g',
  'carbohydrates_100g',
  'sugars_100g',
  'fiber_100g',
  'sodium_100g',
  'salt_100g',
] as const;

const NUTRIENTS: Record<string, string> = {
  'energy-kcal_100g': 'energy_kcal',
  proteins_100g: 'protein_g',
  fat_100g: 'fat_g',
  'saturated-fat_100g': 'saturated_fat_g',
  carbohydrates_100g: 'carbohydrate_g',
  sugars_100g: 'sugars_g',
  fiber_100g: 'fiber_g',
  sodium_100g: 'sodium_g',
};

/** "en:milk,en:soybeans" -> "milk, soybeans" */
function tagsToText(v: string | null): string | null {
  if (!v) return null;
  const parts = v
    .split(',')
    .map((t) =>
      t
        .trim()
        .replace(/^[a-z]{2}:/, '')
        .replace(/-/g, ' '),
    )
    .filter(Boolean);
  return parts.length ? [...new Set(parts)].join(', ') : null;
}

/** OFF uses placeholders like "en:null" or "unknown" in some text fields. */
const meaningful = (v: string | null | undefined) => {
  const t = clean(v);
  return t && !/^(?:[a-z]{2}:)?(?:null|unknown|none|undefined)$/i.test(t) ? t : null;
};

export function offRowToRecord(row: Record<string, string>, opts: { requireUs: boolean } = { requireUs: true }): IncomingRecord | null {
  if (opts.requireUs && !(row.countries_tags ?? '').split(',').includes('en:united-states')) return null;
  const gtin14 = toGtin14Lenient(row.code);
  if (!gtin14) return null;
  const name = clean(row.product_name) ?? clean(row.generic_name);
  if (!name) return null;

  const contains = tagsToText(clean(row.allergens_en) ?? clean(row.allergens));
  // Don't repeat under "May contain" what the product definitely contains.
  const containsSet = new Set((contains ?? '').toLowerCase().split(', '));
  const traces = tagsToText(
    (clean(row.traces_en) ?? clean(row.traces) ?? '')
      .split(',')
      .filter((t) => !containsSet.has(t.trim().replace(/^[a-z]{2}:/, '').replace(/-/g, ' ').toLowerCase()))
      .join(','),
  );
  const allergens = [contains && `Contains: ${contains}`, traces && `May contain: ${traces}`].filter(Boolean).join('. ') || null;

  const nutrition: Record<string, number | string> = {};
  for (const [col, key] of Object.entries(NUTRIENTS)) {
    const n = toNumber(row[col]);
    if (n !== null) nutrition[key] = n;
  }
  const hasNutrition = Object.keys(nutrition).length > 0;
  if (hasNutrition) nutrition.basis = 'per_100g';
  if (clean(row.serving_size)) nutrition.serving_size = clean(row.serving_size)!;

  const modified = toNumber(row.last_modified_t);
  const raw: Record<string, string> = {};
  for (const c of OFF_COLUMNS) if (row[c]) raw[c] = row[c];

  return {
    source: 'off',
    gtin14,
    source_record_id: row.code,
    name,
    brand: clean((row.brands ?? '').split(',')[0]),
    variant_or_flavor: null,
    size_text: clean(row.quantity),
    ingredients_text: clean(row.ingredients_text),
    allergens_text: allergens,
    nutrition_json: hasNutrition || nutrition.serving_size ? JSON.stringify(nutrition) : null,
    category: meaningful(row.main_category_en) ?? meaningful((row.categories_en ?? '').split(',')[0]),
    image_url: clean(row.image_url),
    source_updated_at: modified ? new Date(modified * 1000).toISOString() : null,
    raw,
  };
}

/** Stream an OFF export (tab-separated, optionally .gz) and upsert US products. */
export async function importOff(db: DB, file: string, log: Logger = console.log, input?: Readable) {
  const stream = input ?? (file.endsWith('.gz') ? createReadStream(file).pipe(createGunzip()) : createReadStream(file));
  const progress = new Progress('off', log);
  const run = startRun(db, 'off', file);
  const batch = new BatchWriter(db);
  try {
    // The export is TSV without reliable quoting, so quote handling is disabled.
    for await (const row of readRows(stream, { delimiter: '\t', quote: false, skip_records_with_error: true })) {
      progress.tick();
      const rec = offRowToRecord(row);
      if (!rec) {
        progress.skipped++;
        batch.flushIfStale();
        continue;
      }
      batch.run(() => {
        if (upsertSourceRecord(db, rec)) progress.upserted++;
      });
    }
    batch.flush();
    progress.report(true);
    finishRun(db, run, progress, 'done');
    return progress;
  } catch (e) {
    batch.abort();
    finishRun(db, run, progress, 'failed');
    throw e;
  }
}
