/**
 * Open Food Facts JSON product → the CSV-style row that offRowToRecord understands, so the bulk
 * CSV import, the daily delta import and live lookups all produce identical records.
 */
const MAX_FIELD_CHARS = 10_000;

/** Only OFF-hosted https image URLs are passed on to the app (no tracking pixels / javascript: URLs). */
export function safeOffImageUrl(v: unknown): string {
  if (typeof v !== 'string' || v.length > 2048) return '';
  try {
    const u = new URL(v);
    const okHost = u.hostname === 'openfoodfacts.org' || u.hostname.endsWith('.openfoodfacts.org');
    return u.protocol === 'https:' && okHost && !u.username && !u.password ? u.toString() : '';
  } catch {
    return '';
  }
}

const field = (v: unknown) => (v === undefined || v === null ? '' : String(v).slice(0, MAX_FIELD_CHARS));
const tags = (v: unknown) => (Array.isArray(v) ? field(v.filter((x) => typeof x === 'string').join(',')) : field(v));

/** "en:peanut-butters" → "Peanut butters" (the same wording as the CSV's main_category_en). */
export function tagToName(tag: unknown): string {
  if (typeof tag !== 'string') return '';
  const m = /^en:(.+)$/.exec(tag.trim());
  if (!m || /^(?:undefined|null|unknown)$/i.test(m[1])) return '';
  const s = m[1].replace(/-/g, ' ').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '';
}

/**
 * The most specific category: main_category (API), else compared_to_category (what the daily
 * files carry), else the last English category tag. Same idea as the CSV's main_category_en.
 */
function mainCategory(p: Record<string, unknown>): string {
  const tagsList = Array.isArray(p.categories_tags) ? (p.categories_tags as unknown[]) : [];
  for (const t of [p.main_category, p.compared_to_category, ...[...tagsList].reverse()]) {
    const name = tagToName(t);
    if (name) return name;
  }
  return '';
}

/** English text first: US products often carry both a French/Spanish and an English field. */
const en = (p: Record<string, unknown>, key: string) => field(p[`${key}_en`]) || field(p[key]);

export function offJsonToRow(p: Record<string, unknown>, code: string): Record<string, string> {
  const n = (p.nutriments && typeof p.nutriments === 'object' ? p.nutriments : {}) as Record<string, unknown>;
  const num = (k: string) => (n[k] === undefined || n[k] === null ? '' : String(n[k]));
  return {
    code,
    product_name: en(p, 'product_name'),
    generic_name: en(p, 'generic_name'),
    brands: field(p.brands),
    quantity: field(p.quantity),
    ingredients_text: en(p, 'ingredients_text'),
    // Tags ("en:milk,en:soybeans") are language-independent; offRowToRecord turns them into words.
    allergens: tags(p.allergens_tags) || field(p.allergens),
    traces: tags(p.traces_tags) || field(p.traces),
    main_category_en: mainCategory(p),
    categories_en: field(p.categories),
    image_url: safeOffImageUrl(p.image_front_url) || safeOffImageUrl(p.image_url),
    last_modified_t: field(p.last_modified_t),
    countries_tags: tags(p.countries_tags),
    'energy-kcal_100g': num('energy-kcal_100g'),
    proteins_100g: num('proteins_100g'),
    fat_100g: num('fat_100g'),
    'saturated-fat_100g': num('saturated-fat_100g'),
    carbohydrates_100g: num('carbohydrates_100g'),
    sugars_100g: num('sugars_100g'),
    fiber_100g: num('fiber_100g'),
    sodium_100g: num('sodium_100g'),
  };
}

/** Fields to request from the live API so offJsonToRow has everything it reads. */
export const OFF_JSON_FIELDS = [
  'code',
  'product_name',
  'product_name_en',
  'generic_name',
  'generic_name_en',
  'brands',
  'quantity',
  'ingredients_text',
  'ingredients_text_en',
  'allergens',
  'allergens_tags',
  'traces',
  'traces_tags',
  'main_category',
  'compared_to_category',
  'categories_tags',
  'categories',
  'image_url',
  'image_front_url',
  'last_modified_t',
  'countries_tags',
  'nutriments',
];
