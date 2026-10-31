import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import sharp from 'sharp';
import { importOff } from '../src/import/off.ts';
import { dirSource, importUsda } from '../src/import/usda.ts';
import { hammingDistance, perceptualHash } from '../src/lib/image.ts';
import { setScanCache } from '../src/services/cache.ts';
import { getProductByGtin, rebuildProduct, reportProduct } from '../src/services/products.ts';
import { FIXTURES, frontJson, labelJson, makeScan, MockVisionProvider, packagePhoto, testConfig, testDb } from './helpers.ts';

const quiet = () => {};
async function seededDb() {
  const db = testDb();
  await importUsda(db, dirSource(path.join(FIXTURES, 'usda')), quiet);
  await importOff(db, path.join(FIXTURES, 'off_sample.tsv'), quiet);
  return db;
}

describe('barcode lookup + scan_cache', () => {
  it('UPC-A and EAN-13 forms resolve to the same product', async () => {
    const db = await seededDb();
    const { scan } = makeScan(db, new MockVisionProvider());
    const a = await scan.resolveBarcode('013764027503', 'user-aaaaaaaa');
    const b = await scan.resolveBarcode('0013764027503', 'user-aaaaaaaa');
    assert.equal(a.status, 'found');
    assert.equal(b.status, 'found');
    if (a.status === 'found' && b.status === 'found') assert.equal(a.product.id, b.product.id);
  });

  it('miss -> DB -> then served from cache', async () => {
    const db = await seededDb();
    const { scan } = makeScan(db, new MockVisionProvider());
    const first = await scan.resolveBarcode('013764027503', 'u-12345678');
    assert.equal(first.status === 'found' && first.via, 'db');
    const second = await scan.resolveBarcode('013764027503', 'u-12345678');
    assert.equal(second.status === 'found' && second.via, 'cache');
    assert.equal(second.status === 'found' && second.from_cache, true);
  });

  it('caches negative lookups with the short TTL and returns needs_label_photo (not an error)', async () => {
    const db = await seededDb();
    const { scan, config } = makeScan(db, new MockVisionProvider());
    const first = await scan.resolveBarcode('036000291452', 'u-12345678');
    assert.deepEqual(first, { status: 'needs_label_photo', gtin14: '00036000291452', from_cache: false });
    const row = db.prepare('SELECT found, expires_at - created_at AS ttl FROM scan_cache WHERE gtin14 = ?').get('00036000291452') as {
      found: number;
      ttl: number;
    };
    assert.equal(row.found, 0);
    assert.equal(row.ttl, config.scanCacheNegativeTtlSeconds);
    const second = await scan.resolveBarcode('036000291452', 'u-12345678');
    assert.equal(second.status === 'needs_label_photo' && second.from_cache, true);
  });

  it('expired cache entries are ignored', async () => {
    const db = await seededDb();
    const { scan } = makeScan(db, new MockVisionProvider());
    setScanCache(db, '00036000291452', false, null, -1);
    const r = await scan.resolveBarcode('036000291452', 'u-12345678');
    assert.equal(r.status === 'needs_label_photo' && r.from_cache, false);
  });

  it('product changes and reports invalidate the cached result', async () => {
    const db = await seededDb();
    const { scan } = makeScan(db, new MockVisionProvider());
    await scan.resolveBarcode('013764027503', 'u-12345678');
    const p = getProductByGtin(db, '00013764027503')!;
    reportProduct(db, p.id, 'u-12345678', 'wrong ingredients');
    const after = await scan.resolveBarcode('013764027503', 'u-12345678');
    assert.equal(after.status === 'found' && after.via, 'db');
    assert.equal(after.status === 'found' && after.product.under_review, true);
    assert.equal(getProductByGtin(db, '00013764027503')!.report_count, 1);
    rebuildProduct(db, '00013764027503');
  });

  it('invalid barcodes are rejected without touching the database', async () => {
    const db = await seededDb();
    const { scan } = makeScan(db, new MockVisionProvider());
    assert.deepEqual(await scan.resolveBarcode('036000291453', 'u-12345678'), { status: 'invalid_barcode', reason: 'check_digit' });
  });
});

describe('front-of-package photo', () => {
  it('matches by text, and the repeat photo is served from vision_cache without a model call', async () => {
    const db = await seededDb();
    const provider = new MockVisionProvider([
      { text: frontJson({ brand: "Dave's Killer Bread", product_name: '21 Whole Grains and Seeds Organic Bread', size_text: '27 oz' }) },
    ]);
    const { scan } = makeScan(db, provider);
    const photo = await packagePhoto(1);
    const first = await scan.scanFront(photo, 'u-12345678');
    assert.equal(first.status, 'match');
    if (first.status !== 'match') return;
    assert.equal(first.decision, 'confirm_top');
    assert.equal(first.requires_confirmation, true);
    assert.equal(first.candidates[0].product.gtin14, '00013764027503');
    assert.equal(provider.calls.length, 1);

    // Same package photographed again (re-encoded, slightly smaller): cache hit.
    const again = await sharp(photo).resize(1200).jpeg({ quality: 60 }).toBuffer();
    const second = await scan.scanFront(again, 'u-12345678');
    assert.equal(provider.calls.length, 1, 'no second vision call');
    assert.equal(second.status, 'match');

    // After the user confirms, the repeat photo pre-selects the confirmed product.
    scan.confirmFront(first.vision_cache_id!, first.candidates[0].product.id);
    const third = await scan.scanFront(again, 'u-12345678');
    assert.equal(third.status === 'match' && third.via, 'cache');
  });

  it('uses a barcode visible in the photo before text search', async () => {
    const db = await seededDb();
    const provider = new MockVisionProvider([
      { text: frontJson({ brand: 'Whatever', product_name: 'Blurry', barcode_if_visible: '028400090896' }) },
    ]);
    const { scan } = makeScan(db, provider);
    const r = await scan.scanFront(await packagePhoto(2), 'u-12345678');
    assert.equal(r.status === 'match' && r.via, 'barcode_in_photo');
    assert.equal(r.status === 'match' && r.candidates[0].product.gtin14, '00028400090896');
  });

  it('low score asks for barcode or ingredient photo; non-food photos are rejected', async () => {
    const db = await seededDb();
    const provider = new MockVisionProvider([
      { text: frontJson({ brand: 'Zephyr Organics', product_name: 'Mango Habanero Jerky Bites' }) },
      { text: frontJson({ is_food_package: false, confidence: 0.95 }) },
    ]);
    const { scan } = makeScan(db, provider);
    assert.equal((await scan.scanFront(await packagePhoto(3), 'u-12345678')).status, 'needs_barcode_or_label');
    assert.equal((await scan.scanFront(await packagePhoto(4), 'u-12345678')).status, 'not_food_package');
  });

  it('perceptual hash is stable for re-encodes and differs for other images', async () => {
    const a = await perceptualHash(await packagePhoto(1));
    const a2 = await perceptualHash(
      await sharp(await packagePhoto(1))
        .resize(800)
        .jpeg({ quality: 50 })
        .toBuffer(),
    );
    const b = await perceptualHash(await packagePhoto(3));
    assert.ok(hammingDistance(a, a2) <= 3);
    assert.ok(hammingDistance(a, b) > 3);
  });
});

describe('ingredient-panel photo (fallback)', () => {
  it('never calls vision when the barcode already has ingredients', async () => {
    const db = await seededDb();
    const provider = new MockVisionProvider();
    const { scan } = makeScan(db, provider);
    const r = await scan.scanLabel(await packagePhoto(5), 'u-12345678', { gtin: '013764027503' });
    assert.equal(r.status, 'existing_product');
    assert.equal(provider.calls.length, 0);
  });

  it('saves a pending contribution and serves it to the same user, unverified', async () => {
    const db = await seededDb();
    const provider = new MockVisionProvider([{ text: labelJson({ ingredients_text: 'Water, sugar, citric acid' }) }]);
    const { scan } = makeScan(db, provider);
    const r = await scan.scanLabel(await packagePhoto(6), 'u-12345678', { gtin: '036000291452' });
    assert.equal(r.status, 'contributed');
    if (r.status !== 'contributed') return;
    assert.equal(r.product.label, 'User-submitted, unverified');
    assert.equal(r.product.verified, false);
    const row = db.prepare('SELECT status, gtin14, image_path FROM contributions').get() as Record<string, unknown>;
    assert.deepEqual({ ...row }, { status: 'pending', gtin14: '00036000291452', image_path: null }); // photo not kept without opt-in

    const mine = await scan.resolveBarcode('036000291452', 'u-12345678');
    assert.equal(mine.status === 'found' && mine.via, 'contribution');
    const someoneElse = await scan.resolveBarcode('036000291452', 'u-87654321');
    assert.equal(someoneElse.status, 'needs_label_photo');
  });

  it('ties the contribution to the front-photo hash when the GTIN is unknown', async () => {
    const db = await seededDb();
    const { scan } = makeScan(db, new MockVisionProvider([{ text: labelJson() }]));
    const r = await scan.scanLabel(await packagePhoto(7), 'u-12345678', { frontHash: 'abcdef0123456789' });
    assert.equal(r.status, 'contributed');
    assert.equal((db.prepare('SELECT front_photo_hash h FROM contributions').get() as { h: string }).h, 'abcdef0123456789');
  });

  it('reports unreadable labels instead of guessing', async () => {
    const db = await seededDb();
    const { scan } = makeScan(db, new MockVisionProvider([{ text: labelJson({ ingredients_text: null, confidence: 0.9 }) }]));
    const r = await scan.scanLabel(await packagePhoto(8), 'u-12345678', { gtin: '036000291452' });
    assert.equal(r.status, 'unreadable');
    assert.equal((db.prepare('SELECT count(*) n FROM contributions').get() as { n: number }).n, 0);
  });
});

describe('config', () => {
  it('thresholds come from config', () => {
    const c = testConfig({ matchAutoConfirm: 0.9 });
    assert.equal(c.matchAutoConfirm, 0.9);
    assert.equal(c.visionCacheMaxHammingDistance <= 3, true);
  });
});
