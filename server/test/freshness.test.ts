import assert from 'node:assert/strict';
import path from 'node:path';
import { Readable } from 'node:stream';
import { describe, it } from 'node:test';
import { gzipSync } from 'node:zlib';
import { importOff } from '../src/import/off.ts';
import { importOffDeltaStream, parseDeltaIndex, pendingDeltaFiles, updateOffFromDeltas } from '../src/import/off-delta.ts';
import { offJsonToRow, tagToName } from '../src/import/off-json.ts';
import { dirSource, importUsda } from '../src/import/usda.ts';
import { findNewUsdaRelease, newestUsdaRelease } from '../src/import/usda-latest.ts';
import { ingredientSimilarity, sameIngredients } from '../src/lib/ingredients-diff.ts';
import { cleanName, displayName, pickName } from '../src/lib/names.ts';
import { approveContribution, getProductByGtin, rebuildProduct, rejectContribution, toPublicProduct } from '../src/services/products.ts';
import { ScanService } from '../src/services/scan.ts';
import type { IncomingRecord } from '../src/services/products.ts';
import { FIXTURES, labelJson, makeScan, MockVisionProvider, packagePhoto, testConfig, testDb } from './helpers.ts';

const quiet = () => {};
async function seededDb() {
  const db = testDb();
  await importUsda(db, dirSource(path.join(FIXTURES, 'usda')), quiet);
  await importOff(db, path.join(FIXTURES, 'off_sample.tsv'), quiet);
  return db;
}

describe('display names', () => {
  it('drops photo words, fixes case, and replaces names that aren’t names', () => {
    assert.equal(displayName('oreo cookies shelf', 'Oreo, Nabisco', null), 'Oreo Cookies');
    assert.equal(displayName('CREAMY PEANUT BUTTER', 'Jif', null), 'Creamy Peanut Butter');
    assert.equal(displayName('My Bff', 'Cheerios', 'Breakfast cereals'), 'Cheerios breakfast cereals');
    assert.equal(displayName('ain saiss 50cl', null, null), 'Ain Saiss 50cl');
    assert.equal(displayName('mac & cheese', 'Kraft', null), 'Mac & Cheese');
  });

  it('leaves good names alone', () => {
    for (const n of ['Creamy Peanut Butter', 'Snickers', "Lay's Classic Potato Chips", 'Coca-Cola Zero Sugar', 'iPhone-shaped Gummies']) {
      assert.equal(displayName(n, 'Brand', 'Category'), n);
    }
  });

  it('reports what kind of fix it made', () => {
    assert.deepEqual(cleanName('Snickers', 'Mars', null), { name: 'Snickers', fix: 'unchanged' });
    assert.equal(cleanName('oreo cookies shelf', 'Oreo', null).fix, 'trimmed+case');
    assert.equal(cleanName('Oreo Cookies shelf', 'Oreo', null).fix, 'trimmed');
    assert.equal(cleanName('OREO COOKIES', 'Oreo', null).fix, 'case');
    assert.equal(cleanName('My Bff', 'Cheerios', 'Cereals').fix, 'replaced');
    assert.equal(cleanName('x', null, null).fix, 'junk_kept');
  });

  it('doesn’t mistake real names for junk (cases the full-database report caught)', () => {
    assert.equal(cleanName('Food Coloring', '365 Whole Foods Market', 'Food colorings').fix, 'unchanged');
    assert.equal(cleanName('餅', null, null).fix, 'unchanged');
    assert.equal(cleanName('7 up', 'Pepsi-Cola', 'Sodas').name, '7 Up');
    assert.equal(cleanName('My Deli Sandwich', 'Pilot', 'Sandwiches').fix, 'unchanged');
    assert.equal(cleanName('My Steak', 'My', null).fix, 'unchanged');
    assert.equal(cleanName('Unknown Food Item', 'Aldi', null).fix, 'replaced');
    assert.equal(cleanName('3948764032905', 'Brand', null).fix, 'replaced');
  });

  it('keeps real endings that look like photo words', () => {
    for (const n of [
      'Apple Juice From Concentrate With Added Ingredients',
      'Black tea - Red Label',
      'Atlantic Salmon Side',
      'Complete Daily Nutrition',
    ]) {
      assert.equal(cleanName(n, null, null).name, n);
    }
  });

  it('drops a repeated flavor at the end of USDA names', () => {
    assert.equal(cleanName('SWEET TERIYAKI BEEF JERKY, SWEET TERIYAKI', null, null).name, 'Sweet Teriyaki Beef Jerky');
    assert.equal(
      cleanName('GHIRARDELLI, SQUARES, FILLED CHOCOLATE, MOCHA, MILK & CARAMEL, MOCHA, MILK & CARAMEL', null, null).name,
      'Ghirardelli, Squares, Filled Chocolate, Mocha, Milk & Caramel',
    );
    assert.equal(cleanName('SQUIRT, CITRUS SODA', null, null).name, 'Squirt, Citrus Soda');
    assert.equal(cleanName('LIGHT RED KIDNEY BEANS, LIGHT RED KIDNEY', null, null).fix, 'deduped+case');
  });

  it('picks a real name from another source instead of a junk one', () => {
    assert.equal(pickName(['My Bff', 'CHEERIOS TOASTED WHOLE GRAIN OAT CEREAL']), 'CHEERIOS TOASTED WHOLE GRAIN OAT CEREAL');
    assert.equal(pickName(['Creamy Peanut Butter', 'PEANUT BUTTER']), 'Creamy Peanut Butter');
    assert.equal(pickName(['My Bff']), 'My Bff');
    assert.equal(pickName([null, '']), null);
  });

  it('stores the USDA name when the Open Food Facts name is junk', async () => {
    const db = await seededDb();
    const gtin = '00013764027503';
    db.prepare(`UPDATE source_records SET name = 'My Bff', source_updated_at = '2099-01-01' WHERE gtin14 = ? AND source = 'off'`).run(gtin);
    const usdaName = (db.prepare(`SELECT name FROM source_records WHERE gtin14 = ? AND source = 'usda'`).get(gtin) as { name: string }).name;
    assert.equal(rebuildProduct(db, gtin)!.name, usdaName);
  });

  it('is what the app receives, while the stored name is unchanged', async () => {
    const db = await seededDb();
    const p = getProductByGtin(db, '00051500255162')!;
    db.prepare('UPDATE products SET name = ? WHERE id = ?').run('creamy peanut butter front', p.id);
    const stored = getProductByGtin(db, '00051500255162')!;
    assert.equal(stored.name, 'creamy peanut butter front');
    assert.equal(toPublicProduct(stored).name, 'Creamy Peanut Butter');
  });
});

describe('same recipe?', () => {
  it('ignores punctuation, case and a leading "Ingredients:"', () => {
    assert.ok(sameIngredients('Roasted peanuts, sugar, salt.', 'INGREDIENTS: ROASTED PEANUTS; SUGAR; SALT'));
  });
  it('notices a changed or added ingredient, even one word in a long list', () => {
    assert.ok(!sameIngredients('Roasted peanuts, sugar, salt', 'Roasted peanuts, sugar, palm oil, salt'));
    const long =
      'Enriched flour, wheat flour, niacin, reduced iron, thiamine mononitrate, riboflavin, folic acid, sugar, palm oil, canola oil, cocoa, high fructose corn syrup, leavening, baking soda, calcium phosphate, salt, soy lecithin, chocolate, artificial flavor';
    assert.ok(!sameIngredients(long, `${long}, sesame`));
    assert.ok(ingredientSimilarity(long, `${long}, sesame`) > 0.9); // why overlap alone isn't enough
  });

  it('forgives a one-letter misread from the photo', () => {
    assert.ok(sameIngredients('Roasted peanuts, sugar, molasses, salt', 'Roasted peanuts, sugar, molases, salt'));
    assert.ok(!sameIngredients('Roasted peanuts, sugar, salt', 'Roasted peanuts, sugar, malt'));
  });
});

const usProduct = (code: string, extra: Record<string, unknown> = {}) => ({
  code,
  product_name: 'Crunchy Peanut Butter',
  brands: 'Nutty Farms',
  ingredients_text: 'Roasted peanuts, sugar, palm oil, salt',
  allergens_tags: ['en:peanuts'],
  main_category: 'en:peanut-butters',
  countries_tags: ['en:united-states'],
  last_modified_t: 1790000000,
  ...extra,
});
const gz = (lines: string[]) => Readable.from(gzipSync(Buffer.from(lines.join('\n'))));

describe('Open Food Facts daily updates', () => {
  it('maps JSON products like the bulk CSV (English fields, category name, allergen tags)', () => {
    const row = offJsonToRow(
      usProduct('0051500255162', { product_name: 'Beurre', product_name_en: 'Peanut Butter', ingredients_text_en: 'Peanuts' }),
      '0051500255162',
    );
    assert.equal(row.product_name, 'Peanut Butter');
    assert.equal(row.ingredients_text, 'Peanuts');
    assert.equal(row.main_category_en, 'Peanut butters');
    assert.equal(row.allergens, 'en:peanuts');
    assert.equal(tagToName('fr:pates'), '');
  });

  it('lists daily files oldest first and skips ones already applied or older than the last full import', () => {
    const files = parseDeltaIndex(
      'openfoodfacts_products_1790000000_1790086400.json.gz\nopenfoodfacts_products_1789913600_1790000000.json.gz\nindex.html\n',
    );
    assert.deepEqual(files, ['openfoodfacts_products_1789913600_1790000000.json.gz', 'openfoodfacts_products_1790000000_1790086400.json.gz']);
    const db = testDb();
    assert.deepEqual(pendingDeltaFiles(db, files), files);
    db.prepare(`INSERT INTO import_runs (source, file, status) VALUES ('off_delta', ?, 'done')`).run(files[0]);
    assert.deepEqual(pendingDeltaFiles(db, files), [files[1]]);
    db.prepare(`INSERT INTO import_runs (source, file, status, started_at) VALUES ('off', 'full.csv.gz', 'done', ?)`).run(
      new Date(1790086400 * 1000 + 3 * 86400_000).toISOString(),
    );
    assert.deepEqual(pendingDeltaFiles(db, files), []);
  });

  it('updates US products, skips others and broken lines', async () => {
    const db = await seededDb();
    const p = await importOffDeltaStream(
      db,
      'd1.json.gz',
      gz([
        JSON.stringify(usProduct('0051500255162')),
        JSON.stringify(usProduct('3017620422003', { countries_tags: ['en:france'] })),
        '{not json',
      ]),
      quiet,
    );
    assert.equal(p.upserted, 1);
    assert.equal(p.skipped, 2);
    const pb = getProductByGtin(db, '00051500255162')!;
    assert.equal(pb.ingredients_text, 'Roasted peanuts, sugar, palm oil, salt');
    assert.equal(pb.category, 'Peanut butters');
    assert.equal(getProductByGtin(db, '03017620422003'), null);
  });

  it('downloads only what is new, and is a no-op the second time', async () => {
    const db = await seededDb();
    const now = Math.floor(Date.now() / 1000);
    const file = `openfoodfacts_products_${now - 86400}_${now}.json.gz`;
    const body = gzipSync(Buffer.from(JSON.stringify(usProduct('0051500255162'))));
    const requested: string[] = [];
    const fetchImpl = (async (url: string) => {
      requested.push(url);
      if (url.endsWith('index.txt')) return new Response(`${file}\n`);
      if (url.endsWith(file)) return new Response(body);
      return new Response('', { status: 404 });
    }) as unknown as typeof fetch;
    assert.equal(await updateOffFromDeltas(db, { userAgent: 't', fetchImpl, base: 'https://x.test/' }, quiet), 1);
    assert.equal(await updateOffFromDeltas(db, { userAgent: 't', fetchImpl, base: 'https://x.test/' }, quiet), 0);
    assert.equal(requested.filter((u) => u.endsWith(file)).length, 1);
  });
});

describe('USDA releases', () => {
  const page = `<a href="/fdc-datasets/FoodData_Central_branded_food_csv_2026-04-30.zip">x</a>
    <a href="/fdc-datasets/FoodData_Central_branded_food_csv_2026-10-29.zip">y</a>
    <a href="/fdc-datasets/FoodData_Central_foundation_food_csv_2026-12-01.zip">z</a>`;
  const fetchImpl = (async () => new Response(page)) as unknown as typeof fetch;

  it('finds the newest Branded Foods file on the download page', () => {
    assert.deepEqual(newestUsdaRelease(page), {
      name: 'FoodData_Central_branded_food_csv_2026-10-29.zip',
      date: '2026-10-29',
      url: 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_branded_food_csv_2026-10-29.zip',
    });
    assert.equal(newestUsdaRelease('<html></html>'), null);
  });

  it('only reports a release that hasn’t been imported yet', async () => {
    const db = testDb();
    assert.equal((await findNewUsdaRelease(db, { userAgent: 't', fetchImpl }))?.date, '2026-10-29');
    db.prepare(`INSERT INTO import_runs (source, file, status) VALUES ('usda', ?, 'done')`).run(
      '/var/lib/tappy/raw/FoodData_Central_branded_food_csv_2026-10-29.zip',
    );
    assert.equal(await findNewUsdaRelease(db, { userAgent: 't', fetchImpl }), null);
  });
});

describe('refreshing old products from Open Food Facts', () => {
  const freshRecord = (gtin14: string): IncomingRecord => ({
    source: 'off',
    gtin14,
    source_record_id: gtin14.slice(1),
    name: 'Creamy Peanut Butter',
    brand: 'Nutty Farms',
    variant_or_flavor: null,
    size_text: '16 oz',
    ingredients_text: 'Roasted peanuts, sugar, salt',
    allergens_text: 'Contains: peanuts',
    nutrition_json: null,
    category: 'Peanut butters',
    image_url: null,
    source_updated_at: new Date().toISOString(),
    raw: {},
  });

  function scanWithLive(db: ReturnType<typeof testDb>, lookups: string[]) {
    const config = testConfig({ offLiveLookup: true, offRefreshAfterDays: 180 });
    const { vision } = makeScan(db, new MockVisionProvider(), config);
    const offLive = {
      lookup: async (g: string) => {
        lookups.push(g);
        return freshRecord(g);
      },
    } as unknown as ConstructorParameters<typeof ScanService>[0]['offLive'];
    return new ScanService({ db, config, vision, offLive });
  }

  it('fetches the current recipe when our copy is old, then not again for a week', async () => {
    const db = await seededDb();
    db.prepare(`UPDATE products SET source_updated_at = '2020-01-01' WHERE gtin14 = '00051500255162'`).run();
    db.prepare(`UPDATE source_records SET source_updated_at = '2020-01-01' WHERE gtin14 = '00051500255162'`).run();
    const lookups: string[] = [];
    const scan = scanWithLive(db, lookups);
    const r = await scan.resolveBarcode('051500255162', 'u-12345678');
    assert.equal(r.status === 'found' && r.via, 'off_refresh');
    assert.equal(r.status === 'found' && r.product.ingredients_text, 'Roasted peanuts, sugar, salt');
    db.prepare('DELETE FROM scan_cache').run();
    await scan.resolveBarcode('051500255162', 'u-12345678');
    assert.equal(lookups.length, 1);
  });

  it('leaves recent products alone', async () => {
    const db = await seededDb();
    db.prepare(`UPDATE products SET source_updated_at = ? WHERE gtin14 = '00051500255162'`).run(new Date().toISOString());
    const lookups: string[] = [];
    const r = await scanWithLive(db, lookups).resolveBarcode('051500255162', 'u-12345678');
    assert.equal(r.status === 'found' && r.via, 'db');
    assert.equal(lookups.length, 0);
  });
});

describe('newer label photos', () => {
  it('a matching photo confirms our data; nothing goes to review', async () => {
    const db = await seededDb();
    const current = getProductByGtin(db, '00013764027503')!;
    const provider = new MockVisionProvider([{ text: labelJson({ ingredients_text: current.ingredients_text!.toUpperCase() }) }]);
    const { scan } = makeScan(db, provider);
    const r = await scan.scanLabel(await packagePhoto(31), 'u-12345678', { gtin: '013764027503', recheck: true });
    assert.equal(r.status, 'existing_product');
    assert.equal(provider.calls.length, 1);
    assert.equal(getProductByGtin(db, '00013764027503')!.needs_review, 0);
  });

  it('a different recipe goes to review; the photographer sees it, others see "under review"', async () => {
    const db = await seededDb();
    const { scan } = makeScan(db, new MockVisionProvider([{ text: labelJson({ ingredients_text: 'Whole wheat flour, water, sesame seeds' }) }]));
    const r = await scan.scanLabel(await packagePhoto(32), 'u-12345678', { gtin: '013764027503', recheck: true });
    assert.equal(r.status, 'contributed');
    assert.equal(getProductByGtin(db, '00013764027503')!.needs_review, 1);

    const mine = await scan.resolveBarcode('013764027503', 'u-12345678');
    assert.equal(mine.status === 'found' && mine.via, 'contribution');
    const theirs = await scan.resolveBarcode('013764027503', 'u-87654321');
    assert.equal(theirs.status === 'found' && theirs.product.under_review, true);
    assert.notEqual(theirs.status === 'found' && theirs.product.ingredients_text, 'Whole wheat flour, water, sesame seeds');
  });

  it('approving makes it everyone’s data, and imports don’t overwrite it', async () => {
    const db = await seededDb();
    const { scan } = makeScan(db, new MockVisionProvider([{ text: labelJson({ ingredients_text: 'Whole wheat flour, water, sesame seeds' }) }]));
    await scan.scanLabel(await packagePhoto(33), 'u-12345678', { gtin: '013764027503', recheck: true });
    const id = (db.prepare('SELECT id FROM contributions').get() as { id: number }).id;
    const out = approveContribution(db, id);
    assert.ok(out.ok);
    const p = getProductByGtin(db, '00013764027503')!;
    assert.deepEqual([p.ingredients_text, p.source, p.verified, p.needs_review], ['Whole wheat flour, water, sesame seeds', 'ocr', 1, 0]);
    await importUsda(db, dirSource(path.join(FIXTURES, 'usda')), quiet);
    assert.equal(getProductByGtin(db, '00013764027503')!.ingredients_text, 'Whole wheat flour, water, sesame seeds');
    assert.deepEqual(approveContribution(db, id), { ok: false, reason: 'already approved' });
  });

  it('rejecting takes the product out of review', async () => {
    const db = await seededDb();
    const { scan } = makeScan(db, new MockVisionProvider([{ text: labelJson({ ingredients_text: 'Whole wheat flour, water, sesame seeds' }) }]));
    await scan.scanLabel(await packagePhoto(34), 'u-12345678', { gtin: '013764027503', recheck: true });
    const id = (db.prepare('SELECT id FROM contributions').get() as { id: number }).id;
    assert.ok(rejectContribution(db, id).ok);
    assert.equal(getProductByGtin(db, '00013764027503')!.needs_review, 0);
    const again = await scan.resolveBarcode('013764027503', 'u-12345678');
    assert.equal(again.status === 'found' && again.via, 'db');
  });
});
