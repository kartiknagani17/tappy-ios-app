/**
 * Server-side check of the "tappy_pro" subscription through RevenueCat, so subscribers get the
 * unlimited scans the paywall promises. The app can't simply claim to be subscribed: the server asks
 * RevenueCat (REST API v1, secret key) and caches the answer for a few minutes.
 *
 * Which RevenueCat id is checked:
 *  - signed in: `tappy-user-<account id>` (what the app passes to Purchases.logIn), derived from the
 *    bearer token, never from the client, because account ids are sequential and guessable;
 *  - not signed in: the RevenueCat anonymous id the app sends in X-Tappy-Purchaser
 *    (`$RCAnonymousID:` + 32 hex chars, random and unguessable).
 */

export const ANONYMOUS_PURCHASER_RE = /^\$RCAnonymousID:[0-9a-f]{32}$/;
export const accountPurchaserId = (userId: number) => `tappy-user-${userId}`;

export interface EntitlementChecker {
  /** True when `appUserId` has the entitlement right now. Never throws: errors count as "not subscribed". */
  isSubscribed(appUserId: string): Promise<boolean>;
}

type CacheEntry = { active: boolean; until: number };

export class RevenueCatEntitlements implements EntitlementChecker {
  private cache = new Map<string, CacheEntry>();
  private readonly secretKey: string;
  private readonly entitlementId: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly timeoutMs: number;
  private readonly maxKeys: number;

  constructor(opts: {
    secretKey: string;
    entitlementId: string;
    fetchImpl?: typeof fetch;
    now?: () => number;
    timeoutMs?: number;
    maxKeys?: number;
  }) {
    this.secretKey = opts.secretKey;
    this.entitlementId = opts.entitlementId;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.now = opts.now ?? Date.now;
    this.timeoutMs = opts.timeoutMs ?? 4000;
    this.maxKeys = opts.maxKeys ?? 50_000;
  }

  async isSubscribed(appUserId: string): Promise<boolean> {
    const t = this.now();
    const hit = this.cache.get(appUserId);
    if (hit && hit.until > t) return hit.active;
    try {
      const expiresAt = await this.lookup(appUserId);
      const active = expiresAt !== undefined && (expiresAt === null || expiresAt > t);
      // Subscribed: trust it for 15 min (or until it expires). Not subscribed: re-check after a minute,
      // so a purchase made a moment ago is picked up quickly.
      const until = active ? Math.min(t + 15 * 60_000, expiresAt ?? Infinity) : t + 60_000;
      this.remember(appUserId, { active, until });
      return active;
    } catch {
      // RevenueCat unreachable: keep a recent "subscribed" answer for a while rather than lock out a payer.
      if (hit?.active && t - hit.until < 60 * 60_000) return true;
      return false;
    }
  }

  /** Entitlement expiry in ms (null = never expires), or undefined when the user doesn't have it. */
  private async lookup(appUserId: string): Promise<number | null | undefined> {
    const res = await this.fetchImpl(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`, {
      headers: { Authorization: `Bearer ${this.secretKey}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new Error(`RevenueCat ${res.status}`);
    const body = (await res.json()) as {
      subscriber?: { entitlements?: Record<string, { expires_date?: string | null; grace_period_expires_date?: string | null }> };
    };
    const ent = body.subscriber?.entitlements?.[this.entitlementId];
    if (!ent) return undefined;
    const ends = [ent.expires_date, ent.grace_period_expires_date];
    if (ent.expires_date == null) return null;
    const ms = Math.max(...ends.filter((d): d is string => typeof d === 'string').map((d) => Date.parse(d)));
    return Number.isFinite(ms) ? ms : undefined;
  }

  private remember(key: string, entry: CacheEntry) {
    this.cache.delete(key);
    this.cache.set(key, entry);
    if (this.cache.size > this.maxKeys) this.cache.delete(this.cache.keys().next().value!);
  }
}

/** Used when no RevenueCat secret key is configured: nobody is treated as subscribed. */
export const noEntitlements: EntitlementChecker = { isSubscribed: async () => false };
