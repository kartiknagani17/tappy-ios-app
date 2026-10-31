import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Config } from '../config.ts';
import type { DB } from '../db/index.ts';
import { ImageError } from '../lib/image.ts';
import { consumeDailyScan, LimitError, RateLimiter } from '../services/limits.ts';
import { getProductById, reportProduct, toPublicProduct } from '../services/products.ts';
import type { ScanService } from '../services/scan.ts';

class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const USER_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

export type AppDeps = { db: DB; config: Config; scan: ScanService; limiter?: RateLimiter };

/** Plain node:http request handler. Routes:
 *  POST /api/scan/barcode        { barcode }
 *  POST /api/scan/front          { image_base64, contribute? }
 *  POST /api/scan/front/confirm  { vision_cache_id, product_id }
 *  POST /api/scan/label          { image_base64, gtin?, front_hash?, contribute? }
 *  POST /api/products/:id/report { reason? }
 *  GET  /api/products/:id
 *  GET  /api/health
 * Every scan request needs an X-Tapi-User header (anonymous device id).
 */
export function createApp({ db, config, scan, limiter = new RateLimiter(config.rateLimitPerMinute) }: AppDeps) {
  const ipLimiter = new RateLimiter(config.rateLimitPerMinute * 4);
  const maxBody = Math.ceil(config.visionMaxImageBytes * 1.4) + 4096; // base64 overhead

  return async function handle(req: IncomingMessage, res: ServerResponse) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Tapi-User');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return send(res, 204, null);

    const url = new URL(req.url ?? '/', 'http://localhost');
    try {
      if (req.method === 'GET' && url.pathname === '/api/health') return send(res, 200, { ok: true });

      const productMatch = url.pathname.match(/^\/api\/products\/(\d+)(\/report)?$/);
      if (req.method === 'GET' && productMatch && !productMatch[2]) {
        const p = getProductById(db, Number(productMatch[1]));
        if (!p) throw new HttpError(404, 'not_found', 'Product not found');
        return send(res, 200, { product: toPublicProduct(p) });
      }

      if (req.method !== 'POST') throw new HttpError(404, 'not_found', 'Not found');

      const userId = String(req.headers['x-tapi-user'] ?? '');
      if (!USER_ID_RE.test(userId)) throw new HttpError(400, 'missing_user', 'X-Tapi-User header is required');
      const ip = (String(req.headers['x-forwarded-for'] ?? '').split(',')[0] || req.socket.remoteAddress || 'unknown').trim();
      limiter.check(`u:${userId}`);
      ipLimiter.check(`ip:${ip}`);

      const body = await readJson(req, maxBody);

      switch (url.pathname) {
        case '/api/scan/barcode': {
          const barcode = typeof body.barcode === 'string' || typeof body.barcode === 'number' ? String(body.barcode) : '';
          if (!barcode) throw new HttpError(400, 'bad_request', 'barcode is required');
          consumeDailyScan(db, userId, 'barcode', config);
          return send(res, 200, await scan.resolveBarcode(barcode, userId));
        }
        case '/api/scan/front': {
          const image = decodeImage(body.image_base64, config.visionMaxImageBytes);
          consumeDailyScan(db, userId, 'photo', config);
          return send(res, 200, await scan.scanFront(image, userId, { contribute: body.contribute === true }));
        }
        case '/api/scan/front/confirm': {
          const cacheId = Number(body.vision_cache_id);
          const productId = Number(body.product_id);
          if (!Number.isInteger(productId)) throw new HttpError(400, 'bad_request', 'product_id is required');
          const product = Number.isInteger(cacheId) ? scan.confirmFront(cacheId, productId) : null;
          const p = product ?? (getProductById(db, productId) ? toPublicProduct(getProductById(db, productId)!) : null);
          if (!p) throw new HttpError(404, 'not_found', 'Product not found');
          return send(res, 200, { product: p });
        }
        case '/api/scan/label': {
          const image = decodeImage(body.image_base64, config.visionMaxImageBytes);
          consumeDailyScan(db, userId, 'photo', config);
          return send(
            res,
            200,
            await scan.scanLabel(image, userId, {
              gtin: typeof body.gtin === 'string' ? body.gtin : null,
              frontHash: typeof body.front_hash === 'string' ? body.front_hash : null,
              contribute: body.contribute === true,
            }),
          );
        }
      }

      if (productMatch?.[2]) {
        const reason = typeof body.reason === 'string' ? body.reason.slice(0, 1000) : null;
        const p = reportProduct(db, Number(productMatch[1]), userId, reason);
        if (!p) throw new HttpError(404, 'not_found', 'Product not found');
        return send(res, 200, { ok: true, product: toPublicProduct(p) });
      }

      throw new HttpError(404, 'not_found', 'Not found');
    } catch (e) {
      if (e instanceof LimitError) {
        res.setHeader('Retry-After', String(e.retryAfterSeconds));
        return send(res, 429, { error: e.code, message: e.message, retry_after_seconds: e.retryAfterSeconds });
      }
      if (e instanceof HttpError) return send(res, e.status, { error: e.code, message: e.message });
      if (e instanceof ImageError) return send(res, 400, { error: e.code, message: 'That image could not be read.' });
      console.error(e);
      return send(res, 500, { error: 'internal', message: 'Something went wrong' });
    }
  };
}

function send(res: ServerResponse, status: number, body: unknown) {
  if (body === null) {
    res.writeHead(status).end();
    return;
  }
  res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage, maxBytes: number): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > maxBytes) throw new HttpError(413, 'too_large', 'Request body too large');
    chunks.push(chunk as Buffer);
  }
  if (!size) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    return parsed as Record<string, unknown>;
  } catch {
    throw new HttpError(400, 'bad_json', 'Body must be a JSON object');
  }
}

function decodeImage(value: unknown, maxBytes: number): Buffer {
  if (typeof value !== 'string' || !value) throw new HttpError(400, 'bad_request', 'image_base64 is required');
  const b64 = value.replace(/^data:image\/[a-z]+;base64,/, '');
  const buf = Buffer.from(b64, 'base64');
  if (!buf.length) throw new HttpError(400, 'bad_request', 'image_base64 is not valid base64');
  if (buf.length > maxBytes) throw new HttpError(413, 'too_large', 'Image too large; resize to 1024px before upload');
  return buf;
}
