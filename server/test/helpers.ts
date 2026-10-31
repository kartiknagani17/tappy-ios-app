import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { loadConfig, type Config } from '../src/config.ts';
import { openDb, type DB } from '../src/db/index.ts';
import { ScanService } from '../src/services/scan.ts';
import type { VisionProvider, VisionRequest, VisionResponse } from '../src/services/vision/provider.ts';
import { VisionService } from '../src/services/vision/index.ts';

export const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    ...loadConfig(),
    dbPath: ':memory:',
    offLiveLookup: false,
    uploadsDir: '/tmp/tapi-test-uploads',
    photoScanningMode: 'on',
    corsOrigins: [],
    trustProxyHops: 0,
    ...overrides,
  };
}

export function testDb(): DB {
  return openDb(':memory:');
}

/** Scripted vision provider: returns queued responses in order and records every call. */
export class MockVisionProvider implements VisionProvider {
  readonly name = 'mock';
  calls: VisionRequest[] = [];
  private queue: ((Partial<VisionResponse> & { text: string }) | Error)[];
  constructor(queue: ((Partial<VisionResponse> & { text: string }) | Error)[] = []) {
    this.queue = queue;
  }
  push(...r: ((Partial<VisionResponse> & { text: string }) | Error)[]) {
    this.queue.push(...r);
  }
  async extract(req: VisionRequest): Promise<VisionResponse> {
    this.calls.push(req);
    const next = this.queue.shift();
    if (!next) throw new Error('MockVisionProvider: no response queued');
    if (next instanceof Error) throw next;
    return { model: req.model, usage: { input_tokens: 1200, output_tokens: 150 }, ...next };
  }
}

export const frontJson = (o: Record<string, unknown> = {}) =>
  JSON.stringify({
    is_food_package: true,
    brand: null,
    product_name: null,
    variant_or_flavor: null,
    size_text: null,
    barcode_if_visible: null,
    claims_seen: [],
    confidence: 0.9,
    ...o,
  });

export const labelJson = (o: Record<string, unknown> = {}) =>
  JSON.stringify({
    is_ingredient_panel: true,
    ingredients_text: 'Peanuts, salt.',
    contains_statement: 'Contains: peanuts.',
    may_contain_statement: null,
    nutrition: null,
    confidence: 0.92,
    ...o,
  });

export function makeScan(db: DB, provider: MockVisionProvider, config = testConfig()) {
  const vision = new VisionService(db, provider, {
    primaryModel: 'claude-haiku-5-5',
    escalationModel: 'claude-sonnet-5-5',
    escalateBelow: config.visionEscalateBelow,
    dailyBudgetUsd: config.visionDailyBudgetUsd,
  });
  return { scan: new ScanService({ db, config, vision, offLive: null }), vision, config };
}

/** A synthetic "package photo" with enough structure for a stable perceptual hash. */
export async function packagePhoto(seed = 1, size = 1400): Promise<Buffer> {
  // Deterministic pseudo-random layout per seed so different seeds look like different packages.
  let x = seed * 2654435761;
  const r = () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648;
  const shapes = Array.from({ length: 6 }, (_, i) => {
    const [cx, cy, w, h] = [r() * size, r() * size, (0.1 + r() * 0.35) * size, (0.1 + r() * 0.35) * size];
    const fill = ['white', 'black', 'yellow', 'navy', 'crimson', 'teal'][(i + seed) % 6];
    return i % 2
      ? `<circle cx="${cx}" cy="${cy}" r="${w / 2}" fill="${fill}"/>`
      : `<rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" fill="${fill}"/>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <rect width="100%" height="100%" fill="rgb(${(seed * 70) % 255},${(seed * 110) % 255},${(seed * 40) % 255})"/>${shapes}
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toBuffer();
}
