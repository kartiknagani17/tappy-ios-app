import { pickName } from './names.ts';

/**
 * Source-priority merge. When USDA and Open Food Facts both have a GTIN:
 *   1. prefer the record that has an ingredient list,
 *   2. then the newest update (compared by calendar day: USDA dates are day precision),
 *   3. ties go to USDA.
 */

export type SourceName = 'usda' | 'off';

export type SourceRecord = {
  source: SourceName;
  gtin14: string;
  source_record_id: string;
  name: string | null;
  brand: string | null;
  variant_or_flavor: string | null;
  size_text: string | null;
  ingredients_text: string | null;
  allergens_text: string | null;
  nutrition_json: string | null;
  category: string | null;
  image_url: string | null;
  source_updated_at: string | null; // ISO date or datetime
};

const hasIngredients = (r: SourceRecord) => !!r.ingredients_text && r.ingredients_text.trim().length > 2;
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : '');

/** Negative if a should win over b. */
export function compareRecords(a: SourceRecord, b: SourceRecord): number {
  const ing = Number(hasIngredients(b)) - Number(hasIngredients(a));
  if (ing !== 0) return ing;
  const da = day(a.source_updated_at);
  const db = day(b.source_updated_at);
  if (da !== db) return da > db ? -1 : 1;
  if (a.source !== b.source) return a.source === 'usda' ? -1 : 1;
  return 0;
}

export function pickWinner(records: SourceRecord[]): SourceRecord | null {
  const usable = records.filter((r) => r.name && r.name.trim());
  if (!usable.length) return null;
  return [...usable].sort(compareRecords)[0];
}

/**
 * The winner supplies identity and ingredients. Fields the winner lacks (image, size,
 * category, nutrition) are filled from the other source so a USDA win still gets an
 * Open Food Facts photo, for example. Ingredients/allergens are never mixed across sources.
 */
export function mergeRecords(records: SourceRecord[]): (SourceRecord & { filled_from: SourceName[] }) | null {
  const winner = pickWinner(records);
  if (!winner) return null;
  const others = records.filter((r) => r !== winner);
  const merged = { ...winner, filled_from: [] as SourceName[] };
  // Name: the winner's, unless it's junk ("My Bff"); then the first real name from the other
  // sources, manufacturer data (USDA) first. Ingredients still come only from the winner.
  const byTrust = [...records].sort((a, b) => (a.source === b.source ? 0 : a.source === 'usda' ? -1 : 1));
  const name = pickName([winner.name, ...byTrust.map((r) => r.name)]);
  if (name && name !== winner.name) {
    const donor = records.find((r) => r.name?.trim() === name);
    merged.name = name;
    if (donor && donor !== winner && !merged.filled_from.includes(donor.source)) merged.filled_from.push(donor.source);
  }
  for (const field of ['brand', 'size_text', 'category', 'image_url', 'nutrition_json', 'variant_or_flavor'] as const) {
    if (merged[field]) continue;
    const donor = others.find((o) => o[field]);
    if (donor) {
      merged[field] = donor[field];
      if (!merged.filled_from.includes(donor.source)) merged.filled_from.push(donor.source);
    }
  }
  return merged;
}
