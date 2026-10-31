import { Feather } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { DEMO_PRODUCTS, ProductTile, type DemoProduct } from '../../components/art';
import { BottomSheet } from '../../components/BottomSheet';
import { ProductSheet } from '../../components/ProductSheet';
import { RatingIcon, Screen } from '../../components/ui';
import { haptic } from '../../lib/haptics';
import { rateNames, worst } from '../../lib/ratings';
import { useStore } from '../../lib/store';
import { colors, radius, noOutline } from '../../theme';

const CATEGORIES = ['All categories', 'Snacks', 'Bakery', 'Dairy & alternatives', 'Frozen', 'Pantry'];

export default function Grocery() {
  const restrictions = useStore((s) => s.restrictions);
  const overrides = useStore((s) => s.ingredientOverrides);
  const saved = useStore((s) => s.saved);
  const [query, setQuery] = useState('');
  const [likelyOnly, setLikelyOnly] = useState(true);
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [picker, setPicker] = useState(false);
  const [product, setProduct] = useState<DemoProduct | null>(null);

  const rated = useMemo(
    () => DEMO_PRODUCTS.map((p) => ({ p, rating: worst(rateNames(p.ingredients, restrictions, overrides).map((r) => r.rating)) })),
    [restrictions, overrides],
  );
  const q = query.trim().toLowerCase();
  const list = rated.filter(
    (r) =>
      (!likelyOnly || r.rating === 'green') &&
      (category === CATEGORIES[0] || r.p.category === category) &&
      (!q || r.p.name.toLowerCase().includes(q) || r.p.brand.toLowerCase().includes(q)),
  );

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
            placeholder="Search for a product"
            placeholderTextColor={colors.textSubtle}
            style={[{ flex: 1, fontSize: 16, color: colors.ink, height: '100%' }, noOutline]}
            clearButtonMode="while-editing"
          />
        </View>
      </View>
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          <Pressable
            testID="likely-works"
            accessibilityRole="switch"
            accessibilityLabel="Only show products that likely work for you"
            accessibilityState={{ checked: likelyOnly }}
            style={[styles.filter, likelyOnly && styles.filterOn]}
            onPress={() => {
              haptic.select();
              setLikelyOnly((v) => !v);
            }}
          >
            <RatingIcon rating="green" size={18} />
            <Text style={styles.filterText}>Likely Works</Text>
          </Pressable>
          <Pressable
            testID="category"
            accessibilityRole="button"
            accessibilityLabel={`Category: ${category}`}
            style={[styles.filter, category !== CATEGORIES[0] && styles.filterOn]}
            onPress={() => setPicker(true)}
          >
            <Text style={styles.filterText}>{category === CATEGORIES[0] ? 'Category' : category}</Text>
            <Feather name="chevron-down" size={14} />
          </Pressable>
        </ScrollView>
      </View>
      <FlatList
        data={list}
        keyExtractor={(i) => i.p.id}
        numColumns={2}
        columnWrapperStyle={{ gap: 14 }}
        contentContainerStyle={{ padding: 16, gap: 18 }}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <Pressable
            style={{ flex: 1 }}
            accessibilityRole="button"
            accessibilityLabel={`${item.p.name}. ${item.rating === 'green' ? 'Likely works' : item.rating === 'yellow' ? 'Contains something you limit' : 'Contains something you avoid'}`}
            onPress={() => setProduct(item.p)}
          >
            <ProductTile p={item.p} rating={item.rating} saved={saved.includes(item.p.id)} />
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No matching products</Text>
            <Text style={styles.emptyBody}>Try turning off “Likely Works”, changing the category, or searching for something else.</Text>
          </View>
        }
      />
      <ProductSheet product={product} onClose={() => setProduct(null)} />
      <BottomSheet visible={picker} onClose={() => setPicker(false)} handle>
        <View style={{ paddingHorizontal: 16 }}>
          <Text style={styles.sheetTitle}>Category</Text>
          {CATEGORIES.map((o) => {
            const active = category === o;
            return (
              <Pressable
                key={o}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                style={styles.option}
                onPress={() => {
                  haptic.select();
                  setCategory(o);
                  setPicker(false);
                }}
              >
                <Text style={styles.optionText}>{o}</Text>
                {active ? <Feather name="check" size={20} color={colors.purple} /> : null}
              </Pressable>
            );
          })}
        </View>
      </BottomSheet>
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
  filters: { gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  filter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    minHeight: 40,
  },
  filterOn: { borderColor: colors.ink, backgroundColor: '#F6FFE0' },
  filterText: { fontSize: 14, color: colors.ink },
  empty: { alignItems: 'center', padding: 32 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: colors.ink },
  emptyBody: { fontSize: 15, color: colors.textMuted, textAlign: 'center', marginTop: 6 },
  sheetTitle: { fontSize: 20, fontWeight: '600', color: colors.ink, marginVertical: 8 },
  option: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 52 },
  optionText: { fontSize: 17, color: colors.ink },
});
