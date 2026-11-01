import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import type { Readable } from 'node:stream';
import yauzl from 'yauzl';
import type { DB } from '../db/index.ts';
import { toGtin14Lenient } from '../lib/gtin.ts';
import { upsertSourceRecord } from '../services/products.ts';
import { BatchWriter, clean, extractContainsStatement, finishRun, Progress, readRows, startRun, toNumber, type Logger } from './common.ts';

/** FoodData Central nutrient ids we keep (branded values are per 100 g / 100 ml). */
export const USDA_NUTRIENTS: Record<string, string> = {
  '1008': 'energy_kcal',
  '1003': 'protein_g',
  '1004': 'fat_g',
  '1258': 'saturated_fat_g',
  '1005': 'carbohydrate_g',
  '2000': 'sugars_g',
  '1235': 'added_sugars_g',
  '1079': 'fiber_g',
  '1093': 'sodium_mg',
};

/** Opens a named CSV from either an extracted folder or the original .zip, as a stream. */
export interface CsvSource {
  open(name: string): Promise<Readable>;
  close(): void;
  describe: string;
}

export function dirSource(dir: string): CsvSource {
  const find = (d: string, name: string): string | null => {
    for (const entry of readdirSync(d)) {
      const p = path.join(d, entry);
      if (entry === name) return p;
      if (statSync(p).isDirectory()) {
        const nested = find(p, name);
        if (nested) return nested;
      }
    }
    return null;
  };
  return {
    describe: dir,
    async open(name) {
      const p = find(dir, name);
      if (!p) throw new Error(`${name} not found under ${dir}`);
      return createReadStream(p);
    },
    close() {},
  };
}

export async function zipSource(file: string): Promise<CsvSource> {
  const zip = await new Promise<yauzl.ZipFile>((resolve, reject) =>
    yauzl.open(file, { lazyEntries: true, autoClose: false }, (err, z) => (err ? reject(err) : resolve(z!))),
  );
  const entries = new Map<string, yauzl.Entry>();
  await new Promise<void>((resolve, reject) => {
    zip.on('entry', (e: yauzl.Entry) => {
      entries.set(path.basename(e.fileName), e);
      zip.readEntry();
    });
    zip.on('end', () => resolve());
    zip.on('error', reject);
    zip.readEntry();
  });
  return {
    describe: file,
    open(name) {
      const entry = entries.get(name);
      if (!entry) return Promise.reject(new Error(`${name} not found in ${file}`));
      return new Promise((resolve, reject) => zip.openReadStream(entry, (err, s) => (err ? reject(err) : resolve(s!))));
    },
    close: () => zip.close(),
  };
}

export async function openUsdaSource(p: string): Promise<CsvSource> {
  if (!existsSync(p)) throw new Error(`USDA data not found at ${p}. Run "npm run data:download" first.`);
  return statSync(p).isDirectory() ? dirSource(p) : zipSource(p);
}

export type UsdaBrandedRow = Record<string, string>;

export function usdaRowToRecord(
  row: UsdaBrandedRow,
  food: { description: string | null; publication_date: string | null } | undefined,
  nutrients: Record<string, number>,
) {
  if (clean(row.discontinued_date)) return null;
  const country = clean(row.market_country);
  if (country && country !== 'United States') return null;
  const gtin14 = toGtin14Lenient(row.gtin_upc);
  if (!gtin14) return null;
  const name = clean(food?.description) ?? clean(row.short_description);
  if (!name) return null;

  const ingredients = clean(row.ingredients)?.replace(/^ingredients?\s*:\s*/i, '') ?? null;
  const nutrition: Record<string, unknown> = { ...nutrients };
  if (Object.keys(nutrients).length) nutrition.basis = 'per_100g';
  const serving = toNumber(row.serving_size);
  if (serving !== null) nutrition.serving_size = `${serving} ${clean(row.serving_size_unit) ?? ''}`.trim();
  if (clean(row.household_serving_fulltext)) nutrition.household_serving = clean(row.household_serving_fulltext);

  return {
    source: 'usda' as const,
    gtin14,
    source_record_id: row.fdc_id,
    name,
    brand: clean(row.brand_name) ?? clean(row.brand_owner),
    variant_or_flavor: clean(row.subbrand_name),
    size_text: clean(row.package_weight),
    ingredients_text: ingredients,
    allergens_text: extractContainsStatement(ingredients),
    nutrition_json: Object.keys(nutrition).length ? JSON.stringify(nutrition) : null,
    category: clean(row.branded_food_category),
    image_url: null,
    source_updated_at: clean(row.modified_date) ?? clean(row.available_date) ?? clean(food?.publication_date),
    raw: { ...row, description: food?.description ?? null, nutrients },
  };
}

/**
 * Three streaming passes, joined on fdc_id through SQLite staging tables:
 *   food.csv          -> usda_food_stage     (branded descriptions)
 *   food_nutrient.csv -> usda_nutrient_stage (only the nutrients above)
 *   branded_food.csv  -> source_records + products
 */
export async function importUsda(db: DB, source: CsvSource, log: Logger = console.log, opts: { keepStage?: boolean } = {}) {
  const run = startRun(db, 'usda', source.describe);
  const progress = new Progress('usda branded_food', log);
  try {
    db.exec('DELETE FROM usda_food_stage; DELETE FROM usda_nutrient_stage;');

    // Pass 1: descriptions
    {
      const p = new Progress('usda food', log, 250_000);
      const batch = new BatchWriter(db, 5000);
      const ins = db.prepare('INSERT OR REPLACE INTO usda_food_stage (fdc_id, description, publication_date) VALUES (?, ?, ?)');
      for await (const row of readRows(await source.open('food.csv'))) {
        p.tick();
        if (row.data_type !== 'branded_food') continue;
        batch.run(() => ins.run(Number(row.fdc_id), clean(row.description), clean(row.publication_date)));
      }
      batch.flush();
      p.report(true);
    }

    // Pass 2: nutrients
    {
      const p = new Progress('usda food_nutrient', log, 1_000_000);
      const batch = new BatchWriter(db, 10_000);
      const ins = db.prepare('INSERT OR REPLACE INTO usda_nutrient_stage (fdc_id, key, amount) VALUES (?, ?, ?)');
      for await (const row of readRows(await source.open('food_nutrient.csv'))) {
        p.tick();
        const key = USDA_NUTRIENTS[row.nutrient_id];
        const amount = toNumber(row.amount);
        if (!key || amount === null) continue;
        batch.run(() => ins.run(Number(row.fdc_id), key, amount));
      }
      batch.flush();
      p.report(true);
    }

    // Pass 3: branded products
    const getFood = db.prepare('SELECT description, publication_date FROM usda_food_stage WHERE fdc_id = ?');
    const getNutrients = db.prepare('SELECT key, amount FROM usda_nutrient_stage WHERE fdc_id = ?');
    const batch = new BatchWriter(db);
    for await (const row of readRows(await source.open('branded_food.csv'))) {
      progress.tick();
      const fdcId = Number(row.fdc_id);
      const food = getFood.get(fdcId) as { description: string | null; publication_date: string | null } | undefined;
      const nutrients = Object.fromEntries((getNutrients.all(fdcId) as { key: string; amount: number }[]).map((n) => [n.key, n.amount]));
      const rec = usdaRowToRecord(row, food, nutrients);
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
    if (!opts.keepStage) db.exec('DELETE FROM usda_food_stage; DELETE FROM usda_nutrient_stage;');
    finishRun(db, run, progress, 'done');
    return progress;
  } catch (e) {
    finishRun(db, run, progress, 'failed');
    throw e;
  } finally {
    source.close();
  }
}
