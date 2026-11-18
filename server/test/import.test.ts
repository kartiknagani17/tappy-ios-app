import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import type { DB } from '../src/db/index.ts';
import { importOff, offRowToRecord } from '../src/import/off.ts';
import { dirSource, importUsda } from '../src/import/usda.ts';
import { compareRecords, mergeRecords, pickWinner, type SourceRecord } from '../src/lib/merge.ts';
import { getProductByGtin, searchProducts } from '../src/services/products.ts';
import { FIXTURES, testDb } from './helpers.ts';

const quiet = () => {};
const USDA_DIR = path.join(FIXTURES, 'usda');
const OFF_FILE = path.join(FIXTURES, 'off_sample.tsv');

const snapshot = (db: DB) => ({
  products: db.prepare('SELECT gtin14, name, source, ingredients_text, updated_at FROM products ORDER BY gtin14').all(),
  records: db.prepare('SELECT source, gtin14, raw_json, imported_at FROM source_records ORDER BY source, gtin14').all(),
});

describe('USDA import', () => {
  it('joins food, nutrients and branded rows; skips discontinued products', async () => {
    const db = testDb();
    const p = await importUsda(db, dirSource(USDA_DIR), quiet);
    assert.equal(p.read, 6);
    assert.equal(p.skipped, 1); // discontinued crackers
    const bread = getProductByGtin(db, '00013764027503')!;
    assert.equal(bread.name, '21 WHOLE GRAINS AND SEEDS ORGANIC BREAD');
    assert.equal(bread.brand, "DAVE'S KILLER BREAD");
    assert.equal(bread.source, 'usda');
    assert.match(bread.ingredients_text!, /^ORGANIC WHOLE WHEAT/); // "INGREDIENTS:" prefix stripped
    assert.equal(bread.allergens_text, 'Contains: WHEAT');
    const n = JSON.parse(bread.nutrition_json!);
    assert.equal(n.energy_kcal, 260);
    assert.equal(n.sodium_mg, 400);
    assert.equal(n.basis, 'per_100g');
    assert.equal(getProductByGtin(db, '00030000010402'), null);
    // staging tables are cleared afterwards
    assert.equal((db.prepare('SELECT count(*) n FROM usda_nutrient_stage').get() as { n: number }).n, 0);
  });

  it('keeps the newest USDA record when one GTIN appears several times', async () => {
    const db = testDb();
    await importUsda(db, dirSource(USDA_DIR), quiet);
    const rec = db
      .prepare("SELECT source_record_id, source_updated_at FROM source_records WHERE source='usda' AND gtin14='00051500255162'")
      .get() as {
      source_record_id: string;
      source_updated_at: string;
    };
    assert.equal(rec.source_record_id, '1000002');
    assert.equal(rec.source_updated_at, '2025-01-10');
  });

  it('is idempotent: a second run changes nothing', async () => {
    const db = testDb();
    await importUsda(db, dirSource(USDA_DIR), quiet);
    const before = snapshot(db);
    const second = await importUsda(db, dirSource(USDA_DIR), quiet);
    assert.equal(second.upserted, 0);
    assert.deepEqual(snapshot(db), before);
  });
});

describe('Open Food Facts countries', () => {
  const row = (countries: string, extra: Record<string, string> = {}) => ({
    code: '5000168001982',
    product_name: 'Digestive Biscuits',
    countries_tags: countries,
    ...extra,
  });

  it('keeps US, Canada, UK, Mexico and Ireland; skips other markets', () => {
    for (const c of ['en:canada', 'en:united-kingdom', 'en:mexico', 'en:ireland', 'en:france,en:united-kingdom']) {
      assert.ok(offRowToRecord(row(c)), c);
    }
    for (const c of ['en:france', 'en:germany,en:spain', '']) assert.equal(offRowToRecord(row(c)), null, c);
    assert.ok(offRowToRecord(row('en:france'), { requireCountry: false }));
  });

  it('derives sodium from salt when the label has no sodium (UK/EU)', () => {
    const n = JSON.parse(offRowToRecord(row('en:united-kingdom', { salt_100g: '1.25' }))!.nutrition_json!);
    assert.equal(n.sodium_g, 0.5);
    const us = JSON.parse(offRowToRecord(row('en:united-states', { salt_100g: '1.25', 'sodium_100g': '0.4' }))!.nutrition_json!);
    assert.equal(us.sodium_g, 0.4);
  });
});

describe('Open Food Facts import', () => {
  it('imports US products only and skips invalid barcodes', async () => {
    const db = testDb();
    const p = await importOff(db, OFF_FILE, quiet);
    assert.equal(p.read, 6);
    assert.equal(p.upserted, 4);
    assert.equal(p.skipped, 2);
    assert.equal(getProductByGtin(db, '03017620422003'), null); // France/Germany only
    const pretzels = getProductByGtin(db, '00041196910506')!;
    assert.equal(pretzels.source, 'off');
    assert.equal(pretzels.allergens_text, 'Contains: milk. May contain: Soybeans');
    assert.equal(pretzels.source_updated_at, new Date(1745000000 * 1000).toISOString());
  });

  it('is idempotent', async () => {
    const db = testDb();
    await importOff(db, OFF_FILE, quiet);
    const before = snapshot(db);
    const second = await importOff(db, OFF_FILE, quiet);
    assert.equal(second.upserted, 0);
    assert.deepEqual(snapshot(db), before);
  });

  it('records each run in import_runs', async () => {
    const db = testDb();
    await importOff(db, OFF_FILE, quiet);
    const run = db.prepare('SELECT status, rows_read, rows_upserted FROM import_runs').get() as Record<string, unknown>;
    assert.deepEqual({ ...run }, { status: 'done', rows_read: 6, rows_upserted: 4 });
  });
});

describe('source-priority merging', () => {
  const base: SourceRecord = {
    source: 'usda',
    gtin14: '00000000000000',
    source_record_id: '1',
    name: 'X',
    brand: null,
    variant_or_flavor: null,
    size_text: null,
    ingredients_text: 'a, b',
    allergens_text: null,
    nutrition_json: null,
    category: null,
    image_url: null,
    source_updated_at: '2025-01-01',
  };
  const usda = (o: Partial<SourceRecord>) => ({ ...base, ...o, source: 'usda' as const });
  const off = (o: Partial<SourceRecord>) => ({ ...base, ...o, source: 'off' as const });

  it('prefers the record that has ingredients', () => {
    assert.equal(pickWinner([usda({ ingredients_text: null, source_updated_at: '2026-01-01' }), off({})])!.source, 'off');
  });
  it('then the newest update', () => {
    assert.equal(pickWinner([usda({}), off({ source_updated_at: '2025-06-01T10:00:00.000Z' })])!.source, 'off');
    assert.equal(
      pickWinner([usda({ source_updated_at: '2025-07-01' }), off({ source_updated_at: '2025-06-01T10:00:00.000Z' })])!.source,
      'usda',
    );
  });
  it('ties go to USDA (same calendar day)', () => {
    assert.equal(pickWinner([off({ source_updated_at: '2025-01-01T23:00:00.000Z' }), usda({})])!.source, 'usda');
    assert.ok(compareRecords(usda({}), off({})) < 0);
  });
  it('fills missing fields from the other source but never mixes ingredients', () => {
    const m = mergeRecords([
      usda({ image_url: null }),
      off({ ingredients_text: 'other', image_url: 'http://img', source_updated_at: '2024-01-01' }),
    ])!;
    assert.equal(m.source, 'usda');
    assert.equal(m.ingredients_text, 'a, b');
    assert.equal(m.image_url, 'http://img');
    assert.deepEqual(m.filled_from, ['off']);
  });

  it('applies the rules end to end across both imports, in either order', async () => {
    for (const order of [
      ['usda', 'off'],
      ['off', 'usda'],
    ]) {
      const db = testDb();
      for (const s of order) {
        if (s === 'usda') await importUsda(db, dirSource(USDA_DIR), quiet);
        else await importOff(db, OFF_FILE, quiet);
      }
      // Peanut butter: newest USDA record has no ingredients; OFF does -> OFF wins.
      assert.equal(getProductByGtin(db, '00051500255162')!.source, 'off', order.join('>'));
      // Bread: OFF lacks ingredients -> USDA wins, image filled from OFF.
      const bread = getProductByGtin(db, '00013764027503')!;
      assert.equal(bread.source, 'usda');
      assert.equal(bread.image_url, 'https://images.openfoodfacts.org/dkb.jpg');
      // Chips: both have ingredients, same day -> USDA.
      assert.equal(getProductByGtin(db, '00028400090896')!.source, 'usda');
      // Raw source fields are kept for both sources.
      assert.equal((db.prepare("SELECT count(*) n FROM source_records WHERE gtin14='00051500255162'").get() as { n: number }).n, 2);
    }
  });

  it('keeps the search index in sync', async () => {
    const db = testDb();
    await importUsda(db, dirSource(USDA_DIR), quiet);
    await importOff(db, OFF_FILE, quiet);
    const hits = searchProducts(db, { brand: 'Daves Killer', name: 'whole grains seeds' });
    assert.equal(hits[0].gtin14, '00013764027503');
    assert.equal(searchProducts(db, { name: 'yogurt pretzels' })[0].gtin14, '00041196910506');
  });
});
