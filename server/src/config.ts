import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Load TAPPY_ENV_FILE (used on the server, e.g. /etc/tappy/tappy.env), then server/.env, then repo-root .env.
// Real env vars always win; earlier files win over later ones.
for (const file of [process.env.TAPPY_ENV_FILE, path.join(SERVER_ROOT, '.env'), path.join(SERVER_ROOT, '..', '.env')]) {
  if (!file) continue;
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
const list = (name: string) =>
  (process.env[name] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
/** TRUST_PROXY: unset/false/0 = ignore X-Forwarded-For; true = 1 proxy hop; N = N proxy hops. */
const proxyHops = (name: string) => {
  const v = (process.env[name] ?? '').trim().toLowerCase();
  if (!v || ['0', 'false', 'no', 'off'].includes(v)) return 0;
  if (['1', 'true', 'yes', 'on'].includes(v)) return 1;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 10) throw new Error(`Env var ${name} must be true/false or a hop count 0-10, got "${v}"`);
  return n;
};

const visionProvider = () => str('VISION_PROVIDER', 'openai').toLowerCase();

/** API key for the configured vision provider ('' when unset). */
export const visionApiKey = (c: Config) =>
  c.visionProvider === 'openai' ? c.openaiApiKey : c.visionProvider === 'anthropic' ? c.anthropicApiKey : '';

export type Config = ReturnType<typeof loadConfig>;

export function loadConfig() {
  return {
    port: num('PORT', 8787),
    // 127.0.0.1 when running behind Cloudflare Tunnel (nothing else can reach the port).
    host: str('HOST', '0.0.0.0'),
    dbPath: path.resolve(SERVER_ROOT, str('DATABASE_PATH', 'data/tappy.db')),
    rawDataDir: path.resolve(SERVER_ROOT, str('RAW_DATA_DIR', 'data/raw')),
    uploadsDir: path.resolve(SERVER_ROOT, str('UPLOADS_DIR', 'data/uploads')),
    /** Cached product photos; next to the database unless set. */
    imageCacheDir: process.env.IMAGE_CACHE_DIR
      ? path.resolve(SERVER_ROOT, process.env.IMAGE_CACHE_DIR)
      : path.join(path.dirname(path.resolve(SERVER_ROOT, str('DATABASE_PATH', 'data/tappy.db'))), 'images'),
    /** The API's public HTTPS address. When set, product photos are served (and cached) from here. */
    publicUrl: str('PUBLIC_URL', ''),

    // Data sources
    usdaApiKey: process.env.USDA_API_KEY || '', // optional; bulk CSV import does not need it
    usdaBrandedCsvUrl: str(
      'USDA_BRANDED_CSV_URL',
      'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_branded_food_csv_2026-10-29.zip',
    ),
    offCsvUrl: str('OFF_CSV_URL', 'https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz'),
    // Fetch missing barcodes from OFF live, and refresh products whose data is older than OFF_REFRESH_AFTER_DAYS.
    offLiveLookup: bool('OFF_LIVE_LOOKUP', true),
    offRefreshAfterDays: num('OFF_REFRESH_AFTER_DAYS', 180),
    offUserAgent: str('OFF_USER_AGENT', 'Tappy/1.0 (contact@example.com)'),
    offLiveMaxPerMinute: num('OFF_LIVE_MAX_PER_MINUTE', 12), // OFF allows 15 product reads/min/IP

    // HTTP hardening
    /** Browser origins allowed by CORS (the iOS app needs none). Empty = no CORS headers. "*" = any origin. */
    corsOrigins: list('CORS_ORIGINS'),
    /** Number of trusted reverse-proxy hops in front of the server (0 = never trust X-Forwarded-For). */
    trustProxyHops: proxyHops('TRUST_PROXY'),
    requestTimeoutMs: num('REQUEST_TIMEOUT_MS', 60_000),
    headersTimeoutMs: num('HEADERS_TIMEOUT_MS', 15_000),
    shutdownTimeoutMs: num('SHUTDOWN_TIMEOUT_MS', 10_000),

    // Vision
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    /** PHOTO_SCANNING: auto (on iff a provider key is set), on (fail at startup without a key), off. */
    photoScanningMode: str('PHOTO_SCANNING', 'auto').toLowerCase(),
    /** openai | anthropic. Model defaults follow the provider. */
    visionProvider: visionProvider(),
    visionModel: str('VISION_MODEL', visionProvider() === 'openai' ? 'gpt-6-luna' : 'claude-haiku-5-5'),
    visionEscalationModel: str('VISION_ESCALATION_MODEL', visionProvider() === 'openai' ? 'gpt-6.1-sol' : 'claude-sonnet-5-5'),
    visionEscalateBelow: num('VISION_ESCALATE_BELOW_CONFIDENCE', 0.6),
    visionMaxImageBytes: num('VISION_MAX_IMAGE_BYTES', 4_000_000),
    /** Decoded-pixel ceiling for uploads (decompression-bomb guard). */
    imageMaxInputPixels: num('IMAGE_MAX_INPUT_PIXELS', 40_000_000),
    visionTimeoutMs: num('VISION_TIMEOUT_MS', 30_000),
    /** Hard daily ceiling on estimated vision spend across all users (USD, UTC day). 0 = no ceiling. */
    visionDailyBudgetUsd: num('VISION_DAILY_BUDGET_USD', 20),
    /** Distinct users (on distinct networks) who must confirm the same product before a front photo maps to it for everyone. */
    visionConfirmConsensus: num('VISION_CONFIRM_CONSENSUS', 3),

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
    /** Per-client-IP (IPv6: per /64) daily caps, so minting new device ids can't bypass the per-user quota. 0 = off. */
    ipDailyScans: num('IP_DAILY_SCANS', 300),
    ipDailyPhotoScans: num('IP_DAILY_PHOTO_SCANS', 40),

    // Subscriptions (RevenueCat)
    /** RevenueCat secret API key (v1, sk_…). Without it nobody gets subscriber limits. */
    revenueCatSecretKey: process.env.REVENUECAT_SECRET_KEY || '',
    revenueCatEntitlementId: str('REVENUECAT_ENTITLEMENT_ID', 'tappy_pro'),
    /** Subscribers: barcode scans are unlimited; photo scans (paid vision calls) keep a fair-use daily cap. */
    subscriberDailyPhotoScans: num('SUBSCRIBER_DAILY_PHOTO_SCANS', 100),

    // Accounts
    /** Sign in with Apple tokens must be issued for this audience (the iOS bundle id in app.json). */
    appleBundleId: str('APPLE_BUNDLE_ID', 'company.tappy.app'),
    /** Sign in with Apple key (Apple Developer > Keys), used to revoke Apple tokens when an account is deleted. Optional. */
    appleTeamId: str('APPLE_TEAM_ID', ''),
    appleSignInKeyId: str('APPLE_SIGN_IN_KEY_ID', ''),
    /** The .p8 file's contents (PEM). Newlines may be written as \n. */
    appleSignInPrivateKey: str('APPLE_SIGN_IN_PRIVATE_KEY', ''),
    /** Sign in with Google ID tokens must be issued for one of these OAuth client ids (comma separated). Empty: Google sign-in is off. */
    googleClientIds: (process.env.GOOGLE_CLIENT_IDS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    /** Password-reset emails go through Resend. Without a key, "Forgot password?" is hidden in the app. */
    resendApiKey: process.env.RESEND_API_KEY || '',
    emailFrom: str('EMAIL_FROM', 'Tappy <no-reply@tappy.company>'),
    /** Login / signup / reset attempts per minute, per IP and per email. */
    authRateLimitPerMinute: num('AUTH_RATE_LIMIT_PER_MINUTE', 10),
    /** Shown on the hosted Terms / Privacy pages. */
    supportEmail: str('SUPPORT_EMAIL', 'kartiknagani17@gmail.com'),
  };
}

/** True when photo scans (which call the vision model) are enabled. */
export function photoScanningEnabled(c: Config): boolean {
  if (c.photoScanningMode === 'off') return false;
  if (c.photoScanningMode === 'on') return true;
  return !!visionApiKey(c);
}

/** Fail fast on invalid settings; returns warnings worth logging at startup. Never includes secret values. */
export function validateConfig(c: Config): string[] {
  const errors: string[] = [];
  const warnings: string[] = [];
  const intIn = (key: keyof Config, min: number, max: number) => {
    const v = c[key] as number;
    if (!Number.isInteger(v) || v < min || v > max) errors.push(`${String(key)} must be an integer in [${min}, ${max}] (got ${v})`);
  };
  intIn('port', 0, 65535);
  intIn('rateLimitPerMinute', 1, 100_000);
  intIn('dailyFreeScans', 0, 1_000_000);
  intIn('dailyFreePhotoScans', 0, 1_000_000);
  intIn('ipDailyScans', 0, 10_000_000);
  intIn('ipDailyPhotoScans', 0, 10_000_000);
  intIn('subscriberDailyPhotoScans', 0, 1_000_000);
  intIn('visionMaxImageBytes', 10_000, 50_000_000);
  intIn('imageMaxInputPixels', 1_000_000, 268_402_689);
  intIn('requestTimeoutMs', 1000, 600_000);
  intIn('headersTimeoutMs', 1000, 600_000);
  intIn('visionConfirmConsensus', 1, 1000);
  intIn('matchCandidateLimit', 1, 200);
  intIn('authRateLimitPerMinute', 1, 10_000);
  if (!(c.visionDailyBudgetUsd >= 0)) errors.push('visionDailyBudgetUsd must be >= 0');
  if (!['auto', 'on', 'off'].includes(c.photoScanningMode))
    errors.push(`PHOTO_SCANNING must be auto, on or off (got "${c.photoScanningMode}")`);
  if (!['openai', 'anthropic'].includes(c.visionProvider))
    errors.push(`VISION_PROVIDER must be openai or anthropic (got "${c.visionProvider}")`);
  else if (c.photoScanningMode === 'on' && !visionApiKey(c)) {
    errors.push(`PHOTO_SCANNING=on but ${c.visionProvider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY'} is not set`);
  }
  if (c.publicUrl && !/^https?:\/\/[^/\s]+\/?$/i.test(c.publicUrl))
    errors.push(`PUBLIC_URL must be an address like https://api.example.com (got "${c.publicUrl}")`);
  if (errors.length) throw new Error(`Invalid configuration:\n  - ${errors.join('\n  - ')}`);

  if (!photoScanningEnabled(c)) {
    warnings.push(
      c.photoScanningMode === 'off'
        ? 'Photo scanning is disabled (PHOTO_SCANNING=off); photo endpoints return 503.'
        : `${c.visionProvider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY'} is not set: photo scanning is disabled (photo endpoints return 503). Barcode scans still work.`,
    );
  }
  if (c.visionDailyBudgetUsd === 0 && photoScanningEnabled(c))
    warnings.push('VISION_DAILY_BUDGET_USD=0: no daily ceiling on vision spend.');
  if (c.corsOrigins.includes('*')) warnings.push('CORS_ORIGINS=* allows any website to call this API from a browser.');
  if (c.offUserAgent.includes('example.com')) warnings.push('OFF_USER_AGENT still uses the example contact address.');
  if (!c.revenueCatSecretKey)
    warnings.push('REVENUECAT_SECRET_KEY is not set: subscribers get the free daily scan limits instead of unlimited scans.');
  if (!c.publicUrl) warnings.push("PUBLIC_URL is not set: product photos load from Open Food Facts' slow image server.");
  if (!c.resendApiKey) warnings.push('RESEND_API_KEY is not set: password reset emails are off ("Forgot password?" is hidden in the app).');
  return warnings;
}
