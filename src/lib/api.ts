import * as Crypto from 'expo-crypto';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useStore } from './store';

/** Backend base URL. On a physical iPhone, point this at your computer's LAN IP. */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8787').replace(/\/$/, '');

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

async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Tapi-User': deviceId() },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'network', 'Can’t reach Tapi right now. Check your connection and try again.');
  }
  const json = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  if (!res.ok) throw new ApiError(res.status, json.error ?? 'error', json.message ?? 'Something went wrong.');
  return json as T;
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
  scanBarcode: (barcode: string) => post<BarcodeResult>('/api/scan/barcode', { barcode }),
  scanFront: (imageBase64: string) =>
    post<FrontResult>('/api/scan/front', { image_base64: imageBase64, contribute: useStore.getState().contributePhotos }),
  confirmFront: (visionCacheId: number | null, productId: number) =>
    post<{ product: ApiProduct }>('/api/scan/front/confirm', { vision_cache_id: visionCacheId, product_id: productId }),
  scanLabel: (imageBase64: string, ctx: { gtin?: string | null; frontHash?: string | null }) =>
    post<LabelResult>('/api/scan/label', {
      image_base64: imageBase64,
      gtin: ctx.gtin ?? null,
      front_hash: ctx.frontHash ?? null,
      contribute: useStore.getState().contributePhotos,
    }),
  report: (productId: number, reason: string) => post<{ ok: true }>(`/api/products/${productId}/report`, { reason }),
};
