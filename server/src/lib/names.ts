/**
 * Display names for products. Crowd-sourced names are often messy ("oreo cookies shelf",
 * "CREAMY PEANUT BUTTER", "My Bff"). The stored name is never changed (search and photo matching
 * use it as is); this only decides what the app shows:
 *   - junk words people type about the photo are dropped from the end ("… shelf", "… front"),
 *   - all-lower-case or ALL-CAPS names get title case,
 *   - a name that is clearly not a product name falls back to brand + category.
 * The brand is not added to the name: brand fields often hold company names ("COCA-COLA SERVICES
 * SA/NV"), and the app shows the brand on its own line anyway.
 */

/** Words people add about the photo, not the product. Only removed from the end of a name. */
const TRAILING_JUNK = /(?:\s+|^)(?:shelf|front|back|side|photo|pic|picture|image|label|test|unknown|ingredients?|nutrition(?: facts)?)$/i;
/** Names that aren't product names at all. */
const JUNK_NAME = /^(?:my\s|test\b|unknown\b|product\b|untitled\b|no name\b|(?:null|none|n\/a|item|food|food item)$)/i;
const SMALL_WORDS = new Set(['a', 'an', 'and', 'or', 'of', 'with', 'the', 'in', 'on', 'for', 'to', '&', 'de', 'n']);

/** Brand values that are placeholders, not brands. */
const PLACEHOLDER_BRAND = /^(?:undefined|null|unknown|none|n\/a|generic|original|-+)$/i;

const letters = (s: string) => s.replace(/[^\p{L}]/gu, '');

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(' ')
    .map((w, i) =>
      i > 0 && SMALL_WORDS.has(w)
        ? w
        : // Capitalize a word that starts with a letter, after any opening punctuation ("(organic)"), never "50cl".
          w.replace(/^([("'“]*)(\p{L})/u, (_, pre: string, c: string) => pre + c.toUpperCase()),
    )
    .join(' ');
}

/** Fix case when the source shouted or didn't bother: "oreo cookies" / "OREO COOKIES" → "Oreo Cookies". */
function fixCase(s: string): string {
  const l = letters(s);
  if (!l) return s;
  const allLower = l === l.toLowerCase();
  const allUpper = l === l.toUpperCase() && l.length > 3;
  return allLower || allUpper ? titleCase(s) : s;
}

/** What the cleanup did to a name (for the accuracy report). */
export type NameFix = 'unchanged' | 'trimmed' | 'case' | 'trimmed_and_case' | 'replaced' | 'junk_kept';

const tidy = (name: string) => (name ?? '').replace(/\s+/g, ' ').replace(/^["'“”]+|["'“”]+$/g, '').trim();

/** A name that isn't a product name at all ("My Bff", "test", "x"). */
export function isJunkName(name: string | null | undefined): boolean {
  const s = tidy(name ?? '');
  const l = letters(s);
  // No letters ("3948764032905"), or one or two Latin letters ("G"). One Chinese or Japanese
  // character can be a whole word ("餅"), so short non-Latin names are kept.
  if (!l || (l.length < 3 && /^\p{Script=Latin}+$/u.test(l))) return true;
  return JUNK_NAME.test(s) && s.split(' ').filter(Boolean).length <= 3;
}

export function cleanName(name: string, brandField: string | null, category: string | null): { name: string; fix: NameFix } {
  const original = tidy(name);
  let s = original;
  for (let i = 0; i < 3 && TRAILING_JUNK.test(s) && s.split(' ').length > 1; i++) s = s.replace(TRAILING_JUNK, '').trim();
  const trimmed = s !== original;

  const brandRaw = (brandField ?? '').split(',')[0]?.trim() ?? '';
  const brand = brandRaw && !PLACEHOLDER_BRAND.test(brandRaw) ? fixCase(brandRaw) : '';

  if (isJunkName(s)) {
    const cat = (category ?? '').trim();
    if (brand && cat) return { name: `${brand} ${cat.charAt(0).toLowerCase()}${cat.slice(1)}`, fix: 'replaced' };
    if (brand) return { name: brand, fix: 'replaced' };
    return { name, fix: 'junk_kept' }; // nothing better to show
  }
  const cased = fixCase(s);
  const recased = cased !== s;
  if (cased === name) return { name, fix: 'unchanged' };
  return { name: cased, fix: trimmed && recased ? 'trimmed_and_case' : trimmed ? 'trimmed' : recased ? 'case' : 'unchanged' };
}

export function displayName(name: string, brandField: string | null, category: string | null): string {
  return cleanName(name, brandField, category).name;
}

/**
 * The best stored name when several sources have one: the first that isn't junk, in the given
 * order (callers pass the most trustworthy source first, e.g. USDA's manufacturer-supplied name).
 */
export function pickName(candidates: (string | null | undefined)[]): string | null {
  const usable = candidates.map((c) => tidy(c ?? '')).filter(Boolean);
  return usable.find((c) => !isJunkName(c)) ?? usable[0] ?? null;
}
