/**
 * Is a photographed ingredient list the same recipe as the one on file? Photos are read by a vision
 * model, so formatting (punctuation, case, line breaks, "Ingredients:") and the odd misread letter
 * must not count. Any added or removed ingredient must: a single new word (say "sesame" in a long
 * list) makes it a different recipe, because that word could be an allergen.
 */
const words = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/^\s*ingredients?\s*:?/, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .split(' ')
      .filter((w) => w.length > 1),
  );

/** Edit distance ≤ 1 (one letter added, dropped or changed): a typical OCR misread. */
function oneEditApart(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/** Words of `a` that have no counterpart in `b` (exact, or one letter off for words of 5+ letters). */
function unmatched(a: Set<string>, b: Set<string>): string[] {
  const out: string[] = [];
  for (const w of a) {
    if (b.has(w)) continue;
    if (w.length >= 5 && [...b].some((v) => v.length >= 4 && oneEditApart(w, v))) continue;
    out.push(w);
  }
  return out;
}

/** Share of words in common (for reporting; the yes/no decision is sameIngredients). */
export function ingredientSimilarity(a: string, b: string): number {
  const x = words(a);
  const y = words(b);
  if (!x.size && !y.size) return 1;
  let common = 0;
  for (const w of x) if (y.has(w)) common++;
  return common / (x.size + y.size - common);
}

export function sameIngredients(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const x = words(a);
  const y = words(b);
  return unmatched(x, y).length === 0 && unmatched(y, x).length === 0;
}
