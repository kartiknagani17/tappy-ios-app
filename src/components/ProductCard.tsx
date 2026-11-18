import { Feather } from '@expo/vector-icons';
import { memo } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { haptic } from '../lib/haptics';
import { useStore, type Rating, type SavedProduct } from '../lib/store';
import { colors, radius } from '../theme';
import { RatingIcon } from './ui';

const RATING_WORDS: Record<Rating, string> = {
  green: 'Fits your profile',
  yellow: 'Has something you limit',
  red: 'Has something you avoid',
};

/**
 * A real product in a two-column grid (Grocery, Lists): photo, fit rating and a bookmark.
 * rating undefined = still checking; null = not enough data to say.
 */
export const ProductCard = memo(function ProductCard({
  product,
  rating,
  onPress,
}: {
  product: SavedProduct;
  rating: Rating | null | undefined;
  onPress: () => void;
}) {
  const saved = useStore((s) => s.saved.some((x) => x.id === product.id));
  const status = rating === undefined ? 'Checking' : rating ? RATING_WORDS[rating] : 'Not enough data';
  return (
    <View style={styles.card}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${product.name}. ${status}`} onPress={onPress}>
        <View style={styles.imageWrap}>
          {product.image_url ? (
            <Image source={{ uri: product.image_url }} style={styles.image} resizeMode="contain" accessibilityIgnoresInvertColors />
          ) : (
            <Feather name="package" size={36} color={colors.textSubtle} />
          )}
          <View style={styles.badge}>
            {rating === undefined ? (
              <ActivityIndicator size="small" color={colors.textMuted} />
            ) : rating ? (
              <RatingIcon rating={rating} size={26} />
            ) : (
              <Feather name="help-circle" size={24} color={colors.textMuted} />
            )}
          </View>
        </View>
        <Text style={styles.name} numberOfLines={2}>
          {product.name}
        </Text>
        {product.brand ? (
          <Text style={styles.brand} numberOfLines={1}>
            {product.brand}
          </Text>
        ) : null}
      </Pressable>
      {/* A sibling of the card's button (not inside it), in the photo's bottom-right corner. */}
      <View style={styles.photoOverlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={saved ? `Remove ${product.name} from Lists` : `Save ${product.name} to Lists`}
          accessibilityState={{ selected: saved }}
          hitSlop={10}
          style={styles.save}
          onPress={() => {
            haptic.select();
            useStore.getState().toggleSaved(product);
          }}
        >
          <Feather name="bookmark" size={18} color={saved ? colors.accent : '#5E514D'} />
        </Pressable>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: { flex: 1 },
  imageWrap: {
    aspectRatio: 1,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: { width: '84%', height: '84%' },
  badge: { position: 'absolute', left: 8, bottom: 8 },
  photoOverlay: { position: 'absolute', top: 0, left: 0, right: 0, aspectRatio: 1, pointerEvents: 'box-none' },
  save: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: 14, lineHeight: 18, fontWeight: '500', color: colors.ink, marginTop: 8 },
  brand: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
});
