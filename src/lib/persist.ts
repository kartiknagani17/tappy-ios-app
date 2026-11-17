import type { StateStorage } from 'zustand/middleware';

/**
 * Helpers for the persisted store (kept free of React Native imports so they can be unit tested).
 *
 * The profile drives allergen verdicts, so a corrupted or half-written blob must never crash the
 * app or hang the splash screen. Anything that doesn't have the expected shape is dropped and the
 * field falls back to its default.
 */

export const STORE_VERSION = 1;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const LEVELS = new Set(['severe', 'intolerance', 'preference']);
const RATINGS = new Set(['green', 'yellow', 'red']);
const PROVIDERS = new Set(['email', 'google', 'apple', 'facebook']);
const GTIN_RE = /^\d{14}$/;

const strArray = (v: unknown): string[] | undefined =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 500) : undefined;

function cleanRestrictions(v: unknown) {
  if (!isObj(v)) return undefined;
  const out: Record<string, { level?: 'severe' | 'intolerance' | 'preference'; items?: string[] }> = {};
  for (const [id, sel] of Object.entries(v)) {
    if (!isObj(sel)) continue;
    const next: { level?: 'severe' | 'intolerance' | 'preference'; items?: string[] } = {};
    if (typeof sel.level === 'string' && LEVELS.has(sel.level)) next.level = sel.level as 'severe' | 'intolerance' | 'preference';
    const items = strArray(sel.items);
    if (items) next.items = items;
    out[id] = next;
  }
  return out;
}

function cleanOverrides(v: unknown) {
  if (!isObj(v)) return undefined;
  const out: Record<string, 'green' | 'yellow' | 'red'> = {};
  for (const [id, r] of Object.entries(v)) if (typeof r === 'string' && RATINGS.has(r)) out[id] = r as 'green' | 'yellow' | 'red';
  return out;
}

/**
 * Keep only well-typed fields from a persisted blob. Unknown keys (e.g. from a newer build) and
 * wrong types are dropped; the caller merges the result over the defaults.
 */
export function sanitizePersisted(raw: unknown): Record<string, unknown> {
  if (!isObj(raw)) return {};
  const out: Record<string, unknown> = {};
  for (const k of ['mindset', 'heardFrom', 'goal', 'deviceId'] as const) if (typeof raw[k] === 'string') out[k] = raw[k];
  for (const k of [
    'restrictionsWanted',
    'seenIngredientIntro',
    'onboarded',
    'trialActive',
    'agreedToTerms',
    'askedPush',
    'accountPromptDismissed',
    'contributePhotos',
  ] as const) {
    if (typeof raw[k] === 'boolean') out[k] = raw[k];
  }
  if (typeof raw.duration === 'number' && Number.isFinite(raw.duration)) out.duration = raw.duration;
  const avoid = strArray(raw.avoidList);
  if (avoid) out.avoidList = avoid;
  const saved = strArray(raw.saved);
  if (saved) out.saved = saved;
  const restrictions = cleanRestrictions(raw.restrictions);
  if (restrictions) out.restrictions = restrictions;
  const overrides = cleanOverrides(raw.ingredientOverrides);
  if (overrides) out.ingredientOverrides = overrides;
  if (isObj(raw.tried)) {
    const tried: Record<string, 'up' | 'down'> = {};
    for (const [gtin, vote] of Object.entries(raw.tried).slice(0, 2000)) {
      if (GTIN_RE.test(gtin) && (vote === 'up' || vote === 'down')) tried[gtin] = vote;
    }
    out.tried = tried;
  }
  if (isObj(raw.watched)) {
    const watched: Record<string, { id: number; name: string; snapshot: string }> = {};
    for (const [gtin, w] of Object.entries(raw.watched).slice(0, 200)) {
      if (
        GTIN_RE.test(gtin) &&
        isObj(w) &&
        typeof w.id === 'number' &&
        Number.isSafeInteger(w.id) &&
        w.id > 0 &&
        typeof w.name === 'string' &&
        typeof w.snapshot === 'string'
      ) {
        watched[gtin] = { id: w.id, name: w.name.slice(0, 200), snapshot: w.snapshot.slice(0, 20_000) };
      }
    }
    out.watched = watched;
  }
  if (typeof raw.lastChangeCheck === 'number' && Number.isFinite(raw.lastChangeCheck)) out.lastChangeCheck = raw.lastChangeCheck;
  if (isObj(raw.account) && typeof raw.account.email === 'string' && typeof raw.account.provider === 'string' && PROVIDERS.has(raw.account.provider)) {
    out.account = { email: raw.account.email, provider: raw.account.provider };
  }
  // A device id that isn't ours (e.g. tampered with) is regenerated on next use.
  if (typeof out.deviceId === 'string' && !/^ios-[0-9a-f-]{36}$/i.test(out.deviceId)) delete out.deviceId;
  // Never mark someone onboarded without a profile decision having been made.
  if (out.onboarded === true && out.agreedToTerms !== true) out.onboarded = false;
  return out;
}

/**
 * Migrations between persisted versions. v0 → v1: no shape change, but v0 had no `version`
 * field checks, so everything is re-sanitized. Add a case per future version bump.
 */
export function migratePersisted(persisted: unknown, fromVersion: number): Record<string, unknown> {
  let state = sanitizePersisted(persisted);
  if (fromVersion < 1) {
    // v1: fake accounts created by the old stubbed auth screen (social logins stored as "google@user")
    // were never real accounts; drop them so the UI doesn't claim the user is signed in.
    if (isObj(state.account) && typeof state.account.email === 'string' && /@user$/.test(state.account.email)) {
      state = { ...state, account: undefined };
    }
  }
  return state;
}

/**
 * Wrap a storage backend so read/write failures and corrupted JSON don't break hydration.
 * (zustand never fires onFinishHydration if getItem throws, which would hang the splash screen.)
 */
export function safeStorage(backend: StateStorage, onError?: (where: string, e: unknown) => void): StateStorage {
  return {
    getItem: async (name) => {
      try {
        const value = await backend.getItem(name);
        if (value == null) return null;
        JSON.parse(value); // validate; zustand parses again
        return value;
      } catch (e) {
        onError?.('getItem', e);
        try {
          await backend.removeItem(name);
        } catch {
          // ignore
        }
        return null;
      }
    },
    setItem: async (name, value) => {
      try {
        await backend.setItem(name, value);
      } catch (e) {
        onError?.('setItem', e);
      }
    },
    removeItem: async (name) => {
      try {
        await backend.removeItem(name);
      } catch (e) {
        onError?.('removeItem', e);
      }
    },
  };
}
