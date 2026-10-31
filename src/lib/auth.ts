/**
 * Account configuration. There is no account backend yet, so accounts are OFF.
 *
 * While AUTH_ENABLED is false:
 *  - the auth screen explains that profiles are saved on this device only, and never pretends
 *    to sign anyone in, restore a profile or send a password-reset email;
 *  - screens that prompt for an account should hide those prompts (check AUTH_ENABLED).
 *
 * To turn accounts on: implement `signIn`, `signUp` and `requestPasswordReset` against a real
 * backend (store any session token with expo-secure-store, never AsyncStorage), list only the
 * providers whose SDKs are actually wired up in ENABLED_PROVIDERS, then set AUTH_ENABLED = true.
 */
export const AUTH_ENABLED = false;

export type SocialProvider = 'apple' | 'google' | 'facebook';
export type AccountProvider = 'email' | SocialProvider;

/**
 * Social providers that are really implemented. App Store Guideline 4.8: if any third-party
 * login (Google, Facebook) is offered, Sign in with Apple must be offered too; `socialProviders()`
 * enforces that. Never list a provider that isn't wired to its SDK.
 */
const ENABLED_PROVIDERS: readonly SocialProvider[] = [];

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

export class AuthUnavailableError extends Error {
  constructor() {
    super('Accounts aren’t available yet. Your profile is saved on this device.');
  }
}

export type AuthResult = { email: string; provider: AccountProvider };

/** Replace with a real backend call. Must reject on bad credentials. */
export async function signIn(_email: string, _password: string): Promise<AuthResult> {
  throw new AuthUnavailableError();
}

/** Replace with a real backend call. */
export async function signUp(_email: string, _password: string): Promise<AuthResult> {
  throw new AuthUnavailableError();
}

/** Replace with a real backend call. Only claim an email was sent after the backend confirms. */
export async function requestPasswordReset(_email: string): Promise<void> {
  throw new AuthUnavailableError();
}

/** Replace with the provider SDK (expo-apple-authentication for Apple). */
export async function signInWithProvider(_provider: SocialProvider): Promise<AuthResult> {
  throw new AuthUnavailableError();
}
