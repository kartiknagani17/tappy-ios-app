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

const STORES = ['All stores', 'Whole Foods', 'Trader Joe’s', 'Target', 'Walmart', 'Kroger'];
const CATEGORIES = ['All categories', 'Snacks', 'Bakery', 'Dairy & alternatives', 'Frozen', 'Pantry'];

export default function Grocery() {
  const restrictions = useStore((s) => s.restrictions);
  const overrides = useStore((s) => s.ingredientOverrides);
  const saved = useStore((s) => s.saved);
  const [query, setQuery] = useState('');
  const [likelyOnly, setLikelyOnly] = useState(true);
  const [store, setStore] = useState(STORES[0]);
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [picker, setPicker] = useState<null | 'store' | 'category'>(null);
  const [product, setProduct] = useState<DemoProduct | null>(null);

  const rated = useMemo(
    () => DEMO_PRODUCTS.map((p) => ({ p, rating: worst(rateNames(p.ingredients, restrictions, overrides).map((r) => r.rating)) })),
    [restrictions, overrides],
  );
  const q = query.trim().toLowerCase();
  const list = rated.filter((r) => (!likelyOnly || r.rating === 'green') && (!q || r.p.name.toLowerCase().includes(q)));

  return (
    <Screen>
      <View style={styles.searchRow}>
        <View style={styles.search}>
          <Feather name="search" size={18} color="#666" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search for a product"
            placeholderTextColor={colors.textSubtle}
            style={[{ flex: 1, fontSize: 16, color: colors.ink, height: '100%' }, noOutline]}
            clearButtonMode="while-editing"
          />
        </View>
        <Feather name="bell" size={24} color={colors.ink} />
      </View>
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          <Pressable
            accessibilityRole="switch"
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
          <Pressable style={styles.filter} onPress={() => setPicker('store')}>
            <Text style={styles.filterText}>{store === STORES[0] ? 'Store' : store}</Text>
            <Feather name="chevron-down" size={14} />
          </Pressable>
          <Pressable style={styles.filter} onPress={() => setPicker('category')}>
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
        renderItem={({ item }) => (
          <Pressable style={{ flex: 1 }} onPress={() => setProduct(item.p)}>
            <ProductTile p={item.p} rating={item.rating} saved={saved.includes(item.p.id)} />
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No matching products</Text>
            <Text style={styles.emptyBody}>Try turning off “Likely Works” or searching for something else.</Text>
          </View>
        }
      />
      <ProductSheet product={product} onClose={() => setProduct(null)} />
      <BottomSheet visible={!!picker} onClose={() => setPicker(null)} handle>
        <View style={{ paddingHorizontal: 16 }}>
          <Text style={styles.sheetTitle}>{picker === 'store' ? 'Store' : 'Category'}</Text>
          {(picker === 'store' ? STORES : CATEGORIES).map((o) => {
            const active = (picker === 'store' ? store : category) === o;
            return (
              <Pressable
                key={o}
                style={styles.option}
                onPress={() => {
                  haptic.select();
                  if (picker === 'store') setStore(o);
                  else setCategory(o);
                  setPicker(null);
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
    height: 36,
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
