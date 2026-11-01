import { EXTRA_TERMS } from '../data/allergenTerms';
import { INGREDIENTS } from '../data/ingredients';
import { RESTRICTION_BY_ID, effectiveLevel, selectionTags, type Selection } from '../data/restrictions';
import type { Rating } from './store';

/**
 * Verdict for a scanned product against the user's profile.
 * Safety rules:
 *  - no ingredient list  -> 'unknown' (never a guess), unless the allergen statement alone already
 *    names something the user avoids
 *  - an ingredient list where we recognize nothing at all (e.g. a language we don't cover) -> 'unknown'
 *  - we never say "safe": the best outcome is 'no_conflicts' ("no conflicts found"),
 *    always shown with "check the package yourself"
 *  - "may contain" statements count: avoid for severe (cross-contact not ok) restrictions, limit otherwise
 *  - when in doubt we over-flag: "X-free" claims are NOT treated as negations, and text after
 *    "may contain" only counts as precautionary up to the end of that sentence/clause
 */
export type VerdictState = 'avoid' | 'limit' | 'no_conflicts' | 'unknown';

/** Why a verdict came out the way it did, when the plain state isn't the whole story. */
export type VerdictReason =
  /** No ingredient list on file. */
  | 'no_ingredients'
  /** No ingredient list, but the allergen statement ("Contains: …") alone conflicts with the profile. */
  | 'allergens_only'
  /** An ingredient list exists but none of it was recognized (often a language we don't cover). */
  | 'unrecognized'
  /** The profile has no restrictions or overrides, so there was nothing to check against. */
  | 'no_profile';

export type Flag = { term: string; rating: Rating; restrictions: string[]; mayContain: boolean };

export type Verdict = { state: VerdictState; flags: Flag[]; matchedTerms: number; reason?: VerdictReason };

type Term = { term: string; tags: string[]; test: RegExp; global: RegExp };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Lower-case, fold accents ("blé" → "ble", "œuf" → "oeuf"), straighten quotes, and normalize a few
 * label conventions so the matcher sees one spelling: OFF's "_milk_" allergen markers,
 * "E 220"/"E-220" → "e220", "Red No. 40"/"FD&C Red #40"/"red40" → "red 40".
 */
export function normalizeLabel(input: string): string {
  let s = input;
  try {
    s = s.normalize('NFKD');
  } catch {
    // normalize() unavailable: fall through with the raw string.
  }
  return s
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/ß/g, 'ss')
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/[_*]/g, ' ')
    .replace(/\be[\s-]?(\d{3}[a-z]?)\b/g, 'e$1')
    .replace(/\b(red|yellow|blue|green)\s*(?:no\.?|#|number)?\s*(\d{1,2})\b/g, '$1 $2')
    .replace(/\s+/g, ' ');
}

/** Singular form of the last word, so "nuts" and "nut" share one entry. */
function singular(word: string): string {
  if (/[^aeiou]ies$/.test(word)) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && /[^su]s$/.test(word)) return word.slice(0, -1);
  return word;
}

/** Regex source for one word that also accepts its plural ("anchovy" → anchovy|anchovies). */
function wordPattern(word: string): string {
  const w = escape(word).replace(/'/g, "'?");
  if (/[^aeiou]y$/.test(word)) return `${w.slice(0, -1)}(?:y|ies)`;
  return `${w}(?:e?s)?`;
}

function keyFor(phrase: string): string {
  const words = normalizeLabel(phrase).trim().split(' ');
  words[words.length - 1] = singular(words[words.length - 1]);
  return words.join(' ');
}

const TERMS: Term[] = (() => {
  const map = new Map<string, Set<string>>();
  const add = (term: string, tags: string[]) => {
    const key = keyFor(term);
    if (!key) return;
    const set = map.get(key) ?? new Set<string>();
    tags.forEach((t) => set.add(t));
    map.set(key, set);
  };
  for (const ing of INGREDIENTS) add(ing.name, ing.tags);
  for (const [t, tags] of Object.entries(EXTRA_TERMS)) add(t, tags);
  return [...map.entries()]
    .map(([term, tags]) => {
      const words = term.split(' ');
      // Only the last word is pluralized ("sesame seeds", "egg whites"); spaces also match hyphens/newlines.
      const body = [...words.slice(0, -1).map((w) => escape(w).replace(/'/g, "'?")), wordPattern(words[words.length - 1])].join(
        '[\\s-]+',
      );
      const source = `(^|[^a-z0-9])${body}(?=[^a-z0-9]|$)`;
      return { term, tags: [...tags], test: new RegExp(source), global: new RegExp(source, 'g') };
    })
    .sort((a, b) => b.term.length - a.term.length);
})();

/**
 * Precautionary ("may contain") statements, in English plus FR/ES/IT/DE. A statement runs until the
 * end of its sentence or clause (. ; newline or closing parenthesis) or until a definite "contains".
 * "May contain one or more of: canola, soybean oil" lists real ingredients, so it is NOT precautionary.
 */
const MAY_CONTAIN_RE = new RegExp(
  '\\b(?:' +
    [
      'may (?:also )?contain(?!s)(?! one or more)(?! any of)',
      'may be present',
      'contains? traces?',
      'traces? of',
      '(?:made|produced|processed|manufactured|packed|packaged|prepared) (?:in|on|with|at)[^.;\\n)]*?(?:facility|facilities|factory|equipment|line|plant|site|kitchen)',
      '(?:shared|same) (?:equipment|facility|production line|line)',
      'cross[\\s-]?contact',
      'peut contenir',
      'traces? (?:de|d\')',
      'puede contener',
      'trazas de',
      'puo contenere',
      'tracce di',
      'kann (?:spuren )?enthalten',
      'spuren von',
    ].join('|') +
    ')(?:(?!\\bcontains?\\b)[^.;\\n)])*',
  'g',
);

/** Split the "may contain / processed in a facility" part from the rest of the (normalized) label text. */
function splitMayContain(text: string): { main: string; mayContain: string } {
  const mayContain = (text.match(MAY_CONTAIN_RE) ?? []).join(' . ');
  return { main: text.replace(MAY_CONTAIN_RE, ' . '), mayContain };
}

/** Terms found in already-normalized text, longest phrase first ("whole wheat flour" before "flour"). */
function findTerms(text: string): Term[] {
  if (!text.trim()) return [];
  const found: Term[] = [];
  let remaining = ` ${text} `;
  for (const t of TERMS) {
    if (t.test.test(remaining)) {
      found.push(t);
      // Blank out the matched phrase so "peanut butter" isn't also counted as "butter".
      remaining = remaining.replace(t.global, (m: string, pre: string) => pre + ' '.repeat(m.length - pre.length));
    }
  }
  return found;
}

/** Profile tags found in a piece of label text (used to rate free-text ingredient names). */
export function tagsInText(text: string): string[] {
  const tags = new Set<string>();
  for (const t of findTerms(normalizeLabel(text))) t.tags.forEach((x) => tags.add(x));
  return [...tags];
}

const asText = (v: unknown): string => (typeof v === 'string' ? v : '');

export function computeVerdict(
  product: { ingredients_text: string | null; allergens_text: string | null },
  restrictions: Record<string, Selection>,
  overrides: Record<string, Rating> = {},
): Verdict {
  const ingredients = normalizeLabel(asText(product.ingredients_text)).trim();
  const allergens = normalizeLabel(asText(product.allergens_text)).trim();

  // tag -> { worst rating, restriction names, severe? }
  const byTag = new Map<string, { rating: Rating; names: Set<string>; severe: boolean }>();
  for (const [id, sel] of Object.entries(restrictions ?? {})) {
    const r = RESTRICTION_BY_ID[id];
    if (!r || !sel || typeof sel !== 'object') continue;
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

  const overrideByTerm = new Map<string, Rating>();
  for (const ing of INGREDIENTS) {
    const o = overrides?.[ing.id];
    if (o === 'green' || o === 'yellow' || o === 'red') overrideByTerm.set(keyFor(ing.name), o);
  }
  const noProfile = byTag.size === 0 && overrideByTerm.size === 0;

  const flags: Flag[] = [];
  const evaluate = (t: Term, isMayContain: boolean) => {
    const override = overrideByTerm.get(t.term);
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

  const hasIngredients = ingredients.replace(/[^a-z0-9]/g, '').length >= 3;
  const { main, mayContain } = splitMayContain(hasIngredients ? `${ingredients} . ${allergens}` : allergens);
  const mainTerms = findTerms(main);
  mainTerms.forEach((t) => evaluate(t, false));
  findTerms(mayContain).forEach((t) => evaluate(t, true));

  // De-duplicate by term, keeping the worst rating (and the definite flag over "may contain" on ties).
  const unique = new Map<string, Flag>();
  for (const f of flags) {
    const prev = unique.get(f.term);
    if (!prev || (f.rating === 'red' && prev.rating !== 'red')) unique.set(f.term, f);
  }
  const deduped = [...unique.values()];
  const worstState: VerdictState = deduped.some((f) => f.rating === 'red')
    ? 'avoid'
    : deduped.some((f) => f.rating === 'yellow')
      ? 'limit'
      : 'no_conflicts';

  if (!hasIngredients) {
    // The allergen statement alone can still tell us to avoid/limit, but never that it's fine.
    if (worstState !== 'no_conflicts') return { state: worstState, flags: deduped, matchedTerms: 0, reason: 'allergens_only' };
    return { state: 'unknown', flags: [], matchedTerms: 0, reason: 'no_ingredients' };
  }

  const ingredientTerms = findTerms(splitMayContain(ingredients).main).length;
  const itemCount = ingredients.split(/[,;]/).filter((x) => /[a-z]/.test(x)).length;
  if (worstState === 'no_conflicts' && ingredientTerms === 0 && itemCount >= 3) {
    return { state: 'unknown', flags: [], matchedTerms: 0, reason: 'unrecognized' };
  }

  return {
    state: worstState,
    flags: deduped,
    matchedTerms: mainTerms.length,
    ...(worstState === 'no_conflicts' && noProfile ? { reason: 'no_profile' as const } : {}),
  };
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

/** Title/body for a verdict, taking the reason and "may contain"-only flags into account. Prefer this over VERDICT_COPY. */
export function verdictCopy(v: Verdict): { title: string; body: string } {
  const base = VERDICT_COPY[v.state];
  const onlyMayContain = v.flags.length > 0 && v.flags.every((f) => f.mayContain || f.rating === 'green');
  switch (v.reason) {
    case 'unrecognized':
      return {
        title: 'Couldn’t read this list',
        body: 'We didn’t recognize any ingredients in this list (it may be in another language), so we can’t give a verdict. Check the package yourself.',
      };
    case 'allergens_only':
      return {
        title: v.state === 'avoid' ? 'Allergen statement conflicts' : base.title,
        body: 'We don’t have the full ingredient list, but the allergen statement names something from your profile.',
      };
    case 'no_profile':
      return {
        title: 'No restrictions in your profile',
        body: 'Add your diets and allergens to your profile so we can check products against them.',
      };
    default:
      break;
  }
  if (onlyMayContain && v.state !== 'no_conflicts' && v.state !== 'unknown') {
    return {
      title: v.state === 'avoid' ? 'May contain ingredients you avoid' : 'May contain ingredients you limit',
      body: 'The label warns it may contain (or is made alongside) ingredients from your profile.',
    };
  }
  return base;
}

export const SOURCE_LABEL: Record<string, string> = {
  usda: 'USDA FoodData Central',
  off: 'Open Food Facts',
  user: 'Tappy community',
  ocr: 'Your photo',
};
