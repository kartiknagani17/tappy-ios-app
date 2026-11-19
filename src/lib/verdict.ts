import { EXTRA_TERMS, TERM_LABELS } from '../data/allergenTerms';
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

/**
 * `term` is the internal matching key (lower-case, last word singular: "molasse", "oat") and must never
 * be shown to people. Show `label` ("Molasses", "Oats").
 */
export type Flag = { term: string; label: string; rating: Rating; restrictions: string[]; mayContain: boolean };

export type Verdict = { state: VerdictState; flags: Flag[]; matchedTerms: number; reason?: VerdictReason };

/** `needle`: plain text every match must contain, checked with includes() before the regex (much cheaper). */
type Term = { term: string; label: string; tags: string[]; test: RegExp; global: RegExp; needle: string };

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
    // Labels sometimes run words together ("MilkPowder", "SoyLecithin"): split at lower→upper so
    // "milk" is still found. Splitting only ever adds matches, so it errs toward over-flagging.
    .replace(/([a-z])(?=[A-Z])/g, '$1 ')
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

/** "sesame seeds" → "Sesame seeds" */
const sentenceCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Regex source for a term key. Tolerates the raw label spellings that normalizeLabel would rewrite. */
function termBody(term: string): string {
  // "e220" also matches "E 220" / "E-220"
  const eNum = /^e(\d{3}[a-z]?)$/.exec(term);
  if (eNum) return `e[\\s-]?${eNum[1]}`;
  // "red 40" also matches "Red No. 40", "Red #40", "red40"
  const color = /^(red|yellow|blue|green) (\d{1,2})$/.exec(term);
  if (color) return `${color[1]}[\\s-]*(?:no\\.?|#|number)?[\\s-]*${color[2]}`;
  const words = term.split(' ');
  // Only the last word is pluralized ("sesame seeds", "egg whites"); spaces also match hyphens/newlines.
  return [...words.slice(0, -1).map((w) => escape(w).replace(/'/g, "'?")), wordPattern(words[words.length - 1])].join('[\\s-]+');
}

/** A substring every match of termBody(term) contains ('' = no shortcut, always run the regex). */
function needleFor(term: string): string {
  const eNum = /^e(\d{3}[a-z]?)$/.exec(term);
  if (eNum) return eNum[1];
  const color = /^(red|yellow|blue|green) (\d{1,2})$/.exec(term);
  if (color) return color[1];
  const words = term.split(' ');
  const first = words[0];
  if (first.includes("'")) return '';
  // A lone word ending in consonant + y also matches "-ies", so only its stem is certain.
  if (words.length === 1 && /[^aeiou]y$/.test(first)) return first.slice(0, -1);
  return first;
}

const TERMS: Term[] = (() => {
  const map = new Map<string, { label: string; tags: Set<string> }>();
  const add = (phrase: string, tags: string[]) => {
    const key = keyFor(phrase);
    if (!key) return;
    // The first spelling wins as the display name: catalog names ("Molasses") come before extra terms.
    const entry = map.get(key) ?? { label: TERM_LABELS[phrase.toLowerCase()] ?? sentenceCase(phrase.toLowerCase()), tags: new Set<string>() };
    tags.forEach((t) => entry.tags.add(t));
    map.set(key, entry);
  };
  for (const ing of INGREDIENTS) add(ing.name, ing.tags);
  for (const [t, tags] of Object.entries(EXTRA_TERMS)) add(t, tags);
  return [...map.entries()]
    .map(([term, { label, tags }]) => {
      const source = `(^|[^a-z0-9])${termBody(term)}(?=[^a-z0-9]|$)`;
      return { term, label, tags: [...tags], test: new RegExp(source), global: new RegExp(source, 'g'), needle: needleFor(term) };
    })
    .sort((a, b) => b.term.length - a.term.length);
})();

const TERM_BY_KEY = new Map(TERMS.map((t) => [t.term, t]));

/**
 * Terms grouped by the first 3 letters of their needle. A match always starts at a word boundary with
 * the needle, so a label can only match terms filed under the first 3 letters of one of its words.
 * Terms without a usable word prefix (E-numbers, colors, apostrophes, very short words) are always tried.
 */
const ALWAYS_TRY: number[] = [];
const BY_PREFIX = new Map<string, number[]>();
TERMS.forEach((t, i) => {
  // E-numbers start with "e" while their needle is the digits, so they can't be filed by prefix.
  const plainWord = t.needle.length >= 3 && /^[a-z0-9]/.test(t.needle) && !/^e\d/.test(t.term);
  if (!plainWord) return void ALWAYS_TRY.push(i);
  const k = t.needle.slice(0, 3);
  const list = BY_PREFIX.get(k);
  if (list) list.push(i);
  else BY_PREFIX.set(k, [i]);
});

/** The terms that could possibly match `text`, in TERMS order (longest first). */
function candidateTerms(text: string): Term[] {
  const picked = new Set<number>(ALWAYS_TRY);
  for (const word of text.split(/[^a-z0-9]+/)) {
    if (word.length < 3) continue;
    const list = BY_PREFIX.get(word.slice(0, 3));
    if (list) for (const i of list) picked.add(i);
  }
  return [...picked].sort((a, b) => a - b).map((i) => TERMS[i]);
}

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
  for (const t of candidateTerms(text)) {
    if (t.needle && !remaining.includes(t.needle)) continue;
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

/**
 * Character-level version of normalizeLabel that keeps a map back to the original text, so matches
 * can be highlighted where they really are. `map[i]` is the index in `text` of folded character i.
 */
function foldWithMap(text: string): { folded: string; map: number[] } {
  let folded = '';
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let c = text[i];
    try {
      c = c.normalize('NFKD');
    } catch {
      // normalize() unavailable: keep the raw character.
    }
    c = c
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/œ/g, 'oe')
      .replace(/æ/g, 'ae')
      .replace(/ß/g, 'ss')
      .replace(/[‘’ʼ`´]/g, "'")
      .replace(/[_*]/g, ' ');
    // Same run-together split as normalizeLabel ("MilkPowder" → "milk powder"); the added space
    // maps to the capital letter, so highlight ranges still land on the original text.
    if (i > 0 && /[a-z]/.test(text[i - 1]) && /[A-Z]/.test(text[i])) {
      folded += ' ';
      map.push(i);
    }
    for (const ch of c) {
      folded += ch;
      map.push(i);
    }
  }
  return { folded, map };
}

export type HighlightRange = { start: number; end: number; term: string };

/**
 * Where the flagged terms appear in the original label text, using the exact same matcher as the
 * verdict (plurals, accents, hyphens, "E 150d", "Red No. 40", longest phrase first). Ranges are
 * sorted and never overlap.
 */
export function highlightRanges(text: string, flags: Pick<Flag, 'term'>[]): HighlightRange[] {
  const wanted = new Set(flags.map((f) => f.term));
  if (!text || !wanted.size) return [];
  const { folded, map } = foldWithMap(text);
  const ranges: HighlightRange[] = [];
  // Pad so the "(^|[^a-z0-9])" prefix works at the edges; index 0 of the padded string is the pad.
  let remaining = ` ${folded} `;
  for (const t of candidateTerms(folded)) {
    if (t.needle && !remaining.includes(t.needle)) continue;
    if (!t.test.test(remaining)) continue;
    remaining = remaining.replace(t.global, (m: string, pre: string, offset: number) => {
      const from = offset + pre.length - 1; // back to folded-string indexes
      const to = offset + m.length - 1;
      if (wanted.has(t.term) && from >= 0 && to <= folded.length) {
        ranges.push({ start: map[from], end: map[to - 1] + 1, term: t.term });
      }
      // Blank out the match so "peanut butter" doesn't also highlight "butter".
      return pre + ' '.repeat(m.length - pre.length);
    });
  }
  return ranges.sort((a, b) => a.start - b.start);
}

/** Split label text into plain and highlighted pieces, for rendering. */
export function highlightParts(text: string, flags: Pick<Flag, 'term'>[]): { text: string; hit: boolean; term?: string }[] {
  const parts: { text: string; hit: boolean; term?: string }[] = [];
  let at = 0;
  for (const r of highlightRanges(text, flags)) {
    if (r.start < at) continue;
    if (r.start > at) parts.push({ text: text.slice(at, r.start), hit: false });
    parts.push({ text: text.slice(r.start, r.end), hit: true, term: r.term });
    at = r.end;
  }
  if (at < text.length) parts.push({ text: text.slice(at), hit: false });
  return parts;
}

/** Placeholder values some sources put in allergen fields. */
const ALLERGEN_PLACEHOLDER = /^(?:none|nothing|null|unknown|undefined|n\/?a|no|-+)$/i;

/**
 * Tidy a "Contains: …. May contain: …" statement for display: drop placeholders and junk codes,
 * remove duplicates, and don't repeat under "May contain" what the product definitely contains.
 * Unrecognized words are kept (lower-cased): hiding real allergen info would be worse than showing
 * an odd word. Anything that isn't in that two-part shape is returned unchanged.
 */
export function formatAllergens(text: string | null): string | null {
  if (!text) return null;
  const m = /^\s*(?:contains:\s*(.*?))?\s*(?:\.\s*)?(?:may contain:\s*(.*?))?\s*\.?\s*$/i.exec(text);
  if (!m || (m[1] === undefined && m[2] === undefined)) return text;
  const items = (s: string | undefined) => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of (s ?? '').split(',')) {
      const x = raw.trim().toLowerCase();
      if (!x || ALLERGEN_PLACEHOLDER.test(x) || /\d/.test(x) || seen.has(x)) continue;
      seen.add(x);
      out.push(x);
    }
    return out;
  };
  const contains = items(m[1]);
  const containsSet = new Set(contains);
  const mayContain = items(m[2]).filter((x) => !containsSet.has(x));
  const out = [contains.length && `Contains: ${contains.join(', ')}`, mayContain.length && `May contain: ${mayContain.join(', ')}`]
    .filter(Boolean)
    .join('. ');
  return out ? `${out}.` : null;
}

/** Display name for a term key ("molasse" → "Molasses"). */
export function termLabel(term: string): string {
  return TERM_BY_KEY.get(term)?.label ?? sentenceCase(term);
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
    if (rating !== 'green') flags.push({ term: t.term, label: t.label, rating, restrictions: [...names], mayContain: isMayContain });
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

/** One row of the "Diet overview": how a product does against one restriction in the profile. */
export type RestrictionRow = {
  /** Restriction id, or 'overrides' for the user's own per-ingredient ratings. */
  id: string;
  name: string;
  about: string | null;
  rating: Rating;
  /** Ingredients that conflict with this restriction, worst first. */
  flags: Flag[];
};

const RANK: Record<Rating, number> = { red: 0, yellow: 1, green: 2 };

/**
 * The verdict split per restriction, worst first ("Added sugar ✗, Emulsifiers –, Artificial flavors ✓").
 * Uses the same matcher and ratings as computeVerdict, so the rows always agree with the overall
 * verdict: the overall state is the worst row. Restrictions with nothing found are green rows.
 * Returns [] when there is no ingredient data to judge (the verdict is 'unknown').
 */
export function restrictionBreakdown(
  product: { ingredients_text: string | null; allergens_text: string | null },
  restrictions: Record<string, Selection>,
  overrides: Record<string, Rating> = {},
): RestrictionRow[] {
  const all = computeVerdict(product, restrictions, overrides);
  if (all.state === 'unknown') return [];
  const rows: RestrictionRow[] = [];
  for (const [id, sel] of Object.entries(restrictions ?? {})) {
    const r = RESTRICTION_BY_ID[id];
    if (!r || !sel || typeof sel !== 'object') continue;
    // Rated against this restriction alone (overrides still apply to the terms it covers).
    const flags = computeVerdict(product, { [id]: sel }, overrides).flags.filter((f) => f.restrictions.includes(r.name));
    flags.sort((a, b) => RANK[a.rating] - RANK[b.rating]);
    const rating: Rating = flags[0]?.rating ?? 'green';
    rows.push({ id, name: r.name, about: r.about, rating, flags });
  }
  // Ingredients flagged only because the user rated them themselves.
  const own = all.flags.filter((f) => f.restrictions.length === 0);
  if (own.length) {
    own.sort((a, b) => RANK[a.rating] - RANK[b.rating]);
    rows.push({ id: 'overrides', name: 'Your ingredient ratings', about: null, rating: own[0].rating, flags: own });
  }
  return rows.sort((a, b) => RANK[a.rating] - RANK[b.rating] || a.name.localeCompare(b.name));
}

/** The one-line answer under the product name ("May fit your profile"). */
export function fitLabel(v: Verdict): string {
  if (v.state === 'unknown') return v.reason === 'unrecognized' ? 'Couldn’t read the ingredients' : 'Not enough data';
  if (v.reason === 'no_profile') return 'Add your diets to check this';
  const onlyMayContain = v.flags.length > 0 && v.flags.every((f) => f.mayContain);
  if (v.state === 'avoid') return onlyMayContain ? 'May not fit your profile' : 'Doesn’t fit your profile';
  if (v.state === 'limit') return 'May fit your profile';
  return 'Fits your profile';
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

/** The color shown for a verdict (null when there isn't enough data to say). */
export function verdictRating(v: Verdict): Rating | null {
  return v.state === 'avoid' ? 'red' : v.state === 'limit' ? 'yellow' : v.state === 'no_conflicts' ? 'green' : null;
}

/**
 * A confident "fits": no conflicts, nothing that made the check uncertain, and at least one of
 * the profile's terms was actually checked against a real ingredient list. Used for Similar items
 * and the Grocery tab's "Likely works" filter.
 */
export function fitsProfile(v: Verdict): boolean {
  return v.state === 'no_conflicts' && !v.reason && v.matchedTerms > 0;
}
