import type { IncomingRecord } from './products.ts';
import { offRowToRecord } from '../import/off.ts';
import { OFF_JSON_FIELDS, offJsonToRow } from '../import/off-json.ts';

export { safeOffImageUrl } from '../import/off-json.ts';

/**
 * Live Open Food Facts product lookup (OFF_LIVE_LOOKUP): for barcodes missing from the local
 * database, and to refresh products whose data is old.
 * OFF rules: a custom User-Agent ("AppName/Version (ContactEmail)") and at most
 * 15 product reads per minute per IP. We stay under a configurable lower cap.
 */
const MAX_RESPONSE_BYTES = 1_000_000;

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
    const fields = OFF_JSON_FIELDS.join(',');
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
      // Reuse the dump mapper so live and bulk records look identical. Always the code we asked
      // for: a response can't attach its data to a different GTIN.
      return offRowToRecord(offJsonToRow(body.product, code), { requireUs: false });
    } catch {
      return 'skipped';
    }
  }
}
