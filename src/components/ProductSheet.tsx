import { Feather } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { haptic } from '../lib/haptics';
import { rateNames, worst } from '../lib/ratings';
import { useStore } from '../lib/store';
import { colors, radius } from '../theme';
import { type DemoProduct, Package } from './art';
import { BottomSheet } from './BottomSheet';
import { Button, CloseButton, RatingIcon, ratingLabel } from './ui';

const VERDICT = {
  green: 'No conflicts found',
  yellow: 'Contains ingredients you limit',
  red: 'Does not fit your Tappy',
};

export function ProductSheet({
  product,
  onClose,
  onScanAgain,
}: {
  product: DemoProduct | null;
  onClose: () => void;
  onScanAgain?: () => void;
}) {
  const restrictions = useStore((s) => s.restrictions);
  const overrides = useStore((s) => s.ingredientOverrides);
  const saved = useStore((s) => s.saved);
  const toggleSaved = useStore((s) => s.toggleSaved);
  const rated = product ? rateNames(product.ingredients, restrictions, overrides) : [];
  const verdict = worst(rated.map((r) => r.rating));
  const isSaved = product ? saved.includes(product.id) : false;

  return (
    <BottomSheet visible={!!product} onClose={onClose} handle maxHeight={0.86}>
      {product ? (
        <View style={{ flexShrink: 1 }}>
          <View style={styles.head}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isSaved ? 'Remove from list' : 'Save to list'}
              testID="bookmark"
              hitSlop={12}
              onPress={() => {
                haptic.select();
                toggleSaved(product.id);
              }}
            >
              <Feather name="bookmark" size={24} color={isSaved ? colors.purple : colors.ink} />
            </Pressable>
            <CloseButton onPress={onClose} />
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }} style={{ flexShrink: 1 }}>
            <View style={styles.hero}>
              <Package p={product} size={150} />
            </View>
            <View style={styles.verdictRow}>
              <RatingIcon rating={verdict} size={30} />
              <Text style={styles.verdict}>{VERDICT[verdict]}</Text>
            </View>
            <Text style={styles.name}>{product.name}</Text>
            <Text style={styles.section}>Ingredients</Text>
            <Text style={styles.ingredients}>
              {rated.map((r, i) => (
                <Text key={r.name}>
                  <Text
                    style={
                      r.rating === 'red'
                        ? { color: colors.danger, fontWeight: '700', textDecorationLine: 'underline' }
                        : r.rating === 'yellow'
                          ? { color: '#B87800', fontWeight: '700', textDecorationLine: 'underline' }
                          : undefined
                    }
                  >
                    {r.rating === 'green' ? r.name.toLowerCase() : r.name.toUpperCase()}
                  </Text>
                  {i < rated.length - 1 ? ', ' : '.'}
                </Text>
              ))}
            </Text>
            <View style={styles.legend}>
              {(['red', 'yellow'] as const).map((k) => {
                const n = rated.filter((r) => r.rating === k).length;
                return n ? (
                  <View key={k} style={styles.legendItem}>
                    <RatingIcon rating={k} size={18} />
                    <Text style={styles.legendText}>
                      {n} {ratingLabel[k].toLowerCase()}
                    </Text>
                  </View>
                ) : null;
              })}
            </View>
            <Text style={styles.disclaimer}>Check the package yourself. Sample product for illustration; formulas change.</Text>
          </ScrollView>
          {onScanAgain ? (
            <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
              <Button title="Scan another product" onPress={onScanAgain} />
            </View>
          ) : null}
        </View>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  hero: { backgroundColor: colors.surfaceMuted, borderRadius: radius.xl, alignItems: 'center', justifyContent: 'center', height: 200 },
  verdictRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18 },
  verdict: { fontSize: 18, fontWeight: '600', color: colors.ink },
  name: { fontSize: 22, fontWeight: '600', color: colors.ink, marginTop: 8, lineHeight: 28 },
  section: { fontSize: 16, fontWeight: '700', color: colors.ink, marginTop: 20 },
  ingredients: { fontSize: 15, lineHeight: 24, color: colors.text, marginTop: 6 },
  legend: { flexDirection: 'row', gap: 16, marginTop: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendText: { fontSize: 14, color: colors.textMuted },
  disclaimer: { fontSize: 12, color: colors.textSubtle, marginTop: 18 },
});
