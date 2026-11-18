import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Config } from '../config.ts';
import type { DB } from '../db/index.ts';
import { normalizeGtin } from '../lib/gtin.ts';
import { perceptualHash, prepareImage } from '../lib/image.ts';
import { decide, rankCandidates, type Decision } from '../lib/match.ts';
import {
  confirmVisionChoice,
  findLabelCache,
  findVisionCache,
  getScanCache,
  getUserConfirmation,
  insertVisionCache,
  recordVisionOffer,
  setScanCache,
  recordMissedScan,
  clearMissedScan,
  wasOffered,
} from './cache.ts';
import type { OffLiveClient } from './off-live.ts';
import {
  flagForReview,
  getProductByGtin,
  getProductById,
  searchProducts,
  toPublicProduct,
  upsertSourceRecord,
  type Product,
  type PublicProduct,
} from './products.ts';
import { sameIngredients } from '../lib/ingredients-diff.ts';
import { displayName } from '../lib/names.ts';
import type { VisionService } from './vision/index.ts';
import type { FrontResult, LabelResult } from './vision/schemas.ts';

export const UNVERIFIED_LABEL = 'User-submitted, unverified';

/** Product built from a user's own ingredient-panel photo (pending review). */
export type ContributedProduct = Omit<PublicProduct, 'id' | 'source'> & {
  id: null;
  contribution_id: number;
  source: 'ocr';
  label: typeof UNVERIFIED_LABEL;
};

export type BarcodeResult =
  | {
      status: 'found';
      gtin14: string;
      product: PublicProduct | ContributedProduct;
      from_cache: boolean;
      via: 'cache' | 'db' | 'contribution' | 'off_live' | 'off_refresh';
    }
  | { status: 'needs_label_photo'; gtin14: string; from_cache: boolean }
  | { status: 'invalid_barcode'; reason: string };

export type FrontScanResult =
  | {
      status: 'match';
      decision: Decision;
      vision_cache_id: number | null;
      front_hash: string;
      extracted: FrontResult;
      candidates: { product: PublicProduct; score: number; components: Record<string, number> }[];
      preselected_product_id: number | null;
      via: 'barcode_in_photo' | 'search' | 'cache';
      requires_confirmation: true;
    }
  | { status: 'needs_barcode_or_label'; front_hash: string; vision_cache_id: number | null; extracted: FrontResult | null; message: string }
  | { status: 'not_food_package'; front_hash: string; message: string }
  | { status: 'vision_unavailable'; front_hash: string; message: string };

export type LabelScanResult =
  | { status: 'existing_product'; product: PublicProduct }
  | { status: 'contributed'; product: ContributedProduct; extracted: LabelResult }
  | { status: 'unreadable'; message: string; extracted: LabelResult | null };

type Deps = { db: DB; config: Config; vision: VisionService; offLive: OffLiveClient | null };

export type ConfirmResult = { ok: true; product: PublicProduct; shared_choice: boolean } | { ok: false; reason: 'not_found' | 'not_offered' };

const HEX16 = /^[0-9a-f]{16}$/;

/**
 * "Contains" + "May contain" as one string, separated by '. ' so the client can split them
 * (a may-contain clause must never read as part of the contains list). Trailing periods are
 * trimmed first so the result never has "..".
 */
export function joinAllergenStatements(contains: string | null | undefined, mayContain: string | null | undefined): string | null {
  const parts = [contains, mayContain].map((p) => (p ?? '').trim().replace(/\.+$/, '').trim()).filter(Boolean);
  return parts.length ? parts.join('. ') : null;
}
const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');

export class ScanService {
  private readonly d: Deps;
  /** Identical concurrent photo requests share one vision call (double taps, client retries). */
  private readonly inflight = new Map<string, Promise<unknown>>();
  constructor(deps: Deps) {
    this.d = deps;
  }

  private singleFlight<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(key) as Promise<T> | undefined;
    if (existing) return existing;
    const p = fn().finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }

  // ---------------- barcode ----------------
  /**
   * this user's own newer label photo -> cache -> local DB (refreshed from OFF when old) -> this user's
   * pending contribution -> live Open Food Facts -> not found.
   * "Not found" is a normal state (needs_label_photo), not an error. Negative results are cached briefly.
   */
  async resolveBarcode(barcode: string, userId: string): Promise<BarcodeResult> {
    const { db, config } = this.d;
    const norm = normalizeGtin(barcode);
    if (!norm.ok) return { status: 'invalid_barcode', reason: norm.reason };
    const gtin14 = norm.gtin14;

    // A user who photographed a newer label sees their own reading until it's reviewed
    // (it's only theirs: never cached, never shown to anyone else).
    const own = this.findOwnContribution(userId, { gtin14 });
    const current = getProductByGtin(db, gtin14);
    if (own && (!current || (own.source_updated_at ?? '') > (current.source_updated_at ?? ''))) {
      return { status: 'found', gtin14, product: own, from_cache: false, via: 'contribution' };
    }

    const cached = getScanCache<PublicProduct>(db, gtin14);
    if (cached?.found) return { status: 'found', gtin14, product: cached.result, from_cache: true, via: 'cache' };

    if (!cached && current) {
      const product = (await this.refreshIfStale(current)) ?? current;
      const pub = toPublicProduct(product);
      setScanCache(db, gtin14, true, pub, config.scanCacheTtlSeconds);
      return { status: 'found', gtin14, product: pub, from_cache: false, via: product === current ? 'db' : 'off_refresh' };
    }

    if (own) return { status: 'found', gtin14, product: own, from_cache: false, via: 'contribution' };

    if (cached && !cached.found) {
      recordMissedScan(db, gtin14);
      return { status: 'needs_label_photo', gtin14, from_cache: true };
    }

    if (config.offLiveLookup && this.d.offLive) {
      const rec = await this.d.offLive.lookup(gtin14);
      if (rec && rec !== 'skipped') {
        upsertSourceRecord(db, rec);
        const product = getProductByGtin(db, gtin14);
        if (product) {
          clearMissedScan(db, gtin14);
          const pub = toPublicProduct(product);
          setScanCache(db, gtin14, true, pub, config.scanCacheTtlSeconds);
          return { status: 'found', gtin14, product: pub, from_cache: false, via: 'off_live' };
        }
      }
      if (rec === 'skipped') {
        recordMissedScan(db, gtin14);
        return { status: 'needs_label_photo', gtin14, from_cache: false }; // don't cache a transient miss
      }
    }

    setScanCache(db, gtin14, false, null, config.scanCacheNegativeTtlSeconds);
    recordMissedScan(db, gtin14);
    return { status: 'needs_label_photo', gtin14, from_cache: false };
  }

  /** When each GTIN was last refreshed from OFF, so an old product OFF can't improve isn't fetched on every scan. */
  private readonly refreshedAt = new Map<string, number>();

  /**
   * Products imported long ago may have an old recipe. If live lookups are on and the data is older
   * than OFF_REFRESH_AFTER_DAYS, fetch the current OFF record (at most once a week per product) and
   * return the rebuilt product, or null when nothing changed. Reviewed user data is never replaced.
   */
  private async refreshIfStale(product: Product): Promise<Product | null> {
    const { db, config, offLive } = this.d;
    if (!config.offLiveLookup || !offLive || config.offRefreshAfterDays <= 0) return null;
    if (product.verified && (product.source === 'user' || product.source === 'ocr')) return null;
    const updated = product.source_updated_at ? Date.parse(product.source_updated_at) : 0;
    const now = Date.now();
    if (Number.isFinite(updated) && now - updated < config.offRefreshAfterDays * 86_400_000) return null;
    const last = this.refreshedAt.get(product.gtin14) ?? 0;
    if (now - last < 7 * 86_400_000) return null;
    const rec = await offLive.lookup(product.gtin14);
    if (rec === 'skipped') return null; // rate-limited or OFF is down: try again on a later scan
    this.refreshedAt.set(product.gtin14, now);
    if (this.refreshedAt.size > 50_000) this.refreshedAt.delete(this.refreshedAt.keys().next().value!);
    if (!rec || !upsertSourceRecord(db, rec)) return null;
    return getProductByGtin(db, product.gtin14);
  }

  // ---------------- front of package ----------------
  async scanFront(imageBytes: Buffer, userId: string, opts: { contribute?: boolean } = {}): Promise<FrontScanResult> {
    const result = await this.scanFrontInner(imageBytes, userId, opts);
    // Remember what this user was offered: /confirm only accepts one of these products.
    if (result.status === 'match' && result.vision_cache_id !== null) {
      recordVisionOffer(
        this.d.db,
        result.vision_cache_id,
        userId,
        result.candidates.map((c) => c.product.id),
      );
    }
    return result;
  }

  private async scanFrontInner(imageBytes: Buffer, userId: string, opts: { contribute?: boolean }): Promise<FrontScanResult> {
    const { db, config, vision } = this.d;
    const { jpeg } = await prepareImage(imageBytes, config.imageMaxInputPixels);
    const frontHash = await perceptualHash(jpeg);

    const lookup = await this.singleFlight(`front:${frontHash}`, async () => {
      const row = findVisionCache(db, 'front', frontHash, config.visionCacheMaxHammingDistance);
      if (row) return { kind: 'cached' as const, row };
      const out = await vision.run('front', jpeg, userId);
      if (!out.ok) return { kind: 'failed' as const };
      const id = insertVisionCache(db, 'front', frontHash, out.model, out.result, { userId, contentSha256: sha256(imageBytes) });
      return { kind: 'fresh' as const, id, result: out.result };
    });
    if (lookup.kind === 'failed') {
      return {
        status: 'vision_unavailable',
        front_hash: frontHash,
        message: 'We could not read that photo. Try scanning the barcode instead.',
      };
    }
    const cached = lookup.kind === 'cached' ? lookup.row : null;
    const extracted: FrontResult = cached ? (JSON.parse(cached.parsed_json) as FrontResult) : (lookup as { result: FrontResult }).result;
    const cacheId: number = cached ? cached.id : (lookup as { id: number }).id;
    const fromCache = !!cached;

    if (!extracted.is_food_package) {
      return {
        status: 'not_food_package',
        front_hash: frontHash,
        message: 'That doesn’t look like a food package. Try the front of the product or its barcode.',
      };
    }

    // Product images only, and only with consent. Otherwise the photo is discarded after this request.
    if (opts.contribute && !fromCache) this.saveProductImage(frontHash, jpeg);

    // A legible barcode in the photo beats text matching.
    if (extracted.barcode_if_visible) {
      const r = await this.resolveBarcode(extracted.barcode_if_visible, userId);
      if (r.status === 'found' && r.product.id !== null) {
        return {
          status: 'match',
          decision: 'confirm_top',
          vision_cache_id: cacheId,
          front_hash: frontHash,
          extracted,
          candidates: [{ product: r.product as PublicProduct, score: 1, components: { barcode: 1 } }],
          preselected_product_id: r.product.id,
          via: 'barcode_in_photo',
          requires_confirmation: true,
        };
      }
    }

    // Repeat photo: offer this user's own earlier confirmation first, else the choice enough
    // independent users agreed on (still needs confirmation).
    const preferredId = (cached && getUserConfirmation(db, cached.id, userId)) ?? cached?.chosen_product_id ?? null;
    if (preferredId) {
      const chosen = getProductById(db, preferredId);
      if (chosen) {
        return {
          status: 'match',
          decision: 'confirm_top',
          vision_cache_id: cacheId,
          front_hash: frontHash,
          extracted,
          candidates: [{ product: toPublicProduct(chosen), score: 1, components: { previous_confirmation: 1 } }],
          preselected_product_id: chosen.id,
          via: 'cache',
          requires_confirmation: true,
        };
      }
    }

    return this.matchExtracted(extracted, frontHash, cacheId, fromCache ? 'cache' : 'search');
  }

  matchExtracted(extracted: FrontResult, frontHash: string, cacheId: number | null, via: 'search' | 'cache'): FrontScanResult {
    const { db, config } = this.d;
    const pool = searchProducts(
      db,
      { brand: extracted.brand, name: extracted.product_name, variant: extracted.variant_or_flavor },
      config.matchCandidateLimit,
    );
    const ranked = rankCandidates(
      {
        brand: extracted.brand,
        product_name: extracted.product_name,
        variant_or_flavor: extracted.variant_or_flavor,
        size_text: extracted.size_text,
      },
      pool,
    );
    const decision = decide(
      ranked.map((r) => r.score),
      { autoConfirm: config.matchAutoConfirm, chooseFrom: config.matchChooseFrom, ambiguityMargin: config.matchAmbiguityMargin },
    );
    if (decision === 'needs_barcode_or_label') {
      return {
        status: 'needs_barcode_or_label',
        front_hash: frontHash,
        vision_cache_id: cacheId,
        extracted,
        message: 'We couldn’t confidently identify this product. Scan its barcode or take a photo of the ingredient list.',
      };
    }
    const top = ranked.slice(0, decision === 'confirm_top' ? 1 : 3);
    return {
      status: 'match',
      decision,
      vision_cache_id: cacheId,
      front_hash: frontHash,
      extracted,
      candidates: top.map((r) => ({ product: toPublicProduct(r.candidate), score: r.score, components: r.components })),
      preselected_product_id: decision === 'confirm_top' ? top[0].candidate.id : null,
      via,
      requires_confirmation: true,
    };
  }

  /**
   * User confirmed which product the photo shows. Only a product this user was actually offered
   * for that photo is accepted. The confirmation applies to this user's repeat photos right away;
   * it becomes the shared choice for everyone only by consensus (see confirmVisionChoice).
   */
  confirmFront(visionCacheId: number, productId: number, userId: string, ipKey: string): ConfirmResult {
    const { db, config } = this.d;
    const product = getProductById(db, productId);
    if (!product) return { ok: false, reason: 'not_found' };
    if (!wasOffered(db, visionCacheId, userId, productId)) return { ok: false, reason: 'not_offered' };
    const shared = confirmVisionChoice(db, visionCacheId, userId, ipKey, productId, config.visionConfirmConsensus);
    return { ok: true, product: toPublicProduct(product), shared_choice: shared === productId };
  }

  // ---------------- ingredient panel ----------------
  async scanLabel(
    imageBytes: Buffer,
    userId: string,
    opts: { gtin?: string | null; frontHash?: string | null; contribute?: boolean; recheck?: boolean } = {},
  ): Promise<LabelScanResult> {
    const { db, config, vision } = this.d;
    const norm = opts.gtin ? normalizeGtin(opts.gtin) : null;
    const gtin14 = norm?.ok ? norm.gtin14 : null;

    // Don't call vision when the barcode already resolves to a product with ingredients, unless the
    // user says the package looks different (recheck): then their photo is compared with our data.
    const existing = gtin14 ? getProductByGtin(db, gtin14) : null;
    if (existing?.ingredients_text && !opts.recheck) return { status: 'existing_product', product: toPublicProduct(existing) };

    const { jpeg } = await prepareImage(imageBytes, config.imageMaxInputPixels);
    const hash = await perceptualHash(jpeg);
    const contentSha = sha256(imageBytes);
    // Label results are never shared across users (see findLabelCache).
    const lookup = await this.singleFlight(`label:${userId}:${contentSha}`, async () => {
      const row = findLabelCache(db, userId, contentSha);
      if (row) return { ok: true as const, extracted: JSON.parse(row.parsed_json) as LabelResult, model: row.model };
      const out = await vision.run('label', jpeg, userId);
      if (!out.ok) return { ok: false as const };
      insertVisionCache(db, 'label', hash, out.model, out.result, { userId, contentSha256: contentSha });
      return { ok: true as const, extracted: out.result, model: out.model };
    });
    if (!lookup.ok)
      return {
        status: 'unreadable',
        message: 'We couldn’t read that label. Try again with the whole ingredient list in frame and good light.',
        extracted: null,
      };
    const { extracted, model } = lookup;

    if (!extracted.is_ingredient_panel || !extracted.ingredients_text) {
      return {
        status: 'unreadable',
        message: 'We couldn’t find a readable ingredient list. Make sure the whole list is in frame and in focus.',
        extracted,
      };
    }

    // Recheck: the photo matches what we have, so our data is current. Nothing to review.
    if (existing?.ingredients_text && sameIngredients(existing.ingredients_text, extracted.ingredients_text)) {
      return { status: 'existing_product', product: toPublicProduct(existing) };
    }

    const frontHash = opts.frontHash && HEX16.test(opts.frontHash) ? opts.frontHash : null;
    if (!gtin14 && !frontHash) {
      // Still usable for this user right now, but there is nothing to attach it to for review.
      return { status: 'contributed', product: this.toContributed(null, extracted, null, -1), extracted };
    }

    let imagePath: string | null = null;
    if (opts.contribute) imagePath = this.saveLabelImage(hash, jpeg);

    const allergens = joinAllergenStatements(extracted.contains_statement, extracted.may_contain_statement);
    const res = db
      .prepare(
        `INSERT INTO contributions (gtin14, front_photo_hash, user_id, ingredients_text, allergens_text, may_contain_text,
           nutrition_json, raw_json, model, confidence, image_path)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        gtin14,
        frontHash,
        userId,
        extracted.ingredients_text,
        allergens,
        extracted.may_contain_statement,
        extracted.nutrition ? JSON.stringify(extracted.nutrition) : null,
        JSON.stringify(extracted),
        model,
        extracted.confidence,
        imagePath,
      );
    const id = Number(res.lastInsertRowid);
    // The package differs from our data: everyone sees "being reviewed" until it's approved or rejected.
    if (existing?.ingredients_text) flagForReview(db, existing.id);
    return { status: 'contributed', product: this.toContributed(gtin14, extracted, frontHash, id), extracted };
  }

  private findOwnContribution(userId: string, key: { gtin14?: string; frontHash?: string }): ContributedProduct | null {
    const row = this.d.db
      .prepare(
        `SELECT * FROM contributions WHERE user_id = ? AND status = 'pending' AND (gtin14 = ? OR front_photo_hash = ?)
         ORDER BY id DESC LIMIT 1`,
      )
      .get(userId, key.gtin14 ?? null, key.frontHash ?? null) as Record<string, string | number | null> | undefined;
    if (!row) return null;
    return this.toContributed(
      row.gtin14 as string | null,
      JSON.parse(row.raw_json as string) as LabelResult,
      row.front_photo_hash as string | null,
      row.id as number,
      row.created_at as string,
    );
  }

  private toContributed(
    gtin14: string | null,
    x: LabelResult,
    _frontHash: string | null,
    contributionId: number,
    photographedAt = new Date().toISOString(),
  ): ContributedProduct {
    const existing = gtin14 ? getProductByGtin(this.d.db, gtin14) : null;
    return {
      id: null,
      contribution_id: contributionId,
      gtin14: gtin14 ?? '',
      name: existing ? displayName(existing.name, existing.brand, existing.category) : 'Your scanned product',
      brand: existing?.brand ?? null,
      variant_or_flavor: existing?.variant_or_flavor ?? null,
      size_text: existing?.size_text ?? null,
      ingredients_text: x.ingredients_text,
      allergens_text: joinAllergenStatements(x.contains_statement, x.may_contain_statement),
      nutrition: x.nutrition,
      category: existing?.category ?? null,
      image_url: existing?.image_url ?? null,
      source: 'ocr',
      // When the label was photographed, so a later import or refresh can win over it.
      source_updated_at: photographedAt,
      verified: false,
      under_review: true,
      label: UNVERIFIED_LABEL,
    };
  }

  private saveProductImage(hash: string, jpeg: Buffer) {
    if (!HEX16.test(hash)) throw new Error('refusing to write upload with a non-hash file name');
    const dir = path.join(this.d.config.uploadsDir, 'products');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, `${hash}.jpg`), jpeg);
  }

  private saveLabelImage(hash: string, jpeg: Buffer): string {
    if (!HEX16.test(hash)) throw new Error('refusing to write upload with a non-hash file name');
    const dir = path.join(this.d.config.uploadsDir, 'labels');
    mkdirSync(dir, { recursive: true });
    const p = path.join(dir, `${hash}.jpg`);
    writeFileSync(p, jpeg);
    return path.relative(this.d.config.uploadsDir, p);
  }
}
