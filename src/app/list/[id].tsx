import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { NewListSheet } from '../../components/NewListSheet';
import { ProductCard } from '../../components/ProductCard';
import { Button, Screen } from '../../components/ui';
import { VerdictSheet } from '../../components/VerdictSheet';
import type { ApiProduct } from '../../lib/api';
import { haptic } from '../../lib/haptics';
import { useStore } from '../../lib/store';
import { useFreshProducts } from '../../lib/useFreshProducts';
import { computeVerdict, verdictRating } from '../../lib/verdict';
import { colors } from '../../theme';

/** One list (or "All Saved", id "all"): the saved products in it, with their current fit rating. */
export default function ListDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const saved = useStore((s) => s.saved);
  const list = useStore((s) => s.lists.find((l) => l.id === id));
  const restrictions = useStore((s) => s.restrictions);
  const overrides = useStore((s) => s.ingredientOverrides);
  const isAll = id === 'all';
  const [open, setOpen] = useState<ApiProduct | null>(null);
  const [renaming, setRenaming] = useState(false);

  const members = useMemo(() => (isAll ? saved : list ? saved.filter((p) => list.ids.includes(p.id)) : []), [isAll, saved, list]);
  const fresh = useFreshProducts(members.map((p) => p.id));
  const items = useMemo(
    () =>
      members.map((s) => {
        const p = fresh.products.get(s.id);
        return {
          saved: p ? { ...s, name: p.name, brand: p.brand, image_url: p.image_url } : s,
          product: p ?? null,
          rating: p ? verdictRating(computeVerdict(p, restrictions, overrides)) : fresh.state === 'loading' ? undefined : null,
        };
      }),
    [members, fresh, restrictions, overrides],
  );

  const title = isAll ? 'All Saved' : (list?.name ?? 'List');
  const removeList = () => {
    const go = () => {
      useStore.getState().deleteList(id);
      router.back();
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`Delete “${title}”?\n\nThe products stay in All Saved.`)) go();
      return;
    }
    Alert.alert(`Delete “${title}”?`, 'The products stay in All Saved.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete list', style: 'destructive', onPress: go },
    ]);
  };

  if (!isAll && !list) {
    return (
      <Screen>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} onPress={() => router.back()}>
            <Feather name="arrow-left" size={26} color={colors.ink} />
          </Pressable>
        </View>
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>This list no longer exists</Text>
          <Button title="Back to Lists" onPress={() => router.back()} style={{ alignSelf: 'stretch', marginTop: 16 }} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable testID="list-back" accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} onPress={() => router.back()}>
          <Feather name="arrow-left" size={26} color={colors.ink} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
        {!isAll ? (
          <View style={styles.actions}>
            <Pressable testID="rename-list" accessibilityRole="button" accessibilityLabel="Rename list" hitSlop={8} onPress={() => setRenaming(true)}>
              <Feather name="edit-2" size={21} color={colors.ink} />
            </Pressable>
            <Pressable
              testID="delete-list"
              accessibilityRole="button"
              accessibilityLabel="Delete list"
              hitSlop={8}
              onPress={() => {
                haptic.warning();
                removeList();
              }}
            >
              <Feather name="trash-2" size={21} color={colors.danger} />
            </Pressable>
          </View>
        ) : null}
      </View>

      <FlatList
        data={items}
        keyExtractor={(i) => String(i.saved.id)}
        numColumns={2}
        columnWrapperStyle={{ gap: 14 }}
        contentContainerStyle={{ padding: 16, gap: 20, flexGrow: 1 }}
        refreshing={false}
        onRefresh={fresh.reload}
        renderItem={({ item }) => (
          <ProductCard product={item.saved} rating={item.rating} onPress={() => (item.product ? setOpen(item.product) : fresh.reload())} />
        )}
        ListHeaderComponent={
          fresh.state === 'error' && items.length ? (
            <Text style={styles.offline}>Couldn’t check your saved products right now. Pull down to try again.</Text>
          ) : undefined
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="bookmark" size={40} color={colors.textSubtle} />
            <Text style={styles.emptyTitle}>{isAll ? 'No saved products yet' : 'Nothing in this list yet'}</Text>
            <Text style={styles.emptyBody}>
              {isAll
                ? 'Tap the bookmark on a scanned product, or in Grocery, to keep the ones that work for you here.'
                : 'Open a product and tap the list button next to the bookmark to add it here.'}
            </Text>
            <Button title="Browse groceries" onPress={() => router.navigate('/(tabs)/grocery')} style={{ alignSelf: 'stretch', marginTop: 20 }} />
          </View>
        }
      />

      <VerdictSheet product={open} onClose={() => setOpen(null)} onOpenProduct={(p) => setOpen(p)} />
      <NewListSheet
        visible={renaming}
        title="Rename list"
        initial={list?.name ?? ''}
        saveLabel="Save"
        onClose={() => setRenaming(false)}
        onSave={(name) => {
          useStore.getState().renameList(id, name);
          setRenaming(false);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingTop: 8, height: 56 },
  title: { flex: 1, fontSize: 24, fontWeight: '700', color: colors.ink, letterSpacing: -0.3 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: colors.ink, marginTop: 14 },
  emptyBody: { fontSize: 15, color: colors.textMuted, textAlign: 'center', marginTop: 6 },
  offline: { fontSize: 14, color: colors.textMuted, paddingBottom: 8 },
});
