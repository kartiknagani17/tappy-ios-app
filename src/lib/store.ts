import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Selection } from '../data/restrictions';

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
  saved: string[];
  deviceId?: string;
  /** User opted in to share scanned product photos to improve the database. */
  contributePhotos: boolean;
};

type Actions = {
  set: (patch: Partial<State>) => void;
  setRestriction: (id: string, sel: Selection | null) => void;
  setOverride: (ingredientId: string, rating: Rating | null) => void;
  resetOverrides: () => void;
  applyAvoidList: () => void;
  resetAll: () => void;
  toggleSaved: (productId: string) => void;
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
  contributePhotos: false,
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
      toggleSaved: (id) => set((st) => ({ saved: st.saved.includes(id) ? st.saved.filter((x) => x !== id) : [...st.saved, id] })),
    }),
    {
      name: 'tapi-store-v1',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
