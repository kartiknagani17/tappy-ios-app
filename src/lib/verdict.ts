import { INGREDIENTS } from '../data/ingredients';
import { RESTRICTION_BY_ID, effectiveLevel, selectionTags, type Selection } from '../data/restrictions';
import type { Rating } from './store';

/**
 * Verdict for a scanned product against the user's profile.
 * Safety rules:
 *  - no ingredient list  -> 'unknown' (never a guess)
 *  - we never say "safe": the best outcome is 'no_conflicts' ("no conflicts found"),
 *    always shown with "check the package yourself"
 *  - "may contain" statements count: avoid for severe (cross-contact not ok) restrictions, limit otherwise
 */
export type VerdictState = 'avoid' | 'limit' | 'no_conflicts' | 'unknown';

export type Flag = { term: string; rating: Rating; restrictions: string[]; mayContain: boolean };

export type Verdict = { state: VerdictState; flags: Flag[]; matchedTerms: number };

/** Allergen words that appear in "Contains:" / "May contain:" statements and ingredient lists. */
const EXTRA_TERMS: Record<string, string[]> = {
  milk: ['dairy', 'lactose'],
  dairy: ['dairy'],
  egg: ['egg'],
  eggs: ['egg'],
  wheat: ['wheat', 'gluten'],
  gluten: ['gluten'],
  barley: ['barley', 'gluten'],
  rye: ['rye', 'gluten'],
  soy: ['soy'],
  soya: ['soy'],
  soybean: ['soy'],
  soybeans: ['soy'],
  peanut: ['peanut'],
  peanuts: ['peanut'],
  'tree nut': ['treenut'],
  'tree nuts': ['treenut'],
  nuts: ['treenut'],
  almonds: ['treenut'],
  cashews: ['treenut'],
  walnuts: ['treenut'],
  pecans: ['treenut'],
  hazelnuts: ['treenut'],
  pistachios: ['treenut'],
  fish: ['fish'],
  shellfish: ['shellfish'],
  shrimp: ['shellfish'],
  crab: ['shellfish'],
  lobster: ['shellfish'],
  sesame: ['sesame'],
  mustard: ['mustard'],
  celery: ['celery'],
  lupin: ['lupin'],
  sulfites: ['sulfite'],
  sulphites: ['sulfite'],
  sugar: ['sugar'],
  'natural flavor': [],
  'artificial flavor': ['artificial-flavor'],
  'artificial flavors': ['artificial-flavor'],
  gelatin: ['gelatin', 'mammal'],
  pork: ['pork', 'meat-red', 'mammal'],
  beef: ['meat-red', 'mammal'],
  chicken: ['poultry'],
};

type Term = { term: string; tags: string[]; re: RegExp };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const TERMS: Term[] = (() => {
  const map = new Map<string, Set<string>>();
  const add = (term: string, tags: string[]) => {
    const key = term.toLowerCase();
    const set = map.get(key) ?? new Set<string>();
    tags.forEach((t) => set.add(t));
    map.set(key, set);
  };
  for (const ing of INGREDIENTS) add(ing.name, ing.tags);
  for (const [t, tags] of Object.entries(EXTRA_TERMS)) add(t, tags);
  return [...map.entries()]
    .map(([term, tags]) => ({ term, tags: [...tags], re: new RegExp(`(^|[^a-z])${escape(term)}(e?s)?([^a-z]|$)`, 'i') }))
    .sort((a, b) => b.term.length - a.term.length);
})();

/** Split the "may contain / processed in a facility" part from the rest of the label text. */
function splitMayContain(text: string): { main: string; mayContain: string } {
  const re =
    /(may contain|may also contain|processed in a facility|manufactured (?:in|on)[^.]*(?:that|which) (?:also )?(?:processes|handles)|produced on shared equipment)[^.]*\.?/gi;
  const mayContain = (text.match(re) ?? []).join(' ');
  return { main: text.replace(re, ' '), mayContain };
}

function findTerms(text: string): Term[] {
  if (!text.trim()) return [];
  const found: Term[] = [];
  let remaining = ` ${text.toLowerCase()} `;
  for (const t of TERMS) {
    if (t.re.test(remaining)) {
      found.push(t);
      // Blank out the matched phrase so "whole wheat flour" isn't also counted as a separate "flour" hit.
      remaining = remaining.replace(new RegExp(t.re.source, 'gi'), '$1 $3');
    }
  }
  return found;
}

export function computeVerdict(
  product: { ingredients_text: string | null; allergens_text: string | null },
  restrictions: Record<string, Selection>,
  overrides: Record<string, Rating> = {},
): Verdict {
  const ingredients = (product.ingredients_text ?? '').trim();
  if (ingredients.length < 3) return { state: 'unknown', flags: [], matchedTerms: 0 };

  // tag -> { worst rating, restriction names, severe? }
  const byTag = new Map<string, { rating: Rating; names: Set<string>; severe: boolean }>();
  for (const [id, sel] of Object.entries(restrictions)) {
    const r = RESTRICTION_BY_ID[id];
    if (!r) continue;
    const level = effectiveLevel(r, sel);
    for (const tag of selectionTags(r, sel)) {
      const cur = byTag.get(tag) ?? { rating: 'green' as Rating, names: new Set<string>(), severe: false };
      if (level !== 'preference') cur.rating = 'red';
      else if (cur.rating === 'green') cur.rating = 'yellow';
      cur.severe = cur.severe || level === 'severe';
      cur.names.add(r.name);
      byTag.set(tag, cur);
    }
  }

  const { main, mayContain } = splitMayContain(`${ingredients}. ${product.allergens_text ?? ''}`);
  const overrideByName = new Map(INGREDIENTS.map((i) => [i.name.toLowerCase(), overrides[i.id]]));
  const flags: Flag[] = [];
  const mainTerms = findTerms(main);

  const evaluate = (t: Term, isMayContain: boolean) => {
    const override = overrideByName.get(t.term);
    let rating: Rating = 'green';
    const names = new Set<string>();
    for (const tag of t.tags) {
      const hit = byTag.get(tag);
      if (!hit) continue;
      hit.names.forEach((n) => names.add(n));
      let r = hit.rating;
      if (isMayContain) r = hit.severe ? 'red' : r === 'red' ? 'yellow' : r;
      if (r === 'red' || (r === 'yellow' && rating === 'green')) rating = r;
    }
    if (override && !isMayContain) rating = override;
    if (rating !== 'green') flags.push({ term: t.term, rating, restrictions: [...names], mayContain: isMayContain });
  };
  mainTerms.forEach((t) => evaluate(t, false));
  findTerms(mayContain).forEach((t) => evaluate(t, true));

  const state: VerdictState = flags.some((f) => f.rating === 'red')
    ? 'avoid'
    : flags.some((f) => f.rating === 'yellow')
      ? 'limit'
      : 'no_conflicts';
  // De-duplicate by term, keeping the worst rating.
  const unique = new Map<string, Flag>();
  for (const f of flags) {
    const prev = unique.get(f.term);
    if (!prev || (f.rating === 'red' && prev.rating !== 'red')) unique.set(f.term, f);
  }
  return { state, flags: [...unique.values()], matchedTerms: mainTerms.length };
}

export const VERDICT_COPY: Record<VerdictState, { title: string; body: string }> = {
  avoid: { title: 'Contains ingredients you avoid', body: 'Based on your profile, this product has ingredients you marked to avoid.' },
  limit: { title: 'Contains ingredients you limit', body: 'This product has ingredients you said you try to limit.' },
  no_conflicts: {
    title: 'No conflicts found',
    body: 'We didn’t find ingredients from your profile in this list. That isn’t a guarantee it’s safe.',
  },
  unknown: {
    title: 'Not enough data',
    body: 'We don’t have this product’s ingredient list, so we can’t give a verdict. Photograph the ingredient panel to check it.',
  },
};

export const SOURCE_LABEL: Record<string, string> = {
  usda: 'USDA FoodData Central',
  off: 'Open Food Facts',
  user: 'Tapi community',
  ocr: 'Your photo',
};
