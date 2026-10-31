import { INGREDIENTS, type Ingredient } from '../data/ingredients';
import { RESTRICTION_BY_ID, effectiveLevel, selectionTags, type Selection } from '../data/restrictions';
import type { Rating } from './store';

const RANK: Record<Rating, number> = { green: 0, yellow: 1, red: 2 };

/** Build tag → strongest rating map from the user's restrictions. */
export function buildTagRatings(restrictions: Record<string, Selection>): Map<string, Rating> {
  const map = new Map<string, Rating>();
  for (const [id, sel] of Object.entries(restrictions)) {
    const r = RESTRICTION_BY_ID[id];
    if (!r) continue;
    const rating: Rating = effectiveLevel(r, sel) === 'preference' ? 'yellow' : 'red';
    for (const tag of selectionTags(r, sel)) {
      const prev = map.get(tag);
      if (!prev || RANK[rating] > RANK[prev]) map.set(tag, rating);
    }
  }
  return map;
}

export function rateIngredient(ing: Ingredient, tagRatings: Map<string, Rating>, overrides: Record<string, Rating>): Rating {
  if (overrides[ing.id]) return overrides[ing.id];
  let best: Rating = 'green';
  for (const t of ing.tags) {
    const r = tagRatings.get(t);
    if (r && RANK[r] > RANK[best]) best = r;
  }
  return best;
}

export function rateAll(restrictions: Record<string, Selection>, overrides: Record<string, Rating>) {
  const tagRatings = buildTagRatings(restrictions);
  return INGREDIENTS.map((ing) => ({ ...ing, rating: rateIngredient(ing, tagRatings, overrides) }));
}

/** Rate an ingredient list (e.g. a scanned product) by name. Unknown names are treated as green. */
export function rateNames(names: string[], restrictions: Record<string, Selection>, overrides: Record<string, Rating>) {
  const tagRatings = buildTagRatings(restrictions);
  const byName = new Map(INGREDIENTS.map((i) => [i.name.toLowerCase(), i]));
  return names.map((name) => {
    const ing = byName.get(name.toLowerCase());
    return { name, rating: ing ? rateIngredient(ing, tagRatings, overrides) : ('green' as Rating) };
  });
}

/** Which of the user's restrictions flag this ingredient. */
export function explain(ing: Ingredient, restrictions: Record<string, Selection>) {
  const out: { name: string; rating: Rating }[] = [];
  for (const [id, sel] of Object.entries(restrictions)) {
    const r = RESTRICTION_BY_ID[id];
    if (!r) continue;
    const tags = selectionTags(r, sel);
    if (ing.tags.some((t) => tags.includes(t))) {
      out.push({ name: r.name, rating: effectiveLevel(r, sel) === 'preference' ? 'yellow' : 'red' });
    }
  }
  return out;
}

export function worst(ratings: Rating[]): Rating {
  return ratings.reduce<Rating>((a, b) => (RANK[b] > RANK[a] ? b : a), 'green');
}
