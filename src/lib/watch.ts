import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { api, type ApiProduct } from './api';
import { useStore } from './store';

/**
 * "Get notified of ingredient changes". Watched products are kept on the phone with the label text
 * last seen. When the app comes to the foreground (at most every few hours) their current data is
 * fetched; a product whose ingredients or allergen statement changed gets a notification.
 */
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

/** What counts as "the label changed": ingredients + allergen statement, ignoring case and spacing. */
export function labelSnapshot(p: Pick<ApiProduct, 'ingredients_text' | 'allergens_text'>): string {
  return `${p.ingredients_text ?? ''}|${p.allergens_text ?? ''}`.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Start or stop watching a product. Asks for notification permission when turning it on. */
export async function setWatching(product: ApiProduct, on: boolean): Promise<boolean> {
  const { setWatched } = useStore.getState();
  if (!on || product.id === null) {
    setWatched(product.gtin14, null);
    return false;
  }
  setWatched(product.gtin14, { id: product.id, name: product.name, snapshot: labelSnapshot(product) });
  try {
    const p = await Notifications.getPermissionsAsync();
    if (p.status === 'undetermined') await Notifications.requestPermissionsAsync();
  } catch {
    // Notifications unavailable: the product is still watched; changes show up next time it's scanned.
  }
  return true;
}

export async function checkWatchedProducts(now = Date.now()): Promise<void> {
  const st = useStore.getState();
  const entries = Object.entries(st.watched);
  if (!entries.length || now - st.lastChangeCheck < CHECK_EVERY_MS) return;
  st.set({ lastChangeCheck: now });
  let products: ApiProduct[];
  try {
    products = (await api.lookup(entries.map(([, w]) => w.id))).products;
  } catch {
    st.set({ lastChangeCheck: 0 }); // try again next time the app opens
    return;
  }
  const byId = new Map(products.map((p) => [p.id, p]));
  for (const [gtin, w] of entries) {
    const p = byId.get(w.id);
    if (!p) continue;
    const snapshot = labelSnapshot(p);
    if (snapshot === w.snapshot) continue;
    useStore.getState().setWatched(gtin, { ...w, snapshot });
    try {
      const perm = await Notifications.getPermissionsAsync();
      if (perm.status !== 'granted') continue;
      await Notifications.scheduleNotificationAsync({
        content: { title: 'Ingredients changed', body: `${w.name} has a new ingredient list. Scan it again to check it against your profile.` },
        trigger: null,
      });
    } catch {
      // ignore: nothing more we can do without notifications
    }
  }
}

/** Check watched products on launch and whenever the app returns to the foreground. */
export function useWatchedProductChecks(ready: boolean) {
  useEffect(() => {
    if (!ready) return;
    checkWatchedProducts().catch(() => {});
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') checkWatchedProducts().catch(() => {});
    });
    return () => sub.remove();
  }, [ready]);
}
