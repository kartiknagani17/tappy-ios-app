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

/**
 * Words people add about the photo, not the product. Only removed from the end of a name. Kept
 * deliberately short: "ingredients", "nutrition", "label" and "side" end many real names
 * ("…With Added Ingredients", "Red Label", "Salmon Side"), as the full-database report showed.
 */
/** Only "shelf" (from shelf photos) survived the report, and never in "Elf on the Shelf". */
const TRAILING_JUNK = /(?<!\b(?:the|on|in|of|a|an|top|off))\s+shelf$/i;
/** Names that aren't product names at all. */
const JUNK_NAME = /^(?:test\b|product\b|untitled\b|no name\b|(?:null|none|n\/a|item|food|food item|nutrition facts)$)/i;
/** Placeholders written by people or tools instead of a name, at any length. */
const PLACEHOLDER_NAME = /^(?:unknown\b|read from your label|can'?t determine|no product name)/i;
/** "My Bff" is junk, but "My Deli Sandwich" and the brand "My" are real: see isJunkName. */
const MY_NAME = /^my\s+\S+$/i;
const SMALL_WORDS = new Set(['a', 'an', 'and', 'or', 'of', 'with', 'the', 'in', 'on', 'for', 'to', '&', 'de', 'n']);

/** Brand values that are placeholders, not brands. */
const PLACEHOLDER_BRAND = /^(?:undefined|null|unknown|none|n\/a|generic|original|no brand|unbranded|sans nom|sans marque|sin marca|-+)$/i;
/** Category values that aren't categories ("en:uncategorized"). */
const PLACEHOLDER_CATEGORY = /^(?:[a-z]{2}:)?(?:uncategorized|undefined|unknown|null|none|other)$/i;

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

/**
 * What the cleanup did to a name, for the accuracy report: 'unchanged', 'replaced', 'junk_kept', or
 * the steps applied joined with '+' ("trimmed+case", "deduped").
 */
export type NameFix = string;

const tidy = (name: string) => (name ?? '').replace(/\s+/g, ' ').replace(/^["'“”]+|["'“”]+$/g, '').trim();
const wordSet = (s: string | null | undefined) => new Set((s ?? '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean));

/**
 * A name that isn't a product name at all ("test", "x", "3948764032905", "My Bff"). With the brand
 * and category, "My Steak" from the brand "My" counts as real.
 */
export function isJunkName(name: string | null | undefined, brand?: string | null, category?: string | null): boolean {
  const s = tidy(name ?? '');
  const l = letters(s);
  // No letters ("3948764032905") or a single Latin letter ("G"). "7 up" and "TB" are real names,
  // and one Chinese or Japanese character can be a whole word ("餅").
  if (!l || (l.length < 2 && /^\p{Script=Latin}+$/u.test(l))) return true;
  if (PLACEHOLDER_NAME.test(s)) return true;
  if (JUNK_NAME.test(s) && s.split(' ').filter(Boolean).length <= 3) return true;
  if (MY_NAME.test(s)) {
    // "My <word>" with nothing tying it to the product: a nickname, not a product name.
    const context = new Set([...wordSet(brand), ...wordSet(category)]);
    return ![...wordSet(s)].some((w) => context.has(w));
  }
  return false;
}

/**
 * USDA names often repeat the flavor or variety at the end: "Sweet Teriyaki Beef Jerky, Sweet
 * Teriyaki". Drop a trailing comma-separated part that already appears earlier in the name.
 */
function dropRepeatedTail(s: string): string {
  const parts = s.split(/\s*,\s*/);
  for (let i = 1; i < parts.length; i++) {
    const head = parts.slice(0, i).join(', ');
    const tail = parts.slice(i).join(', ');
    if (tail.length >= 3 && head.toLowerCase().includes(tail.toLowerCase())) return head;
  }
  return s;
}

export function cleanName(name: string, brandField: string | null, category: string | null): { name: string; fix: NameFix } {
  const steps: string[] = [];
  let s = tidy(name);
  const before = s;
  for (let i = 0; i < 2 && TRAILING_JUNK.test(s); i++) s = s.replace(TRAILING_JUNK, '').trim();
  if (s !== before) steps.push('trimmed');

  const brandRaw = (brandField ?? '').split(',')[0]?.trim() ?? '';
  const brand = brandRaw && !PLACEHOLDER_BRAND.test(brandRaw) ? fixCase(brandRaw) : '';

  if (isJunkName(s, brandRaw, category)) {
    const rawCat = (category ?? '').trim();
    const cat = PLACEHOLDER_CATEGORY.test(rawCat) ? '' : rawCat.replace(/^[a-z]{2}:/i, '');
    // Short number-like names are often real ("88/12" beef, Suntory "-196", "D3-10,000"): keep
    // them next to the brand. Barcodes typed in as the name (8+ digits) are dropped.
    const digits = s.replace(/\D/g, '');
    if (brand && /\d/.test(s) && s.length <= 14 && !(digits.length >= 8 && digits.length === s.replace(/\s/g, '').length)) {
      return { name: `${brand} ${s}`, fix: 'replaced' };
    }
    if (brand && cat) return { name: `${brand} ${cat.charAt(0).toLowerCase()}${cat.slice(1)}`, fix: 'replaced' };
    if (brand) return { name: brand, fix: 'replaced' };
    return { name, fix: 'junk_kept' }; // nothing better to show
  }

  const deduped = dropRepeatedTail(s);
  if (deduped !== s) steps.push('deduped');
  const cased = fixCase(deduped);
  if (cased !== deduped) steps.push('case');
  if (cased === name) return { name, fix: 'unchanged' };
  return { name: cased, fix: steps.join('+') || 'unchanged' };
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
