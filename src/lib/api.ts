import * as Crypto from 'expo-crypto';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useStore } from './store';

/** Backend base URL. On a physical iPhone, point this at your computer's LAN IP. */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8787').trim().replace(/\/+$/, '');

/**
 * Release builds must talk to the API over HTTPS (photos, device id and the user's scans travel
 * in the request). Plain http:// is only accepted in development. When this is non-null every
 * request fails with a clear error instead of silently sending data in the clear.
 */
export const API_CONFIG_ERROR: string | null = (() => {
  if (!/^https?:\/\/[^/\s]+/i.test(API_URL)) return `Invalid EXPO_PUBLIC_API_URL: "${API_URL}"`;
  if (!__DEV__ && !/^https:\/\//i.test(API_URL)) return 'EXPO_PUBLIC_API_URL must use https:// in release builds.';
  return null;
})();
if (API_CONFIG_ERROR) console.error(`[api] ${API_CONFIG_ERROR}`);

/** Per-request timeouts. Photo uploads + vision calls are slower than barcode lookups. */
const TIMEOUT_MS = { default: 15_000, upload: 45_000 };

export type ProductSource = 'usda' | 'off' | 'user' | 'ocr';

export type ApiProduct = {
  id: number | null;
  contribution_id?: number;
  gtin14: string;
  name: string;
  brand: string | null;
  variant_or_flavor: string | null;
  size_text: string | null;
  ingredients_text: string | null;
  allergens_text: string | null;
  nutrition: Record<string, unknown> | null;
  category: string | null;
  image_url: string | null;
  source: ProductSource;
  source_updated_at: string | null;
  verified: boolean;
  under_review: boolean;
  label?: string;
};

export type FrontExtracted = {
  brand: string | null;
  product_name: string | null;
  variant_or_flavor: string | null;
  size_text: string | null;
};

export type BarcodeResult =
  | { status: 'found'; gtin14: string; product: ApiProduct; from_cache: boolean; via: string }
  | { status: 'needs_label_photo'; gtin14: string; from_cache: boolean }
  | { status: 'invalid_barcode'; reason: string };

export type FrontResult =
  | {
      status: 'match';
      decision: 'confirm_top' | 'choose_top3';
      vision_cache_id: number | null;
      front_hash: string;
      extracted: FrontExtracted;
      candidates: { product: ApiProduct; score: number }[];
      preselected_product_id: number | null;
      via: string;
    }
  | { status: 'needs_barcode_or_label'; front_hash: string; message: string; extracted: FrontExtracted | null }
  | { status: 'not_food_package' | 'vision_unavailable'; front_hash: string; message: string };

export type LabelResult =
  | { status: 'existing_product'; product: ApiProduct }
  | { status: 'contributed'; product: ApiProduct }
  | { status: 'unreadable'; message: string };

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Anonymous per-install id used for rate limits and the daily free quota. */
function deviceId(): string {
  const st = useStore.getState();
  if (st.deviceId) return st.deviceId;
  const id = `ios-${Crypto.randomUUID()}`;
  st.set({ deviceId: id });
  return id;
}

type PostOptions = { timeoutMs?: number; retries?: number; validate: (json: unknown) => boolean };

const RETRYABLE_STATUS = new Set([502, 503, 504]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function postOnce<T>(path: string, body: string, opts: PostOptions): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? TIMEOUT_MS.default);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Tapi-User': deviceId() },
      body,
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    if (controller.signal.aborted) throw new ApiError(0, 'timeout', 'Tapi is taking too long to respond. Please try again.');
    if (__DEV__) console.warn(`[api] ${path} network error`, e);
    throw new ApiError(0, 'network', 'Can’t reach Tapi right now. Check your connection and try again.');
  }
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  } finally {
    clearTimeout(timer);
  }
  const obj = (json && typeof json === 'object' ? json : {}) as { error?: unknown; message?: unknown };
  if (!res.ok) {
    const code = typeof obj.error === 'string' ? obj.error.slice(0, 64) : 'error';
    // Server messages are shown to the user, so only accept short plain strings.
    const message =
      typeof obj.message === 'string' && obj.message.length <= 300
        ? obj.message
        : res.status === 429
          ? 'You’ve hit the scan limit for now. Please try again later.'
          : res.status >= 500
            ? 'Tapi is having trouble right now. Please try again in a moment.'
            : 'Something went wrong.';
    throw new ApiError(res.status, code, message);
  }
  if (!opts.validate(json)) {
    if (__DEV__) console.warn(`[api] ${path} unexpected response`, json);
    throw new ApiError(res.status, 'bad_response', 'We got an unexpected answer from Tapi. Please try again.');
  }
  return json as T;
}

async function post<T>(path: string, payload: unknown, opts: PostOptions): Promise<T> {
  if (API_CONFIG_ERROR) throw new ApiError(0, 'config', 'Tapi isn’t configured correctly. Please update the app.');
  const body = JSON.stringify(payload);
  const retries = opts.retries ?? 0;
  for (let attempt = 0; ; attempt++) {
    try {
      return await postOnce<T>(path, body, opts);
    } catch (e) {
      const retryable = e instanceof ApiError && (e.code === 'network' || RETRYABLE_STATUS.has(e.status));
      if (!retryable || attempt >= retries) throw e;
      await sleep(600 * (attempt + 1));
    }
  }
}

// ---------- Response validation (never trust the shape of what comes back) ----------

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const strOrNull = (v: unknown) => v === null || v === undefined || typeof v === 'string';
const numOrNull = (v: unknown) => v === null || v === undefined || (typeof v === 'number' && Number.isFinite(v));

/** A product must have text (or null) where the verdict reads text; anything else is rejected. */
export function isApiProduct(v: unknown): v is ApiProduct {
  return (
    isObj(v) &&
    numOrNull(v.id) &&
    typeof v.gtin14 === 'string' &&
    typeof v.name === 'string' &&
    strOrNull(v.brand) &&
    strOrNull(v.variant_or_flavor) &&
    strOrNull(v.size_text) &&
    strOrNull(v.ingredients_text) &&
    strOrNull(v.allergens_text) &&
    strOrNull(v.category) &&
    strOrNull(v.image_url) &&
    typeof v.source === 'string' &&
    strOrNull(v.source_updated_at)
  );
}

const isExtracted = (v: unknown) => v === null || (isObj(v) && strOrNull(v.brand) && strOrNull(v.product_name));

function isBarcodeResult(v: unknown): boolean {
  if (!isObj(v)) return false;
  if (v.status === 'found') return isApiProduct(v.product);
  if (v.status === 'needs_label_photo') return typeof v.gtin14 === 'string';
  if (v.status === 'invalid_barcode') return true;
  return false;
}

function isFrontResult(v: unknown): boolean {
  if (!isObj(v)) return false;
  if (v.status === 'match') {
    return (
      Array.isArray(v.candidates) &&
      v.candidates.every((c) => isObj(c) && isApiProduct(c.product)) &&
      numOrNull(v.vision_cache_id) &&
      isExtracted(v.extracted)
    );
  }
  return v.status === 'needs_barcode_or_label' || v.status === 'not_food_package' || v.status === 'vision_unavailable';
}

function isLabelResult(v: unknown): boolean {
  if (!isObj(v)) return false;
  if (v.status === 'existing_product' || v.status === 'contributed') return isApiProduct(v.product);
  return v.status === 'unreadable';
}

/**
 * Downscale to at most 1024px on the long edge and JPEG-compress before upload
 * (a 12MP photo becomes roughly 150–300KB). The original never leaves the phone.
 */
export async function prepareUpload(uri: string, width: number, height: number): Promise<string> {
  const ctx = ImageManipulator.manipulate(uri);
  if (Math.max(width, height) > 1024) {
    ctx.resize(width >= height ? { width: 1024 } : { height: 1024 });
  }
  const image = await ctx.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
  if (!saved.base64) throw new ApiError(0, 'image', 'Could not process the photo.');
  return saved.base64;
}

export const api = {
  scanBarcode: (barcode: string) =>
    post<BarcodeResult>('/api/scan/barcode', { barcode }, { validate: isBarcodeResult, retries: 1 }),
  scanFront: (imageBase64: string) =>
    post<FrontResult>(
      '/api/scan/front',
      { image_base64: imageBase64, contribute: useStore.getState().contributePhotos },
      { validate: isFrontResult, timeoutMs: TIMEOUT_MS.upload },
    ),
  confirmFront: (visionCacheId: number | null, productId: number) =>
    post<{ product: ApiProduct }>(
      '/api/scan/front/confirm',
      { vision_cache_id: visionCacheId, product_id: productId },
      { validate: (v) => isObj(v) && isApiProduct(v.product), retries: 1 },
    ),
  scanLabel: (imageBase64: string, ctx: { gtin?: string | null; frontHash?: string | null }) =>
    post<LabelResult>(
      '/api/scan/label',
      {
        image_base64: imageBase64,
        gtin: ctx.gtin ?? null,
        front_hash: ctx.frontHash ?? null,
        contribute: useStore.getState().contributePhotos,
      },
      { validate: isLabelResult, timeoutMs: TIMEOUT_MS.upload },
    ),
  report: (productId: number, reason: string) => {
    if (!Number.isSafeInteger(productId) || productId <= 0) return Promise.reject(new ApiError(0, 'invalid', 'Can’t report this product.'));
    return post<{ ok: true }>(`/api/products/${productId}/report`, { reason: reason.slice(0, 1000) }, { validate: isObj });
  },
};
