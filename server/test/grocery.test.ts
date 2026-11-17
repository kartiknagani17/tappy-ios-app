import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import type { DB } from '../src/db/index.ts';
import { createApp } from '../src/http/app.ts';
import { browseProducts, GROCERY_PAGE } from '../src/services/products.ts';
import { makeScan, MockVisionProvider, testConfig, testDb } from './helpers.ts';

let n = 0;
function add(db: DB, p: { name: string; brand?: string; category?: string | null; ingredients?: string | null; image?: boolean }) {
  n++;
  db.prepare(
    `INSERT INTO products (gtin14, name, brand, category, ingredients_text, image_url, source) VALUES (?, ?, ?, ?, ?, ?, 'off')`,
  ).run(
    String(n).padStart(14, '0'),
    p.name,
    p.brand ?? null,
    p.category === undefined ? null : p.category,
    p.ingredients === undefined ? 'sugar, salt, water, flour' : p.ingredients,
    p.image ? `https://images.openfoodfacts.org/images/products/${n}.400.jpg` : null,
  );
  return n;
}
const aisleOf = (db: DB, id: number) => (db.prepare('SELECT aisle FROM products WHERE id = ?').get(id) as { aisle: string | null }).aisle;

describe('aisles', () => {
  const db = testDb();
  it('puts products in the right aisle from their category, else their name', () => {
    const cases: [string | null, string, string | null][] = [
      ['Frozen pizzas', 'Pepperoni Pizza', 'frozen'],
      ['Ice cream tubs', 'Vanilla', 'frozen'],
      ['Milk chocolates', 'Hershey Bar', 'sweets'],
      ['Chocolate chip cookies', 'Chips Ahoy', 'sweets'],
      ['Potato chips', 'Classic', 'snacks'],
      ['Popcorn, Peanuts, Seeds & Related Snacks', 'Butter Popcorn', 'snacks'],
      ['Breakfast cereals', 'Cheerios', 'breakfast'],
      ['Breads', 'Whole Wheat', 'bakery'],
      ['Sodas', 'Diet Coke', 'drinks'],
      ['Green teas', 'Jasmine', 'drinks'],
      ['Peanut butters', 'Creamy', 'pantry'],
      ['Mayonnaises', 'Real Mayo', 'pantry'],
      ['Cheeses', 'Cheddar', 'dairy'],
      ['Yogurts', 'Greek', 'dairy'],
      ['Beef jerky', 'Teriyaki', 'snacks'],
      ['Chicken breasts', 'Grilled', 'meat'],
      [null, 'Steak sauce', 'pantry'],
      ['Fresh fruits', 'Apples', 'produce'],
      ['Vitamins', 'Daily', null],
    ];
    for (const [category, name, want] of cases) assert.equal(aisleOf(db, add(db, { name, category })), want, `${category} / ${name}`);
  });
});

describe('browseProducts', () => {
  const db = testDb();
  before(() => {
    add(db, { name: 'Creamy Peanut Butter', brand: 'Jif', category: 'Peanut butters', image: true });
    add(db, { name: 'Natural Peanut Butter', brand: 'Skippy', category: 'Peanut butters' });
    add(db, { name: 'Peanut Butter Cups', brand: 'Reeses', category: 'Candies', image: true });
    add(db, { name: 'Peanut Butter Mystery', category: 'Peanut butters', ingredients: null }); // no ingredients: never shown
    add(db, { name: 'Salted Peanuts', category: 'Nuts' });
    for (let i = 0; i < GROCERY_PAGE + 5; i++) add(db, { name: `Chip ${i}`, category: 'Potato chips', image: i % 2 === 0 });
  });

  it('search needs every word, skips products without ingredients, photos first', () => {
    const { products } = browseProducts(db, { q: 'peanut butter' });
    assert.deepEqual(
      products.map((p) => p.name),
      ['Creamy Peanut Butter', 'Peanut Butter Cups', 'Natural Peanut Butter'],
    );
  });

  it('search within an aisle', () => {
    assert.deepEqual(
      browseProducts(db, { q: 'peanut butter', aisle: 'sweets' }).products.map((p) => p.name),
      ['Peanut Butter Cups'],
    );
  });

  it('pages through an aisle', () => {
    const first = browseProducts(db, { aisle: 'snacks' });
    assert.equal(first.products.length, GROCERY_PAGE);
    assert.equal(first.nextOffset, GROCERY_PAGE);
    assert.ok(first.products.slice(0, 23).every((p) => p.image_url));
    const second = browseProducts(db, { aisle: 'snacks', offset: first.nextOffset! });
    assert.equal(second.nextOffset, null);
    assert.equal(first.products.length + second.products.length, GROCERY_PAGE + 6); // 45 chips + salted peanuts
  });

  it('returns nothing without a search or an aisle, and treats FTS syntax as words', () => {
    assert.deepEqual(browseProducts(db, {}).products, []);
    assert.doesNotThrow(() => browseProducts(db, { q: 'peanut" OR NEAR(* -' }));
  });

  it('uses the aisle index', () => {
    const plan = db
      .prepare(`EXPLAIN QUERY PLAN SELECT * FROM products WHERE aisle = ? AND ingredients_text IS NOT NULL ORDER BY (image_url IS NULL), id LIMIT 41`)
      .all('snacks') as { detail: string }[];
    assert.ok(plan.some((r) => /products_aisle/.test(r.detail)), JSON.stringify(plan));
    assert.ok(!plan.some((r) => /TEMP B-TREE/.test(r.detail)), 'no sort step');
  });
});

describe('POST /api/products/browse', () => {
  let server: Server;
  let base: string;
  const db = testDb();
  before(async () => {
    add(db, { name: 'Creamy Peanut Butter', brand: 'Jif', category: 'Peanut butters' });
    const { scan } = makeScan(db, new MockVisionProvider(), testConfig());
    server = createServer(createApp({ db, config: testConfig({ rateLimitPerMinute: 100 }), scan }));
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(() => server.close());
  const post = (body: unknown) =>
    fetch(`${base}/api/products/browse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Tappy-User': 'device-grocery-1' },
      body: JSON.stringify(body),
    });

  it('returns products and the next page offset', async () => {
    const res = await post({ q: 'peanut', aisle: 'pantry' });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { products: { name: string }[]; next_offset: number | null };
    assert.deepEqual(body.products.map((p) => p.name), ['Creamy Peanut Butter']);
    assert.equal(body.next_offset, null);
  });

  it('rejects bad input', async () => {
    for (const bad of [{ aisle: 'toys' }, { q: 5 }, { offset: -1 }, { offset: 5000 }, { offset: '1' }]) {
      assert.equal((await post(bad)).status, 400, JSON.stringify(bad));
    }
  });
});
