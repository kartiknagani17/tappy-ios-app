import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { haptic } from '../lib/haptics';
import { MAX_LISTS, useStore, type ListIcon, type SavedProduct } from '../lib/store';
import { colors, radius } from '../theme';
import { BottomSheet } from './BottomSheet';
import { NewListSheet } from './NewListSheet';

export const LIST_ICONS: Record<ListIcon, React.ComponentProps<typeof Feather>['name']> = {
  list: 'list',
  pin: 'map-pin',
  cart: 'shopping-cart',
  heart: 'heart',
};

/** "Add to list": tick the lists a product belongs to, or start a new one. */
export function ListPicker({ product, onClose }: { product: SavedProduct | null; onClose: () => void }) {
  const lists = useStore((s) => s.lists);
  const [creating, setCreating] = useState(false);
  return (
    <>
      <BottomSheet visible={!!product && !creating} onClose={onClose} handle maxHeight={0.7}>
        <View style={styles.head}>
          <Text style={styles.title} accessibilityRole="header">
            Add to list
          </Text>
          {product ? (
            <Text style={styles.sub} numberOfLines={1}>
              {product.name}
            </Text>
          ) : null}
        </View>
        <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          {product
            ? lists.map((l) => {
                const on = l.ids.includes(product.id);
                return (
                  <Pressable
                    key={l.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={l.name}
                    style={styles.row}
                    onPress={() => {
                      haptic.select();
                      useStore.getState().toggleInList(l.id, product);
                    }}
                  >
                    <View style={styles.icon}>
                      <Feather name={LIST_ICONS[l.icon]} size={20} color={colors.ink} />
                    </View>
                    <Text style={styles.name} numberOfLines={1}>
                      {l.name}
                    </Text>
                    <View style={[styles.check, on && styles.checkOn]}>{on ? <Feather name="check" size={16} color={colors.onPrimary} /> : null}</View>
                  </Pressable>
                );
              })
            : null}
          {lists.length < MAX_LISTS ? (
            <Pressable accessibilityRole="button" accessibilityLabel="New list" style={styles.row} onPress={() => setCreating(true)}>
              <View style={styles.icon}>
                <Feather name="plus" size={20} color={colors.accent} />
              </View>
              <Text style={[styles.name, { color: colors.accent, fontWeight: '600' }]}>New list</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </BottomSheet>
      <NewListSheet
        visible={creating && !!product}
        onClose={() => setCreating(false)}
        onSave={(name) => {
          const id = useStore.getState().createList(name);
          if (id && product) useStore.getState().toggleInList(id, product);
          setCreating(false);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: 16, paddingBottom: 8 },
  title: { fontSize: 22, fontWeight: '600', color: colors.ink, marginVertical: 8 },
  sub: { fontSize: 14, color: colors.textMuted },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 60, paddingVertical: 6 },
  icon: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  name: { flex: 1, fontSize: 17, color: colors.ink },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: colors.primary, borderColor: colors.primary },
});
