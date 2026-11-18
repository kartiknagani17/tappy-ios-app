import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Selection } from '../data/restrictions';
import { STORE_VERSION, migratePersisted, safeStorage, sanitizePersisted } from './persist';

export type Rating = 'green' | 'yellow' | 'red';

export const AVOID_DEFAULTS = [
  'added-sugar',
  'artificial-flavors',
  'food-coloring',
  'artificial-sweeteners',
  'common-additives',
  'emulsifiers',
] as const;

type State = {
  mindset?: string;
  heardFrom?: string;
  goal?: string;
  restrictionsWanted?: boolean;
  avoidList: string[];
  duration?: number;
  restrictions: Record<string, Selection>;
  ingredientOverrides: Record<string, Rating>;
  seenIngredientIntro: boolean;
  onboarded: boolean;
  trialActive: boolean;
  agreedToTerms: boolean;
  askedPush: boolean;
  account?: { email: string; provider: 'email' | 'google' | 'apple' | 'facebook' };
  accountPromptDismissed: boolean;
  /** Bookmarked products (newest first), shown in Lists. Fresh data is fetched when Lists opens. */
  saved: SavedProduct[];
  /** Named lists of saved products. Every product in a list is also in `saved` ("All Saved"). */
  lists: UserList[];
  deviceId?: string;
  /** User opted in to share scanned product photos to improve the database. */
  contributePhotos: boolean;
  /** "Tried it?" answers, by GTIN-14. */
  tried: Record<string, TriedVote>;
  /** Products to watch for ingredient changes, by GTIN-14, with the label text last seen. */
  watched: Record<string, WatchedProduct>;
  /** When the watched products were last checked for changes (ms since epoch). */
  lastChangeCheck: number;
};

export type TriedVote = 'up' | 'down';
export type SavedProduct = { id: number; gtin14: string; name: string; brand: string | null; image_url: string | null };
export const MAX_SAVED = 300;
export type ListIcon = 'list' | 'pin' | 'cart' | 'heart';
export type UserList = { id: string; name: string; icon: ListIcon; ids: number[] };
export const MAX_LISTS = 30;
export const MAX_LIST_NAME = 40;
export const DEFAULT_LISTS: UserList[] = [
  { id: 'want-to-try', name: 'Want to Try', icon: 'pin', ids: [] },
  { id: 'weekly-shopping', name: 'Weekly Shopping List', icon: 'cart', ids: [] },
  { id: 'favorites', name: 'My Favorites', icon: 'heart', ids: [] },
];
export type WatchedProduct = { id: number; name: string; snapshot: string };

type Actions = {
  set: (patch: Partial<State>) => void;
  setRestriction: (id: string, sel: Selection | null) => void;
  setOverride: (ingredientId: string, rating: Rating | null) => void;
  resetOverrides: () => void;
  applyAvoidList: () => void;
  resetAll: () => void;
  toggleSaved: (product: SavedProduct) => void;
  /** Create a list; returns its id (or null when the name is empty or there are too many lists). */
  createList: (name: string) => string | null;
  renameList: (id: string, name: string) => void;
  deleteList: (id: string) => void;
  /** Add or remove a product from a list (adding also saves it to All Saved). */
  toggleInList: (listId: string, product: SavedProduct) => void;
  setTried: (gtin14: string, vote: TriedVote | null) => void;
  setWatched: (gtin14: string, product: WatchedProduct | null) => void;
};

const initial: State = {
  avoidList: [...AVOID_DEFAULTS],
  restrictions: {},
  ingredientOverrides: {},
  seenIngredientIntro: false,
  onboarded: false,
  trialActive: false,
  agreedToTerms: false,
  askedPush: false,
  accountPromptDismissed: false,
  saved: [],
  lists: DEFAULT_LISTS.map((l) => ({ ...l, ids: [] })),
  contributePhotos: false,
  tried: {},
  watched: {},
  lastChangeCheck: 0,
};

export const useStore = create<State & Actions>()(
  persist(
    (set, get) => ({
      ...initial,
      set: (patch) => set(patch),
      setRestriction: (id, sel) =>
        set((st) => {
          const next = { ...st.restrictions };
          if (sel) next[id] = sel;
          else delete next[id];
          return { restrictions: next };
        }),
      setOverride: (ingredientId, rating) =>
        set((st) => {
          const next = { ...st.ingredientOverrides };
          if (rating) next[ingredientId] = rating;
          else delete next[ingredientId];
          return { ingredientOverrides: next };
        }),
      resetOverrides: () => set({ ingredientOverrides: {} }),
      // Converts the "We'll help you avoid these ingredients" checklist into profile selections.
      applyAvoidList: () => {
        const list = new Set(get().avoidList);
        const r = { ...get().restrictions };
        const toggle = (id: string, on: boolean, sel: Selection) => {
          if (on) r[id] = sel;
          else delete r[id];
        };
        toggle('added-sugar', list.has('added-sugar'), { level: 'preference' });
        toggle('artificial-flavors', list.has('artificial-flavors'), { level: 'preference' });
        toggle('food-coloring', list.has('food-coloring'), {
          level: 'preference',
          items: ['blue-1', 'blue-2', 'green-3', 'red-3', 'red-40', 'yellow-5', 'yellow-6', 'other-colors'],
        });
        toggle('sweeteners', list.has('artificial-sweeteners'), {
          level: 'preference',
          items: ['acesulfame', 'allulose', 'aspartame', 'monk-fruit', 'saccharin', 'stevia', 'sucralose', 'sugar-alcohols'],
        });
        toggle('common-additives', list.has('common-additives'), {
          level: 'preference',
          items: [
            'azodicarbonamide',
            'bha-bht',
            'bvo',
            'hfcs',
            'hydrogenated',
            'msg',
            'nitrates',
            'parabens',
            'potassium-bromate',
            'sodium-benzoate',
          ],
        });
        toggle('emulsifier-free', list.has('emulsifiers'), { level: 'preference', items: ['emul-gut'] });
        set({ restrictions: r });
      },
      // Keep the anonymous device id across resets so daily limits can't be bypassed by resetting.
      resetAll: () => set((st) => ({ ...initial, deviceId: st.deviceId })),
      toggleSaved: (p) =>
        set((st) =>
          st.saved.some((x) => x.id === p.id)
            ? { saved: st.saved.filter((x) => x.id !== p.id), lists: st.lists.map((l) => (l.ids.includes(p.id) ? { ...l, ids: l.ids.filter((i) => i !== p.id) } : l)) }
            : { saved: [{ id: p.id, gtin14: p.gtin14, name: p.name, brand: p.brand, image_url: p.image_url }, ...st.saved].slice(0, MAX_SAVED) },
        ),
      createList: (name) => {
        const clean = name.replace(/\s+/g, ' ').trim().slice(0, MAX_LIST_NAME);
        if (!clean || get().lists.length >= MAX_LISTS) return null;
        const id = `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
        set((st) => ({ lists: [...st.lists, { id, name: clean, icon: 'list', ids: [] }] }));
        return id;
      },
      renameList: (id, name) => {
        const clean = name.replace(/\s+/g, ' ').trim().slice(0, MAX_LIST_NAME);
        if (!clean) return;
        set((st) => ({ lists: st.lists.map((l) => (l.id === id ? { ...l, name: clean } : l)) }));
      },
      deleteList: (id) => set((st) => ({ lists: st.lists.filter((l) => l.id !== id) })),
      toggleInList: (listId, p) =>
        set((st) => {
          const list = st.lists.find((l) => l.id === listId);
          if (!list) return {};
          const inList = list.ids.includes(p.id);
          const lists = st.lists.map((l) => (l.id === listId ? { ...l, ids: inList ? l.ids.filter((i) => i !== p.id) : [p.id, ...l.ids] } : l));
          if (inList || st.saved.some((x) => x.id === p.id)) return { lists };
          return { lists, saved: [{ id: p.id, gtin14: p.gtin14, name: p.name, brand: p.brand, image_url: p.image_url }, ...st.saved].slice(0, MAX_SAVED) };
        }),
      setTried: (gtin14, vote) =>
        set((st) => {
          const next = { ...st.tried };
          if (vote) next[gtin14] = vote;
          else delete next[gtin14];
          return { tried: next };
        }),
      setWatched: (gtin14, product) =>
        set((st) => {
          const next = { ...st.watched };
          if (product) next[gtin14] = product;
          else delete next[gtin14];
          return { watched: next };
        }),
    }),
    {
      name: 'tappy-store-v1',
      // Corrupted JSON or a storage error resets to defaults instead of hanging hydration.
      storage: createJSONStorage(() =>
        safeStorage(AsyncStorage, (where, e) => {
          if (__DEV__) console.warn(`[store] ${where} failed`, e);
        }),
      ),
      version: STORE_VERSION,
      migrate: (persisted, fromVersion) => migratePersisted(persisted, fromVersion) as unknown as State & Actions,
      // Only well-typed fields from disk are applied over the defaults (never actions, never bad shapes).
      merge: (persisted, current) => ({ ...current, ...(sanitizePersisted(persisted) as Partial<State>) }),
      // Persist data only, not the action functions.
      partialize: (st) => {
        const {
          set: _s,
          setRestriction: _r,
          setOverride: _o,
          resetOverrides: _ro,
          applyAvoidList: _a,
          resetAll: _ra,
          toggleSaved: _t,
          createList: _cl,
          renameList: _rl,
          deleteList: _dl,
          toggleInList: _tl,
          setTried: _st,
          setWatched: _sw,
          ...data
        } = st;
        return data;
      },
    },
  ),
);
