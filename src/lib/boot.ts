import { router, useRootNavigationState, useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import { useStore } from './store';

/**
 * True once the persisted store has loaded, or after `timeoutMs` as a fail-safe so a storage
 * problem can never leave the user stuck on the splash screen.
 */
export function useStoreReady(timeoutMs = 4000): boolean {
  const [ready, setReady] = useState(() => useStore.persist.hasHydrated());
  useEffect(() => {
    if (ready) return;
    const done = () => setReady(true);
    const unsub = useStore.persist.onFinishHydration(done);
    // Hydration may have finished between the first render and this effect.
    if (useStore.persist.hasHydrated()) queueMicrotask(done);
    const t = setTimeout(() => {
      if (__DEV__ && !useStore.persist.hasHydrated()) console.warn('[boot] store hydration timed out; continuing with defaults');
      done();
    }, timeoutMs);
    return () => {
      unsub();
      clearTimeout(t);
    };
  }, [ready, timeoutMs]);
  return ready;
}

/** Last onboarding screens, which must only be reached by going through the flow (they mark the user onboarded). */
const LATE_ONBOARDING = new Set(['finishing', 'scanner-ready', 'pass', 'reminder', 'paywall', 'safety']);

/**
 * Keeps deep links (tapi://…) from putting the app in a bad state:
 *  - the main tabs require a finished onboarding (otherwise every scan is checked against an empty profile);
 *  - the end of onboarding (paywall, safety, …) can't be opened directly by someone who hasn't
 *    set up a profile yet, since finishing there marks them onboarded.
 * Runs as an effect so screens that set `onboarded` and navigate in the same handler aren't affected.
 */
export function useRouteGuard(ready: boolean) {
  const segments = useSegments() as string[];
  const nav = useRootNavigationState();
  const onboarded = useStore((s) => s.onboarded);
  const first = segments[0];
  const second = segments[1];
  const navKey = nav?.key;
  const cameThroughProfile = !!nav?.routes?.some((r) => r.name === 'onboarding/profile');

  useEffect(() => {
    if (!ready || !navKey || onboarded) return;
    if (first === '(tabs)') {
      router.replace('/welcome');
      return;
    }
    if (first === 'onboarding' && second && LATE_ONBOARDING.has(second) && !cameThroughProfile) {
      router.replace('/welcome');
    }
  }, [ready, navKey, onboarded, first, second, cameThroughProfile]);
}
