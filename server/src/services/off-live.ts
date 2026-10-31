import type { IncomingRecord } from './products.ts';
import { offRowToRecord } from '../import/off.ts';

/**
 * Live Open Food Facts product lookup, used only behind the OFF_LIVE_LOOKUP feature flag
 * when a barcode is missing from the local database.
 * OFF rules: a custom User-Agent ("AppName/Version (ContactEmail)") and at most
 * 15 product reads per minute per IP. We stay under a configurable lower cap.
 */
const MAX_RESPONSE_BYTES = 1_000_000;
const MAX_FIELD_CHARS = 10_000;

/** Only OFF-hosted https image URLs are passed on to the app (no tracking pixels / javascript: URLs). */
export function safeOffImageUrl(v: unknown): string {
  if (typeof v !== 'string' || v.length > 2048) return '';
  try {
    const u = new URL(v);
    const okHost = u.hostname === 'openfoodfacts.org' || u.hostname.endsWith('.openfoodfacts.org');
    return u.protocol === 'https:' && okHost && !u.username && !u.password ? u.toString() : '';
  } catch {
    return '';
  }
}

const field = (v: unknown) => (v === undefined || v === null ? '' : String(v).slice(0, MAX_FIELD_CHARS));

/** Read a JSON body with a hard byte cap (the declared Content-Length is not trusted). */
async function readJsonLimited(res: Response, maxBytes: number): Promise<unknown> {
  const declared = Number(res.headers.get('content-length') ?? 0);
  if (declared > maxBytes) throw new Error('response too large');
  if (!res.body) return null;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new Error('response too large');
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export class OffLiveClient {
  private calls: number[] = [];
  private readonly userAgent: string;
  private readonly maxPerMinute: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: { userAgent: string; maxPerMinute: number; fetchImpl?: typeof fetch }) {
    this.userAgent = opts.userAgent;
    this.maxPerMinute = opts.maxPerMinute;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  /** Returns a source record, null if OFF has no such product, or 'skipped' when rate-limited/failed. */
  async lookup(gtin14: string): Promise<IncomingRecord | null | 'skipped'> {
    // The code is interpolated into the URL path: only ever a validated 14-digit GTIN.
    if (!/^\d{14}$/.test(gtin14)) return null;
    const now = Date.now();
    this.calls = this.calls.filter((t) => now - t < 60_000);
    if (this.calls.length >= this.maxPerMinute) return 'skipped';
    this.calls.push(now);

    // Query by the EAN-13 form; OFF resolves leading-zero variants of UPC-A codes itself.
    const code = gtin14.startsWith('0') ? gtin14.slice(1) : gtin14;
    const fields = [
      'code',
      'product_name',
      'brands',
      'quantity',
      'ingredients_text',
      'allergens',
      'traces',
      'categories',
      'image_url',
      'last_modified_t',
      'countries_tags',
      'nutriments',
    ].join(',');
    try {
      const res = await this.fetchImpl(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${fields}`, {
        headers: { 'User-Agent': this.userAgent, Accept: 'application/json' },
        redirect: 'error', // never follow a redirect off the fixed OFF API host
        signal: AbortSignal.timeout(4000), // covers the body read too
      });
      if (res.status === 404) return null;
      if (!res.ok) return 'skipped';
      const body = (await readJsonLimited(res, MAX_RESPONSE_BYTES)) as { status?: number; product?: Record<string, unknown> } | null;
      if (!body || typeof body !== 'object' || body.status !== 1 || !body.product || typeof body.product !== 'object') return null;
      const p = body.product;
      const n = (p.nutriments ?? {}) as Record<string, unknown>;
      // Reuse the dump mapper so live and bulk records look identical.
      return offRowToRecord(
        {
          // Always the code we asked for: a response can't attach its data to a different GTIN.
          code,
          product_name: field(p.product_name),
          brands: field(p.brands),
          quantity: field(p.quantity),
          ingredients_text: field(p.ingredients_text),
          allergens: field(p.allergens),
          traces: field(p.traces),
          categories_en: field(p.categories),
          image_url: safeOffImageUrl(p.image_url),
          last_modified_t: field(p.last_modified_t),
          countries_tags: Array.isArray(p.countries_tags) ? field(p.countries_tags.join(',')) : field(p.countries_tags),
          'energy-kcal_100g': String(n['energy-kcal_100g'] ?? ''),
          proteins_100g: String(n.proteins_100g ?? ''),
          fat_100g: String(n.fat_100g ?? ''),
          'saturated-fat_100g': String(n['saturated-fat_100g'] ?? ''),
          carbohydrates_100g: String(n.carbohydrates_100g ?? ''),
          sugars_100g: String(n.sugars_100g ?? ''),
          fiber_100g: String(n.fiber_100g ?? ''),
          sodium_100g: String(n.sodium_100g ?? ''),
        },
        { requireUs: false },
      );
    } catch {
      return 'skipped';
    }
  }
}
