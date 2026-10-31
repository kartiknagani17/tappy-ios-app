/**
 * Ranks database candidates against what the vision model read off a package front.
 * Score is 0..1: a weighted blend of brand, name, variant and size similarity. Components
 * the photo didn't provide are left out and the remaining weights are renormalized.
 */

export type MatchQuery = {
  brand?: string | null;
  product_name?: string | null;
  variant_or_flavor?: string | null;
  size_text?: string | null;
};

export type MatchCandidate = {
  id: number;
  brand: string | null;
  name: string;
  variant_or_flavor: string | null;
  size_text: string | null;
};

export type Thresholds = { autoConfirm: number; chooseFrom: number; ambiguityMargin: number };
export type Decision = 'confirm_top' | 'choose_top3' | 'needs_barcode_or_label';

export const WEIGHTS = { brand: 0.3, name: 0.45, variant: 0.1, size: 0.15 };

const STOP = new Set(['the', 'and', 'with', 'of', 'a', 'an', 'in', 'for', 'brand', 'inc', 'llc', 'co', 'company', 'foods', 'food']);

export function normalizeText(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function tokens(s: string | null | undefined): string[] {
  return normalizeText(s)
    .split(' ')
    .filter((t) => t && !STOP.has(t));
}

function trigrams(s: string): Map<string, number> {
  const padded = `  ${s} `;
  const m = new Map<string, number>();
  for (let i = 0; i < padded.length - 2; i++) {
    const g = padded.slice(i, i + 3);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

/** Sørensen–Dice coefficient over character trigrams (0..1). */
export function trigramSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ta = trigrams(na);
  const tb = trigrams(nb);
  let overlap = 0;
  let total = 0;
  for (const [g, c] of ta) {
    overlap += Math.min(c, tb.get(g) ?? 0);
    total += c;
  }
  for (const c of tb.values()) total += c;
  return (2 * overlap) / total;
}

/** Fraction of query tokens found (fuzzily) in the candidate text. */
export function tokenCoverage(query: string | null | undefined, candidate: string | null | undefined): number {
  const q = tokens(query);
  if (!q.length) return 0;
  const c = tokens(candidate);
  if (!c.length) return 0;
  let hit = 0;
  for (const t of q) {
    if (c.includes(t)) hit += 1;
    else if (
      c.some((ct) => (ct.length >= 4 && t.length >= 4 && (ct.startsWith(t) || t.startsWith(ct))) || trigramSimilarity(ct, t) >= 0.75)
    )
      hit += 0.8;
  }
  return hit / q.length;
}

// ---------- package size ----------
export type ParsedSize = { value: number; dim: 'mass' | 'volume' | 'count' };

const UNIT: Record<string, { f: number; dim: ParsedSize['dim'] }> = {
  g: { f: 1, dim: 'mass' },
  gram: { f: 1, dim: 'mass' },
  grams: { f: 1, dim: 'mass' },
  kg: { f: 1000, dim: 'mass' },
  mg: { f: 0.001, dim: 'mass' },
  oz: { f: 28.3495, dim: 'mass' },
  ounce: { f: 28.3495, dim: 'mass' },
  ounces: { f: 28.3495, dim: 'mass' },
  lb: { f: 453.592, dim: 'mass' },
  lbs: { f: 453.592, dim: 'mass' },
  pound: { f: 453.592, dim: 'mass' },
  ml: { f: 1, dim: 'volume' },
  l: { f: 1000, dim: 'volume' },
  liter: { f: 1000, dim: 'volume' },
  litre: { f: 1000, dim: 'volume' },
  floz: { f: 29.5735, dim: 'volume' },
  gal: { f: 3785.41, dim: 'volume' },
  gallon: { f: 3785.41, dim: 'volume' },
  qt: { f: 946.353, dim: 'volume' },
  quart: { f: 946.353, dim: 'volume' },
  pt: { f: 473.176, dim: 'volume' },
  pint: { f: 473.176, dim: 'volume' },
  ct: { f: 1, dim: 'count' },
  count: { f: 1, dim: 'count' },
  pack: { f: 1, dim: 'count' },
  pk: { f: 1, dim: 'count' },
};

/** All sizes mentioned, e.g. "NET WT 27 OZ (1 LB 11 OZ) 765g" → [765g, 765g(27oz)...]. */
export function parseSizes(text: string | null | undefined): ParsedSize[] {
  const s = (text ?? '')
    .toLowerCase()
    .replace(/fl\.?\s*oz/g, 'floz')
    .replace(/,/g, '.');
  const out: ParsedSize[] = [];
  const re =
    /(\d+(?:\.\d+)?)\s*(floz|kg|mg|g|grams?|oz|ounces?|lbs?|pounds?|ml|l|lit(?:er|re)s?|gal(?:lons?)?|qt|quarts?|pt|pints?|ct|count|pack|pk)\b/g;
  for (const m of s.matchAll(re)) {
    let unit = m[2];
    if (unit.startsWith('lit')) unit = 'liter';
    if (unit.startsWith('gal')) unit = 'gal';
    const u = UNIT[unit] ?? UNIT[unit.replace(/s$/, '')];
    if (u) out.push({ value: Number(m[1]) * u.f, dim: u.dim });
  }
  return out;
}

/** 1 = same size, 0.5 = close (within 10%), 0 = different. null = can't compare. */
export function sizeSimilarity(a: string | null | undefined, b: string | null | undefined): number | null {
  const sa = parseSizes(a);
  const sb = parseSizes(b);
  let best: number | null = null;
  for (const x of sa) {
    for (const y of sb) {
      if (x.dim !== y.dim || !x.value || !y.value) continue;
      const ratio = Math.min(x.value, y.value) / Math.max(x.value, y.value);
      const score = ratio >= 0.97 ? 1 : ratio >= 0.9 ? 0.5 : 0;
      best = best === null ? score : Math.max(best, score);
    }
  }
  return best;
}

// ---------- scoring ----------
export function scoreCandidate(q: MatchQuery, c: MatchCandidate) {
  const parts: { key: keyof typeof WEIGHTS; value: number }[] = [];
  const candidateAll = [c.brand, c.name, c.variant_or_flavor].filter(Boolean).join(' ');

  if (q.brand) {
    const brandText = c.brand ?? '';
    // Many datasets put the brand only in the product name.
    parts.push({ key: 'brand', value: Math.max(trigramSimilarity(q.brand, brandText), tokenCoverage(q.brand, candidateAll)) });
  }
  if (q.product_name) {
    const nameText = [c.name, c.variant_or_flavor].filter(Boolean).join(' ');
    parts.push({
      key: 'name',
      value: Math.max(trigramSimilarity(q.product_name, nameText), 0.9 * tokenCoverage(q.product_name, candidateAll)),
    });
  }
  if (q.variant_or_flavor) {
    parts.push({ key: 'variant', value: tokenCoverage(q.variant_or_flavor, candidateAll) });
  }
  const size = q.size_text ? sizeSimilarity(q.size_text, [c.size_text, c.name].filter(Boolean).join(' ')) : null;
  if (size !== null) parts.push({ key: 'size', value: size });

  const totalWeight = parts.reduce((a, p) => a + WEIGHTS[p.key], 0);
  const score = totalWeight ? parts.reduce((a, p) => a + WEIGHTS[p.key] * p.value, 0) / totalWeight : 0;
  // A photo with only one weak signal (e.g. brand only) can't be trusted for auto-confirm.
  const capped = parts.length === 1 ? Math.min(score, 0.7) : score;
  return {
    score: Math.round(capped * 1000) / 1000,
    components: Object.fromEntries(parts.map((p) => [p.key, Math.round(p.value * 1000) / 1000])),
  };
}

export function rankCandidates<T extends MatchCandidate>(q: MatchQuery, candidates: T[]) {
  return candidates.map((c) => ({ candidate: c, ...scoreCandidate(q, c) })).sort((a, b) => b.score - a.score);
}

/**
 * >= autoConfirm: one-tap confirm of the top match; chooseFrom..autoConfirm: pick from top 3;
 * below chooseFrom: ask for barcode or ingredient photo. If the runner-up is within
 * ambiguityMargin of the top (e.g. several flavors of one product), show the top 3 instead
 * of a single match. The user always confirms before any verdict is shown.
 */
export function decide(scores: number[], t: Thresholds): Decision {
  const [top, second] = scores;
  if (top === undefined || top < t.chooseFrom) return 'needs_barcode_or_label';
  if (top >= t.autoConfirm && (second === undefined || top - second > t.ambiguityMargin)) return 'confirm_top';
  return 'choose_top3';
}
