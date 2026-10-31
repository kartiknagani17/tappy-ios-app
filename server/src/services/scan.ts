import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Config } from '../config.ts';
import type { DB } from '../db/index.ts';
import { normalizeGtin } from '../lib/gtin.ts';
import { perceptualHash, prepareImage } from '../lib/image.ts';
import { decide, rankCandidates, type Decision } from '../lib/match.ts';
import { findVisionCache, getScanCache, insertVisionCache, setScanCache, setVisionCacheChoice } from './cache.ts';
import type { OffLiveClient } from './off-live.ts';
import { getProductByGtin, getProductById, searchProducts, toPublicProduct, upsertSourceRecord, type PublicProduct } from './products.ts';
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
      via: 'cache' | 'db' | 'contribution' | 'off_live';
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

export class ScanService {
  private readonly d: Deps;
  constructor(deps: Deps) {
    this.d = deps;
  }

  // ---------------- barcode ----------------
  /**
   * cache -> local DB -> this user's pending contribution -> live Open Food Facts (feature flag) -> not found.
   * "Not found" is a normal state (needs_label_photo), not an error. Negative results are cached briefly.
   */
  async resolveBarcode(barcode: string, userId: string): Promise<BarcodeResult> {
    const { db, config } = this.d;
    const norm = normalizeGtin(barcode);
    if (!norm.ok) return { status: 'invalid_barcode', reason: norm.reason };
    const gtin14 = norm.gtin14;

    const cached = getScanCache<PublicProduct>(db, gtin14);
    if (cached?.found) return { status: 'found', gtin14, product: cached.result, from_cache: true, via: 'cache' };

    if (!cached) {
      const product = getProductByGtin(db, gtin14);
      if (product) {
        const pub = toPublicProduct(product);
        setScanCache(db, gtin14, true, pub, config.scanCacheTtlSeconds);
        return { status: 'found', gtin14, product: pub, from_cache: false, via: 'db' };
      }
    }

    // A user's own unverified submission is usable for that user only (never cached globally).
    const own = this.findOwnContribution(userId, { gtin14 });
    if (own) return { status: 'found', gtin14, product: own, from_cache: false, via: 'contribution' };

    if (cached && !cached.found) return { status: 'needs_label_photo', gtin14, from_cache: true };

    if (config.offLiveLookup && this.d.offLive) {
      const rec = await this.d.offLive.lookup(gtin14);
      if (rec && rec !== 'skipped') {
        upsertSourceRecord(db, rec);
        const product = getProductByGtin(db, gtin14);
        if (product) {
          const pub = toPublicProduct(product);
          setScanCache(db, gtin14, true, pub, config.scanCacheTtlSeconds);
          return { status: 'found', gtin14, product: pub, from_cache: false, via: 'off_live' };
        }
      }
      if (rec === 'skipped') return { status: 'needs_label_photo', gtin14, from_cache: false }; // don't cache a transient miss
    }

    setScanCache(db, gtin14, false, null, config.scanCacheNegativeTtlSeconds);
    return { status: 'needs_label_photo', gtin14, from_cache: false };
  }

  // ---------------- front of package ----------------
  async scanFront(imageBytes: Buffer, userId: string, opts: { contribute?: boolean } = {}): Promise<FrontScanResult> {
    const { db, config, vision } = this.d;
    const { jpeg } = await prepareImage(imageBytes);
    const frontHash = await perceptualHash(jpeg);

    const cached = findVisionCache(db, 'front', frontHash, config.visionCacheMaxHammingDistance);
    let extracted: FrontResult;
    let cacheId: number | null;
    let fromCache = false;
    if (cached) {
      extracted = JSON.parse(cached.parsed_json) as FrontResult;
      cacheId = cached.id;
      fromCache = true;
    } else {
      const out = await vision.run('front', jpeg, userId);
      if (!out.ok) {
        return {
          status: 'vision_unavailable',
          front_hash: frontHash,
          message: 'We could not read that photo. Try scanning the barcode instead.',
        };
      }
      extracted = out.result;
      cacheId = insertVisionCache(db, 'front', frontHash, out.model, extracted);
    }

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

    // Repeat photo the user already confirmed: offer that product first (still needs confirmation).
    if (cached?.chosen_product_id) {
      const chosen = getProductById(db, cached.chosen_product_id);
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

  /** User confirmed which product the photo shows; remember it for repeat photos. */
  confirmFront(visionCacheId: number, productId: number) {
    const product = getProductById(this.d.db, productId);
    if (!product) return null;
    setVisionCacheChoice(this.d.db, visionCacheId, productId);
    return toPublicProduct(product);
  }

  // ---------------- ingredient panel ----------------
  async scanLabel(
    imageBytes: Buffer,
    userId: string,
    opts: { gtin?: string | null; frontHash?: string | null; contribute?: boolean } = {},
  ): Promise<LabelScanResult> {
    const { db, config, vision } = this.d;
    const norm = opts.gtin ? normalizeGtin(opts.gtin) : null;
    const gtin14 = norm?.ok ? norm.gtin14 : null;

    // Never call vision when the barcode already resolves to a product with ingredients.
    if (gtin14) {
      const existing = getProductByGtin(db, gtin14);
      if (existing?.ingredients_text) return { status: 'existing_product', product: toPublicProduct(existing) };
    }

    const { jpeg } = await prepareImage(imageBytes);
    const hash = await perceptualHash(jpeg);
    const cached = findVisionCache(db, 'label', hash, config.visionCacheMaxHammingDistance);
    let extracted: LabelResult;
    let model: string;
    if (cached) {
      extracted = JSON.parse(cached.parsed_json) as LabelResult;
      model = cached.model;
    } else {
      const out = await vision.run('label', jpeg, userId);
      if (!out.ok)
        return {
          status: 'unreadable',
          message: 'We couldn’t read that label. Try again with the whole ingredient list in frame and good light.',
          extracted: null,
        };
      extracted = out.result;
      model = out.model;
      insertVisionCache(db, 'label', hash, model, extracted);
    }

    if (!extracted.is_ingredient_panel || !extracted.ingredients_text) {
      return {
        status: 'unreadable',
        message: 'We couldn’t find a readable ingredient list. Make sure the whole list is in frame and in focus.',
        extracted,
      };
    }

    const frontHash = opts.frontHash && /^[0-9a-f]{16}$/.test(opts.frontHash) ? opts.frontHash : null;
    if (!gtin14 && !frontHash) {
      // Still usable for this user right now, but there is nothing to attach it to for review.
      return { status: 'contributed', product: this.toContributed(null, extracted, null, -1), extracted };
    }

    let imagePath: string | null = null;
    if (opts.contribute) imagePath = this.saveLabelImage(hash, jpeg);

    const allergens = [extracted.contains_statement, extracted.may_contain_statement].filter(Boolean).join(' ') || null;
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
    );
  }

  private toContributed(gtin14: string | null, x: LabelResult, _frontHash: string | null, contributionId: number): ContributedProduct {
    const existing = gtin14 ? getProductByGtin(this.d.db, gtin14) : null;
    return {
      id: null,
      contribution_id: contributionId,
      gtin14: gtin14 ?? '',
      name: existing?.name ?? 'Your scanned product',
      brand: existing?.brand ?? null,
      variant_or_flavor: existing?.variant_or_flavor ?? null,
      size_text: existing?.size_text ?? null,
      ingredients_text: x.ingredients_text,
      allergens_text: [x.contains_statement, x.may_contain_statement].filter(Boolean).join(' ') || null,
      nutrition: x.nutrition,
      category: existing?.category ?? null,
      image_url: existing?.image_url ?? null,
      source: 'ocr',
      source_updated_at: new Date().toISOString(),
      verified: false,
      under_review: true,
      label: UNVERIFIED_LABEL,
    };
  }

  private saveProductImage(hash: string, jpeg: Buffer) {
    const dir = path.join(this.d.config.uploadsDir, 'products');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, `${hash}.jpg`), jpeg);
  }

  private saveLabelImage(hash: string, jpeg: Buffer): string {
    const dir = path.join(this.d.config.uploadsDir, 'labels');
    mkdirSync(dir, { recursive: true });
    const p = path.join(dir, `${hash}.jpg`);
    writeFileSync(p, jpeg);
    return path.relative(this.d.config.uploadsDir, p);
  }
}
