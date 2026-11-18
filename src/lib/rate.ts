import type { ApiProduct } from './api';
import type { Rating } from './store';
import { computeVerdict, fitsProfile, verdictRating } from './verdict';

export type Rated = { p: ApiProduct; rating: Rating | null; fits: boolean };
type Profile = Parameters<typeof computeVerdict>[1];
type Overrides = Parameters<typeof computeVerdict>[2];

/**
 * Verdicts for product lists (Grocery), remembered per profile. Rating a product means running every
 * ingredient term against its label, which is slow on a phone, so a product is only rated once per
 * profile: switching aisles, "View all" and coming back to the tab reuse earlier results.
 */
let cacheKey = '';
let cache = new Map<string, { rating: Rating | null; fits: boolean }>();
const MAX_CACHED = 3000;

function cacheFor(restrictions: Profile, overrides: Overrides) {
  const key = JSON.stringify([restrictions ?? {}, overrides ?? {}]);
  if (key !== cacheKey || cache.size > MAX_CACHED) {
    cacheKey = key;
    cache = new Map();
  }
  return cache;
}

function rateOne(p: ApiProduct, restrictions: Profile, overrides: Overrides, hasProfile: boolean, memo: ReturnType<typeof cacheFor>): Rated {
  const id = `${p.gtin14}:${p.id ?? ''}:${p.ingredients_text?.length ?? 0}:${p.allergens_text?.length ?? 0}`;
  let hit = memo.get(id);
  if (!hit) {
    const v = computeVerdict(p, restrictions, overrides);
    hit = { rating: verdictRating(v), fits: fitsProfile(v) };
    memo.set(id, hit);
  }
  return { p, rating: hasProfile ? hit.rating : null, fits: hit.fits };
}

/**
 * Rate `products` in order. With `onlyFits`, keep only the ones that fit; stop as soon as `limit`
 * results are collected so a carousel that shows 12 doesn't rate the whole page.
 */
export function rateProducts(
  products: ApiProduct[],
  restrictions: Profile,
  overrides: Overrides,
  opts: { hasProfile: boolean; onlyFits?: boolean; limit?: number },
): Rated[] {
  const memo = cacheFor(restrictions, overrides);
  const out: Rated[] = [];
  const limit = opts.limit ?? Infinity;
  for (const p of products) {
    if (out.length >= limit) break;
    const r = rateOne(p, restrictions, overrides, opts.hasProfile, memo);
    if (!opts.onlyFits || r.fits) out.push(r);
  }
  return out;
}
