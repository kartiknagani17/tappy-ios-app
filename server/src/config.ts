import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Load server/.env (then repo-root .env) if present. Real env vars always win.
for (const file of [path.join(SERVER_ROOT, '.env'), path.join(SERVER_ROOT, '..', '.env')]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

const num = (name: string, fallback: number) => {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`Env var ${name} must be a number, got "${v}"`);
  return n;
};
const bool = (name: string, fallback: boolean) => {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
};
const str = (name: string, fallback: string) => process.env[name] || fallback;

export type Config = ReturnType<typeof loadConfig>;

export function loadConfig() {
  return {
    port: num('PORT', 8787),
    dbPath: path.resolve(SERVER_ROOT, str('DATABASE_PATH', 'data/tapi.db')),
    rawDataDir: path.resolve(SERVER_ROOT, str('RAW_DATA_DIR', 'data/raw')),
    uploadsDir: path.resolve(SERVER_ROOT, str('UPLOADS_DIR', 'data/uploads')),

    // Data sources
    usdaApiKey: process.env.USDA_API_KEY || '', // optional; bulk CSV import does not need it
    usdaBrandedCsvUrl: str(
      'USDA_BRANDED_CSV_URL',
      'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_branded_food_csv_2026-10-29.zip',
    ),
    offCsvUrl: str('OFF_CSV_URL', 'https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz'),
    offLiveLookup: bool('OFF_LIVE_LOOKUP', false),
    offUserAgent: str('OFF_USER_AGENT', 'Tapi/1.0 (contact@example.com)'),
    offLiveMaxPerMinute: num('OFF_LIVE_MAX_PER_MINUTE', 12), // OFF allows 15 product reads/min/IP

    // Vision
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    visionProvider: str('VISION_PROVIDER', 'anthropic'),
    visionModel: str('VISION_MODEL', 'claude-haiku-5-5'),
    visionEscalationModel: str('VISION_ESCALATION_MODEL', 'claude-sonnet-5-5'),
    visionEscalateBelow: num('VISION_ESCALATE_BELOW_CONFIDENCE', 0.6),
    visionMaxImageBytes: num('VISION_MAX_IMAGE_BYTES', 4_000_000),

    // Matching thresholds
    matchAutoConfirm: num('MATCH_AUTO_CONFIRM_THRESHOLD', 0.85),
    matchChooseFrom: num('MATCH_CHOOSE_THRESHOLD', 0.5),
    matchAmbiguityMargin: num('MATCH_AMBIGUITY_MARGIN', 0.03),
    matchCandidateLimit: num('MATCH_CANDIDATE_LIMIT', 25),

    // Caching
    scanCacheTtlSeconds: num('SCAN_CACHE_TTL_SECONDS', 7 * 24 * 3600),
    scanCacheNegativeTtlSeconds: num('SCAN_CACHE_NEGATIVE_TTL_SECONDS', 6 * 3600),
    visionCacheMaxHammingDistance: Math.min(3, num('VISION_CACHE_MAX_HAMMING', 3)), // >3 would break the 4-band lookup guarantee

    // Limits
    dailyFreeScans: num('DAILY_FREE_SCANS', 25),
    dailyFreePhotoScans: num('DAILY_FREE_PHOTO_SCANS', 10),
    rateLimitPerMinute: num('RATE_LIMIT_PER_MINUTE', 30),
  };
}
