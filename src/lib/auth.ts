import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { API_CONFIG_ERROR, API_URL, ApiError, setRequestIdentity } from './api';
import { sanitizePersisted } from './persist';
import { useStore } from './store';
import { identifyPurchaser, resetPurchaser } from './subscription';

/**
 * Accounts, backed by the Tappy server (/api/auth/*, /api/account*).
 *
 *  - Email + password, and Sign in with Apple (App Store Guideline 4.8 is met: Apple is the only social login).
 *  - The session token lives in the iOS Keychain (expo-secure-store), never in AsyncStorage.
 *  - While signed in, the dietary profile is synced to the account so it can be restored on a new phone.
 */
export const AUTH_ENABLED = true;

export type SocialProvider = 'apple' | 'google' | 'facebook';
export type AccountProvider = 'email' | SocialProvider;

/** Only providers that are really wired up. Never add Google/Facebook without keeping Apple (4.8). */
const ENABLED_PROVIDERS: readonly SocialProvider[] = Platform.OS === 'ios' ? ['apple'] : [];

export function socialProviders(): SocialProvider[] {
  if (!AUTH_ENABLED) return [];
  const list = [...ENABLED_PROVIDERS];
  if (list.some((p) => p !== 'apple') && !list.includes('apple')) return []; // 4.8: no third-party login without Apple
  return [...list.filter((p) => p === 'apple'), ...list.filter((p) => p !== 'apple')]; // Apple first
}

/** Reasonable email check: one @, no spaces, a dot in the domain, sane lengths. */
export function isValidEmail(input: string): boolean {
  const email = input.trim();
  if (email.length < 6 || email.length > 254) return false;
  return /^[^\s@]{1,64}@[^\s@.]+(?:\.[^\s@.]+)*\.[a-z]{2,}$/i.test(email);
}

export const MIN_PASSWORD = 8;

/** Thrown when the user backs out of a system sheet (Sign in with Apple); the UI shows nothing. */
export class AuthCancelledError extends Error {
  constructor() {
    super('');
  }
}

export type AuthResult = { email: string; provider: AccountProvider; restoredProfile: boolean };

type ServerAccount = { id: number; email: string | null; provider: 'email' | 'apple' };
type SessionResponse = { token: string; account: ServerAccount };

const TOKEN_KEY = 'tappy.session';

async function getToken(): Promise<string | null> {
  try {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    setRequestIdentity({ token });
    return token;
  } catch {
    return null;
  }
}
async function setToken(token: string | null) {
  setRequestIdentity({ token });
  try {
    if (token) await SecureStore.setItemAsync(TOKEN_KEY, token, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK });
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // ignore: the account state in the store is cleared below either way
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown, token?: string | null): Promise<T> {
  if (API_CONFIG_ERROR) throw new ApiError(0, 'config', 'Tappy isn’t configured correctly. Please update the app.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch {
    clearTimeout(timer);
    if (controller.signal.aborted) throw new ApiError(0, 'timeout', 'Tappy is taking too long to respond. Please try again.');
    throw new ApiError(0, 'network', 'Can’t reach Tappy right now. Check your connection and try again.');
  }
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const obj = isObj(json) ? json : {};
    const message =
      typeof obj.message === 'string' && obj.message.length <= 300
        ? obj.message
        : res.status === 429
          ? 'Too many attempts. Please wait a minute and try again.'
          : 'Something went wrong. Please try again.';
    throw new ApiError(res.status, typeof obj.error === 'string' ? obj.error : 'error', message);
  }
  if (!isObj(json)) throw new ApiError(res.status, 'bad_response', 'We got an unexpected answer from Tappy. Please try again.');
  return json as T;
}

const isSession = (v: SessionResponse) => typeof v.token === 'string' && isObj(v.account) && typeof v.account.id === 'number';

// ---------- profile sync ----------

/** The parts of the store that make up the dietary profile (never the device id, account or purchase state). */
const PROFILE_KEYS = [
  'mindset',
  'heardFrom',
  'goal',
  'restrictionsWanted',
  'avoidList',
  'duration',
  'restrictions',
  'ingredientOverrides',
  'seenIngredientIntro',
  'saved',
  'onboarded',
  'agreedToTerms',
  'contributePhotos',
] as const;

function localProfile(): Record<string, unknown> {
  const st = useStore.getState() as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of PROFILE_KEYS) if (st[k] !== undefined) out[k] = st[k];
  return out;
}

/** Applies a profile from the server, through the same sanitizer as on-disk data. */
function applyProfile(remote: unknown): boolean {
  const clean = sanitizePersisted(remote);
  const patch: Record<string, unknown> = {};
  for (const k of PROFILE_KEYS) if (k in clean) patch[k] = clean[k];
  if (patch.onboarded !== true) return false;
  useStore.getState().set(patch);
  return true;
}

let uploadTimer: ReturnType<typeof setTimeout> | null = null;
let lastUploaded = '';

async function uploadProfile() {
  const token = await getToken();
  if (!token || !useStore.getState().account) return;
  const profile = localProfile();
  const json = JSON.stringify(profile);
  if (json === lastUploaded) return;
  try {
    await call('POST', '/api/account/profile', { profile }, token);
    lastUploaded = json;
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) await endLocalSession();
    // Otherwise try again on the next change.
  }
}

/** Debounced upload whenever the profile changes while signed in. */
export function startProfileSync() {
  return useStore.subscribe((st, prev) => {
    if (!st.account) return;
    if (!PROFILE_KEYS.some((k) => st[k] !== prev[k])) return;
    if (uploadTimer) clearTimeout(uploadTimer);
    uploadTimer = setTimeout(() => void uploadProfile(), 1500);
  });
}

async function endLocalSession() {
  await setToken(null);
  lastUploaded = '';
  useStore.getState().set({ account: undefined });
  await resetPurchaser();
}

/**
 * After any sign-in: keep the session, link purchases, and reconcile the profile.
 * A finished profile on this phone wins and is uploaded; otherwise a profile saved to the account is restored.
 */
async function startSession(out: SessionResponse, provider: AccountProvider): Promise<AuthResult> {
  if (!isSession(out)) throw new ApiError(200, 'bad_response', 'We got an unexpected answer from Tappy. Please try again.');
  await setToken(out.token);
  const email = out.account.email ?? '';
  useStore.getState().set({ account: { email, provider }, accountPromptDismissed: true });
  await identifyPurchaser(`tappy-user-${out.account.id}`);

  let restoredProfile = false;
  if (!useStore.getState().onboarded) {
    try {
      const me = await call<{ profile: unknown }>('GET', '/api/account', undefined, out.token);
      restoredProfile = applyProfile(me.profile);
    } catch {
      // Not fatal: the user sets up a profile and it syncs afterwards.
    }
  }
  if (!restoredProfile) void uploadProfile();
  return { email, provider, restoredProfile };
}

// ---------- public API ----------

export async function signIn(email: string, password: string): Promise<AuthResult> {
  return startSession(await call<SessionResponse>('POST', '/api/auth/login', { email, password }), 'email');
}

export async function signUp(email: string, password: string): Promise<AuthResult> {
  return startSession(await call<SessionResponse>('POST', '/api/auth/signup', { email, password }), 'email');
}

/** Emails a 6-digit code. Resolves the same way whether or not the email has an account. */
export async function requestPasswordReset(email: string): Promise<void> {
  await call('POST', '/api/auth/reset/request', { email });
}

export async function confirmPasswordReset(email: string, code: string, password: string): Promise<AuthResult> {
  return startSession(await call<SessionResponse>('POST', '/api/auth/reset/confirm', { email, code, password }), 'email');
}

/** True when the server can send reset emails (otherwise "Forgot password?" is hidden). */
export async function passwordResetAvailable(): Promise<boolean> {
  try {
    const health = await call<{ password_reset?: unknown }>('GET', '/api/health');
    return health.password_reset === true;
  } catch {
    return false;
  }
}

export async function signInWithProvider(provider: SocialProvider): Promise<AuthResult> {
  if (provider !== 'apple' || !(await AppleAuthentication.isAvailableAsync())) {
    throw new Error('This sign-in option isn’t available on this device.');
  }
  // The server receives the raw nonce; Apple's token carries its SHA-256, which the server checks.
  const rawNonce = Crypto.randomUUID();
  const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce: hashed,
    });
  } catch (e) {
    if (isObj(e) && e.code === 'ERR_REQUEST_CANCELED') throw new AuthCancelledError();
    throw new Error('Sign in with Apple didn’t work. Please try again.');
  }
  if (!credential.identityToken) throw new Error('Sign in with Apple didn’t work. Please try again.');
  return startSession(
    await call<SessionResponse>('POST', '/api/auth/apple', { identity_token: credential.identityToken, nonce: rawNonce }),
    'apple',
  );
}

export async function signOut(): Promise<void> {
  const token = await getToken();
  if (token) await uploadProfile(); // last changes first
  if (token) await call('POST', '/api/auth/logout', {}, token).catch(() => {});
  await endLocalSession();
}

/** Permanently deletes the account on the server (Guideline 5.1.1(v)). Throws if the server can't be reached. */
export async function deleteAccount(): Promise<void> {
  const token = await getToken();
  if (token) {
    try {
      await call('POST', '/api/account/delete', {}, token);
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) throw e; // 401: session already gone, nothing left to delete
    }
  }
  await endLocalSession();
}

/** On launch: a signed-in state without a stored token (e.g. restored from a backup) is cleared. */
export async function checkSession(): Promise<void> {
  const account = useStore.getState().account;
  const token = await getToken();
  if (!account) {
    if (token) await setToken(null);
    return;
  }
  if (!token) return endLocalSession();
  try {
    await call('GET', '/api/account', undefined, token);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) await endLocalSession();
  }
}
