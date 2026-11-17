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
const JUNK_NAME = /^(?:my|test|unknown|product|null|none|n\/a|item|food|untitled|no name)\b/i;
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

export function displayName(name: string, brandField: string | null, category: string | null): string {
  let s = (name ?? '').replace(/\s+/g, ' ').replace(/^["'“”]+|["'“”]+$/g, '').trim();
  for (let i = 0; i < 3 && TRAILING_JUNK.test(s) && s.split(' ').length > 1; i++) s = s.replace(TRAILING_JUNK, '').trim();

  const brandRaw = (brandField ?? '').split(',')[0]?.trim() ?? '';
  const brand = brandRaw && !PLACEHOLDER_BRAND.test(brandRaw) ? fixCase(brandRaw) : '';
  const words = s.split(' ').filter(Boolean);
  const junk = letters(s).length < 3 || (JUNK_NAME.test(s) && words.length <= 3);

  if (junk) {
    const cat = (category ?? '').trim();
    if (brand && cat) return `${brand} ${cat.charAt(0).toLowerCase()}${cat.slice(1)}`;
    if (brand) return brand;
    return name; // nothing better to show
  }
  return fixCase(s);
}
