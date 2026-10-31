import type { IncomingRecord } from './products.ts';
import { offRowToRecord } from '../import/off.ts';

/**
 * Live Open Food Facts product lookup, used only behind the OFF_LIVE_LOOKUP feature flag
 * when a barcode is missing from the local database.
 * OFF rules: a custom User-Agent ("AppName/Version (ContactEmail)") and at most
 * 15 product reads per minute per IP. We stay under a configurable lower cap.
 */
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
        headers: { 'User-Agent': this.userAgent },
        signal: AbortSignal.timeout(4000),
      });
      if (res.status === 404) return null;
      if (!res.ok) return 'skipped';
      const body = (await res.json()) as { status?: number; product?: Record<string, unknown> };
      if (body.status !== 1 || !body.product) return null;
      const p = body.product;
      const n = (p.nutriments ?? {}) as Record<string, unknown>;
      // Reuse the dump mapper so live and bulk records look identical.
      return offRowToRecord(
        {
          code: String(p.code ?? code),
          product_name: String(p.product_name ?? ''),
          brands: String(p.brands ?? ''),
          quantity: String(p.quantity ?? ''),
          ingredients_text: String(p.ingredients_text ?? ''),
          allergens: String(p.allergens ?? ''),
          traces: String(p.traces ?? ''),
          categories_en: String(p.categories ?? ''),
          image_url: String(p.image_url ?? ''),
          last_modified_t: String(p.last_modified_t ?? ''),
          countries_tags: Array.isArray(p.countries_tags) ? p.countries_tags.join(',') : String(p.countries_tags ?? ''),
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
