import type { IncomingMessage, ServerResponse } from 'node:http';
import { isIP } from 'node:net';
import { photoScanningEnabled, type Config } from '../config.ts';
import type { DB } from '../db/index.ts';
import { ImageError, probeImage } from '../lib/image.ts';
import { logError } from '../lib/log.ts';
import { consumeDailyQuota, ipKey, LimitError, RateLimiter, type QuotaSubject } from '../services/limits.ts';
import { getProductById, reportProduct, sanitizeReason, toPublicProduct } from '../services/products.ts';
import type { ScanService } from '../services/scan.ts';

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly headers: Record<string, string>;
  constructor(status: number, code: string, message: string, headers: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.headers = headers;
  }
}

const USER_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const JSON_BODY_LIMIT = 16 * 1024; // every non-image endpoint
const MAX_BARCODE_CHARS = 64;

/** Applied to every response: JSON API, never cached, never framed or sniffed. */
const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'no-store',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-site',
};

type Route = { name: string; pattern: RegExp; methods: string[] };
const ROUTES: Route[] = [
  { name: 'health', pattern: /^\/api\/health$/, methods: ['GET', 'HEAD'] },
  { name: 'product', pattern: /^\/api\/products\/(\d{1,15})$/, methods: ['GET', 'HEAD'] },
  { name: 'report', pattern: /^\/api\/products\/(\d{1,15})\/report$/, methods: ['POST'] },
  { name: 'barcode', pattern: /^\/api\/scan\/barcode$/, methods: ['POST'] },
  { name: 'front', pattern: /^\/api\/scan\/front$/, methods: ['POST'] },
  { name: 'confirm', pattern: /^\/api\/scan\/front\/confirm$/, methods: ['POST'] },
  { name: 'label', pattern: /^\/api\/scan\/label$/, methods: ['POST'] },
];

export type AppDeps = { db: DB; config: Config; scan: ScanService; limiter?: RateLimiter; ipLimiter?: RateLimiter };

/** Plain node:http request handler. Routes:
 *  POST /api/scan/barcode        { barcode }
 *  POST /api/scan/front          { image_base64, contribute? }
 *  POST /api/scan/front/confirm  { vision_cache_id, product_id }
 *  POST /api/scan/label          { image_base64, gtin?, front_hash?, contribute? }
 *  POST /api/products/:id/report { reason? }
 *  GET  /api/products/:id
 *  GET  /api/health
 * Every POST needs an X-Tapi-User header (anonymous device id) and Content-Type: application/json.
 */
export function createApp({
  db,
  config,
  scan,
  limiter = new RateLimiter(config.rateLimitPerMinute),
  ipLimiter = new RateLimiter(config.rateLimitPerMinute * 4),
}: AppDeps) {
  const maxImageBody = Math.ceil(config.visionMaxImageBytes * 1.4) + 4096; // base64 overhead
  const photosEnabled = photoScanningEnabled(config);
  const corsAny = config.corsOrigins.includes('*');
  const corsAllowed = new Set(config.corsOrigins);

  const applyCors = (req: IncomingMessage, res: ServerResponse) => {
    const origin = req.headers.origin;
    if (!origin || !(corsAny || corsAllowed.has(origin))) return false;
    res.setHeader('Access-Control-Allow-Origin', corsAny ? '*' : origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Tapi-User');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '600');
    return true;
  };

  async function route(req: IncomingMessage, res: ServerResponse) {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
    applyCors(req, res);
    if (req.method === 'OPTIONS') return send(res, 204, null);

    let pathname: string;
    try {
      pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    } catch {
      throw new HttpError(400, 'bad_request', 'Malformed URL');
    }
    const r = ROUTES.find((x) => x.pattern.test(pathname));
    if (!r) throw new HttpError(404, 'not_found', 'Not found');
    if (!r.methods.includes(req.method ?? '')) {
      throw new HttpError(405, 'method_not_allowed', 'Method not allowed', { Allow: [...r.methods, 'OPTIONS'].join(', ') });
    }
    const idParam = Number(r.pattern.exec(pathname)?.[1]);

    if (r.name === 'health') {
      try {
        db.prepare('SELECT 1').get();
      } catch {
        return send(res, 503, { ok: false });
      }
      return send(res, 200, { ok: true, photo_scanning: photosEnabled });
    }

    const ip = clientIp(req, config.trustProxyHops);
    const ipk = ipKey(ip);
    // IP first: rotating device ids from one address can't grow the per-user limiter past the IP limit.
    ipLimiter.check(`ip:${ipk}`);

    if (r.name === 'product') {
      const p = getProductById(db, idParam);
      if (!p) throw new HttpError(404, 'not_found', 'Product not found');
      return send(res, 200, { product: toPublicProduct(p) });
    }

    const userId = String(req.headers['x-tapi-user'] ?? '');
    if (!USER_ID_RE.test(userId)) throw new HttpError(400, 'missing_user', 'X-Tapi-User header is required');
    limiter.check(`u:${userId}`);

    const isPhoto = r.name === 'front' || r.name === 'label';
    if (isPhoto && !photosEnabled) {
      throw new HttpError(503, 'photo_scanning_disabled', 'Photo scanning is not available right now. Scan the barcode instead.');
    }
    const body = await readJson(req, isPhoto ? maxImageBody : JSON_BODY_LIMIT);

    const quota = (kind: 'barcode' | 'photo') => {
      const subjects: QuotaSubject[] = [{ key: userId, limits: config }];
      if (ipk !== 'unknown') {
        subjects.push({
          key: `ip:${ipk}`,
          limits: { dailyFreeScans: config.ipDailyScans, dailyFreePhotoScans: config.ipDailyPhotoScans },
          message: {
            barcode: 'Too many scans from your network today. Please try again tomorrow.',
            photo: 'Too many photo scans from your network today. Scan the barcode instead.',
          },
        });
      }
      consumeDailyQuota(db, subjects, kind);
    };

    switch (r.name) {
      case 'barcode': {
        const barcode = readBarcode(body.barcode);
        quota('barcode');
        return send(res, 200, await scan.resolveBarcode(barcode, userId));
      }
      case 'front': {
        const image = decodeImage(body.image_base64, config.visionMaxImageBytes);
        await probeImage(image, config.imageMaxInputPixels); // invalid uploads don't cost quota
        quota('photo');
        return send(res, 200, await scan.scanFront(image, userId, { contribute: body.contribute === true }));
      }
      case 'confirm': {
        const productId = body.product_id;
        if (typeof productId !== 'number' || !Number.isSafeInteger(productId) || productId <= 0) {
          throw new HttpError(400, 'bad_request', 'product_id must be a positive integer');
        }
        const cacheId = body.vision_cache_id;
        if (cacheId === null || cacheId === undefined) {
          // Nothing to remember (no photo result); just echo the product.
          const p = getProductById(db, productId);
          if (!p) throw new HttpError(404, 'not_found', 'Product not found');
          return send(res, 200, { product: toPublicProduct(p) });
        }
        if (typeof cacheId !== 'number' || !Number.isSafeInteger(cacheId) || cacheId <= 0) {
          throw new HttpError(400, 'bad_request', 'vision_cache_id must be a positive integer or null');
        }
        const out = scan.confirmFront(cacheId, productId, userId, ipk);
        if (!out.ok && out.reason === 'not_found') throw new HttpError(404, 'not_found', 'Product not found');
        if (!out.ok) throw new HttpError(400, 'product_not_offered', 'That product was not one of the matches for this photo.');
        return send(res, 200, { product: out.product });
      }
      case 'label': {
        const image = decodeImage(body.image_base64, config.visionMaxImageBytes);
        await probeImage(image, config.imageMaxInputPixels);
        const gtin = typeof body.gtin === 'string' || typeof body.gtin === 'number' ? String(body.gtin).slice(0, MAX_BARCODE_CHARS) : null;
        quota('photo');
        return send(
          res,
          200,
          await scan.scanLabel(image, userId, {
            gtin,
            frontHash: typeof body.front_hash === 'string' ? body.front_hash.slice(0, 64) : null,
            contribute: body.contribute === true,
          }),
        );
      }
      case 'report': {
        const p = reportProduct(db, idParam, userId, sanitizeReason(body.reason));
        if (!p) throw new HttpError(404, 'not_found', 'Product not found');
        return send(res, 200, { ok: true, already_reported: p.duplicate, product: toPublicProduct(p) });
      }
    }
    throw new HttpError(404, 'not_found', 'Not found');
  }

  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      await route(req, res);
    } catch (e) {
      try {
        if (res.headersSent) {
          res.destroy();
          return;
        }
        if (e instanceof LimitError) {
          res.setHeader('Retry-After', String(e.retryAfterSeconds));
          return send(res, 429, { error: e.code, message: e.message, retry_after_seconds: e.retryAfterSeconds });
        }
        if (e instanceof HttpError) {
          for (const [k, v] of Object.entries(e.headers)) res.setHeader(k, v);
          // Unread request body (e.g. 413): don't keep the connection for another request.
          if (!req.complete) res.setHeader('Connection', 'close');
          return send(res, e.status, { error: e.code, message: e.message });
        }
        if (e instanceof ImageError) return send(res, 400, { error: e.code, message: 'That image could not be read.' });
        logError(`${req.method} ${(req.url ?? '').slice(0, 200)}`, e);
        if (!req.complete) res.setHeader('Connection', 'close');
        return send(res, 500, { error: 'internal', message: 'Something went wrong' });
      } catch (inner) {
        logError('error handler', inner);
        res.destroy();
      }
    }
  };
}

/**
 * Client address for rate limits. X-Forwarded-For is only honored with TRUST_PROXY hops configured,
 * and then read from the right: the entry added by the outermost trusted proxy, which a client can't forge.
 */
export function clientIp(req: IncomingMessage, trustedHops: number): string {
  const remote = req.socket.remoteAddress ?? 'unknown';
  if (!trustedHops) return remote;
  const xff = String(req.headers['x-forwarded-for'] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const chain = [...xff, remote];
  const candidate = chain[Math.max(0, chain.length - 1 - trustedHops)];
  return isIP(candidate) ? candidate : remote;
}

function send(res: ServerResponse, status: number, body: unknown) {
  if (body === null) {
    res.writeHead(status).end();
    return;
  }
  const json = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(json) }).end(json);
}

/** Keys that could reach an object prototype if a parsed body were ever merged into another object. */
const POISON_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export async function readJson(req: IncomingMessage, maxBytes: number): Promise<Record<string, unknown>> {
  const declared = req.headers['content-length'];
  const hasBody = (declared !== undefined && declared !== '0') || req.headers['transfer-encoding'] !== undefined;
  if (hasBody) {
    const type = String(req.headers['content-type'] ?? '')
      .split(';')[0]
      .trim()
      .toLowerCase();
    if (type !== 'application/json') throw new HttpError(415, 'unsupported_media_type', 'Content-Type must be application/json');
  }
  if (declared !== undefined && Number(declared) > maxBytes) throw new HttpError(413, 'too_large', 'Request body too large');

  const raw = await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    const finish = (err: Error | null, buf?: Buffer) => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve(buf!);
    };
    req.on('data', (chunk: Buffer) => {
      if (settled) return; // over the limit: discard the rest; the connection is closed after the 413
      size += chunk.length;
      if (size > maxBytes) return finish(new HttpError(413, 'too_large', 'Request body too large'));
      chunks.push(chunk);
    });
    req.on('end', () => finish(null, Buffer.concat(chunks)));
    req.on('error', (e) => finish(e));
    req.on('close', () => {
      if (!req.complete) finish(new HttpError(400, 'aborted', 'Request aborted'));
    });
  });

  if (!raw.length) return {};
  try {
    const parsed: unknown = JSON.parse(raw.toString('utf8'), (k, v) => (POISON_KEYS.has(k) ? undefined : v));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    return parsed as Record<string, unknown>;
  } catch {
    throw new HttpError(400, 'bad_json', 'Body must be a JSON object');
  }
}

/** Barcode as typed or scanned: digits with optional spaces/dashes. Numbers are accepted (leading zeros are lost). */
function readBarcode(value: unknown): string {
  let s: string;
  if (typeof value === 'string') s = value;
  else if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) s = String(value);
  else throw new HttpError(400, 'bad_request', 'barcode is required');
  if (s.length > MAX_BARCODE_CHARS) throw new HttpError(400, 'bad_request', 'barcode is too long');
  s = s.normalize('NFKC').trim(); // full-width digits -> ASCII
  if (!s) throw new HttpError(400, 'bad_request', 'barcode is required');
  return s;
}

const DATA_URL_RE = /^data:image\/(?:jpeg|jpg|png|webp|heic|heif);base64,/i;
const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

export function decodeImage(value: unknown, maxBytes: number): Buffer {
  if (typeof value !== 'string' || !value) throw new HttpError(400, 'bad_request', 'image_base64 is required');
  const b64 = value.replace(DATA_URL_RE, '').replace(/[\r\n\t ]/g, '');
  if (Math.floor((b64.length * 3) / 4) > maxBytes + 3) {
    throw new HttpError(413, 'too_large', 'Image too large; resize to 1024px before upload');
  }
  if (!b64 || !BASE64_RE.test(b64) || b64.length % 4 === 1) {
    throw new HttpError(400, 'bad_request', 'image_base64 is not valid base64');
  }
  const buf = Buffer.from(b64, 'base64');
  if (!buf.length) throw new HttpError(400, 'bad_request', 'image_base64 is not valid base64');
  if (buf.length > maxBytes) throw new HttpError(413, 'too_large', 'Image too large; resize to 1024px before upload');
  return buf;
}
