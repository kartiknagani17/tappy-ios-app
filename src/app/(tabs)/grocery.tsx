import { Feather } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ProductCard } from '../../components/ProductCard';
import { RatingIcon, Screen } from '../../components/ui';
import { VerdictSheet } from '../../components/VerdictSheet';
import { AISLES, api, ApiError, type Aisle, type ApiProduct } from '../../lib/api';
import { haptic } from '../../lib/haptics';
import { useStore } from '../../lib/store';
import { computeVerdict, fitsProfile, verdictRating } from '../../lib/verdict';
import { colors, noOutline, radius } from '../../theme';

/** With "Likely works" on, keep loading pages until at least this many fit (or MAX_AUTO_PAGES). */
const MIN_SHOWN = 12;
const MAX_AUTO_PAGES = 6;
const SEARCH_DELAY_MS = 350;

type Results = {
  key: string;
  products: ApiProduct[];
  nextOffset: number | null;
  pages: number;
  /** The page that failed to load, and why. */
  error: { offset: number; message: string } | null;
};

const empty = (key: string): Results => ({ key, products: [], nextOffset: null, pages: 0, error: null });

export default function Grocery() {
  const restrictions = useStore((s) => s.restrictions);
  const overrides = useStore((s) => s.ingredientOverrides);
  const hasProfile = Object.keys(restrictions).length > 0;
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [aisle, setAisle] = useState<Aisle | null>(null);
  const [likelyOnly, setLikelyOnly] = useState(true);
  const [open, setOpen] = useState<ApiProduct | null>(null);
  const [results, setResults] = useState<Results>(empty(''));
  /** "Load more" asked for by scrolling or a button: { key, offset }. */
  const [asked, setAsked] = useState<{ key: string; offset: number } | null>(null);
  const inflight = useRef('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(t);
  }, [query]);

  const searching = debounced.length >= 3;
  const key = searching || aisle ? `${aisle ?? ''}|${searching ? debounced.toLowerCase() : ''}` : '';
  const current = results.key === key ? results : empty(key);

  const rated = useMemo(
    () =>
      current.products.map((p) => {
        const v = computeVerdict(p, restrictions, overrides);
        return { p, rating: hasProfile ? verdictRating(v) : null, fits: fitsProfile(v) };
      }),
    [current.products, restrictions, overrides, hasProfile],
  );
  const filterOn = likelyOnly && hasProfile;
  const shown = filterOn ? rated.filter((r) => r.fits) : rated;

  // Which page to load next: the first page; more pages while "Likely works" has hidden most of
  // them; or the next page when the user scrolled to the end.
  const more = current.nextOffset;
  const want: number | null = !key
    ? null
    : current.pages === 0
      ? 0
      : more !== null && filterOn && shown.length < MIN_SHOWN && current.pages < MAX_AUTO_PAGES
        ? more
        : more !== null && asked?.key === key && asked.offset === more
          ? more
          : null;
  const failed = want !== null && current.error?.offset === want;
  const loading = want !== null && !failed;

  useEffect(() => {
    if (want === null || failed) return;
    const job = `${key}@${want}`;
    if (inflight.current === job) return;
    inflight.current = job;
    const cut = key.indexOf('|'); // the search text itself may contain "|"
    const a = key.slice(0, cut);
    const q = key.slice(cut + 1);
    api
      .browse({ q: q || undefined, aisle: (a || null) as Aisle | null, offset: want })
      .then((res) =>
        setResults((r) => {
          const base = r.key === key ? r : empty(key);
          if (base.pages > 0 && base.nextOffset !== want) return base; // a stale or repeated page
          const seen = new Set(base.products.map((p) => p.gtin14));
          return {
            key,
            products: [...base.products, ...res.products.filter((p) => !seen.has(p.gtin14))],
            nextOffset: res.next_offset,
            pages: base.pages + 1,
            error: null,
          };
        }),
      )
      .catch((e) =>
        setResults((r) => ({
          ...(r.key === key ? r : empty(key)),
          error: { offset: want, message: e instanceof ApiError ? e.message : 'Something went wrong.' },
        })),
      )
      .finally(() => {
        if (inflight.current === job) inflight.current = '';
      });
  }, [key, want, failed]);

  const loadMore = () => {
    if (more !== null && !loading) setAsked({ key, offset: more });
  };
  const retry = () => setResults((r) => (r.key === key ? { ...r, error: null } : r));

  const pickAisle = (a: Aisle | null) => {
    haptic.select();
    setAisle((cur) => (cur === a ? null : a));
  };

  return (
    <Screen>
      <View style={styles.searchRow}>
        <View style={styles.search}>
          <Feather name="search" size={18} color="#666" />
          <TextInput
            testID="grocery-search"
            accessibilityLabel="Search for a product"
            value={query}
            onChangeText={setQuery}
            placeholder="Search for a product or brand"
            placeholderTextColor={colors.textSubtle}
            style={[styles.input, noOutline]}
            clearButtonMode="while-editing"
            returnKeyType="search"
            autoCorrect={false}
            onSubmitEditing={() => setDebounced(query.trim())}
          />
        </View>
      </View>

      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
          keyboardShouldPersistTaps="handled"
        >
          {hasProfile ? (
            <Pressable
              testID="likely-works"
              accessibilityRole="switch"
              accessibilityLabel="Only show products that likely work for you"
              accessibilityState={{ checked: likelyOnly }}
              hitSlop={4}
              style={[styles.filter, likelyOnly && styles.filterOn]}
              onPress={() => {
                haptic.select();
                setLikelyOnly((v) => !v);
              }}
            >
              <RatingIcon rating="green" size={18} />
              <Text style={styles.filterText}>Likely works</Text>
            </Pressable>
          ) : null}
          {AISLES.map((a) => (
            <Pressable
              key={a.id}
              accessibilityRole="button"
              accessibilityLabel={a.label}
              accessibilityState={{ selected: aisle === a.id }}
              hitSlop={4}
              style={[styles.filter, aisle === a.id && styles.filterOn]}
              onPress={() => pickAisle(a.id)}
            >
              <Text style={styles.filterText}>
                {a.emoji} {a.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {!key ? (
        <ScrollView contentContainerStyle={styles.home} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled">
          <Text style={styles.homeTitle}>Find food that fits you</Text>
          <Text style={styles.homeBody}>
            {query.trim().length > 0 && query.trim().length < 3
              ? 'Type at least 3 letters to search.'
              : hasProfile
                ? 'Search for a product, or pick an aisle. We’ll show the ones that fit your profile.'
                : 'Search for a product, or pick an aisle. Add your diets in Settings to see which ones fit you.'}
          </Text>
          <View style={styles.aisleGrid}>
            {AISLES.map((a) => (
              <Pressable
                key={a.id}
                accessibilityRole="button"
                accessibilityLabel={`Browse ${a.label}`}
                style={styles.aisleTile}
                onPress={() => pickAisle(a.id)}
              >
                <Text style={styles.aisleEmoji}>{a.emoji}</Text>
                <Text style={styles.aisleLabel}>{a.label}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(i) => i.p.gtin14}
          numColumns={2}
          columnWrapperStyle={{ gap: 14 }}
          contentContainerStyle={{ padding: 16, gap: 20, flexGrow: 1 }}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          onEndReachedThreshold={0.6}
          onEndReached={loadMore}
          renderItem={({ item }) => (
            <ProductCard
              product={{ id: item.p.id ?? 0, gtin14: item.p.gtin14, name: item.p.name, brand: item.p.brand, image_url: item.p.image_url }}
              rating={item.rating}
              onPress={() => setOpen(item.p)}
            />
          )}
          ListFooterComponent={
            loading && shown.length ? (
              <ActivityIndicator style={{ marginVertical: 16 }} color={colors.textMuted} />
            ) : current.error && shown.length ? (
              <Pressable accessibilityRole="button" style={[styles.retry, { alignSelf: 'center' }]} onPress={retry}>
                <Text style={styles.retryText}>Couldn’t load more. Try again</Text>
              </Pressable>
            ) : undefined
          }
          ListEmptyComponent={
            loading ? (
              <View style={styles.empty}>
                <ActivityIndicator color={colors.textMuted} />
                <Text style={styles.emptyBody}>{filterOn ? 'Finding products that fit your profile…' : 'Searching…'}</Text>
              </View>
            ) : current.error ? (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>Couldn’t load products</Text>
                <Text style={styles.emptyBody}>{current.error.message}</Text>
                <Pressable accessibilityRole="button" style={styles.retry} onPress={retry}>
                  <Text style={styles.retryText}>Try again</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>No matching products</Text>
                <Text style={styles.emptyBody}>
                  {filterOn && rated.length
                    ? `None of the ${rated.length} products we checked fit your profile. Turn off “Likely works” to see them anyway.`
                    : 'Try a different word, or check the spelling.'}
                </Text>
                {filterOn && rated.length > 0 && more !== null ? (
                  <Pressable accessibilityRole="button" style={styles.retry} onPress={loadMore}>
                    <Text style={styles.retryText}>Check more products</Text>
                  </Pressable>
                ) : null}
              </View>
            )
          }
        />
      )}

      <VerdictSheet product={open} onClose={() => setOpen(null)} onOpenProduct={(p) => setOpen(p)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingTop: 8 },
  search: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 46,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
  },
  input: { flex: 1, fontSize: 16, color: colors.ink, height: '100%' },
  filters: { gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  filter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    height: 36,
  },
  filterOn: { borderColor: colors.ink, backgroundColor: '#F6FFE0' },
  filterText: { fontSize: 14, color: colors.ink },
  home: { padding: 16, paddingBottom: 32 },
  homeTitle: { fontSize: 22, fontWeight: '700', color: colors.ink, marginTop: 8 },
  homeBody: { fontSize: 15, lineHeight: 21, color: colors.textMuted, marginTop: 6 },
  aisleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 20 },
  aisleTile: {
    width: '47%',
    flexGrow: 1,
    height: 84,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
    padding: 14,
    justifyContent: 'space-between',
  },
  aisleEmoji: { fontSize: 26 },
  aisleLabel: { fontSize: 15, fontWeight: '600', color: colors.ink },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: colors.ink },
  emptyBody: { fontSize: 15, color: colors.textMuted, textAlign: 'center', lineHeight: 21 },
  retry: {
    marginTop: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  retryText: { fontSize: 15, fontWeight: '600', color: colors.ink },
});
