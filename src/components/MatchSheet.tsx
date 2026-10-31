import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ApiProduct, FrontResult } from '../lib/api';
import { haptic } from '../lib/haptics';
import { colors, radius } from '../theme';
import { BottomSheet } from './BottomSheet';
import { Button, Radio } from './ui';

type Match = Extract<FrontResult, { status: 'match' }>;

/** The user must confirm which product the photo shows before any verdict is displayed. */
export function MatchSheet({
  match,
  onConfirm,
  onScanBarcode,
  onPhotographLabel,
  onClose,
}: {
  match: Match | null;
  onConfirm: (product: ApiProduct) => void;
  onScanBarcode: () => void;
  onPhotographLabel: () => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet visible={!!match} onClose={onClose} handle maxHeight={0.85}>
      {match ? (
        <MatchBody
          key={match.front_hash}
          match={match}
          onConfirm={onConfirm}
          onScanBarcode={onScanBarcode}
          onPhotographLabel={onPhotographLabel}
        />
      ) : null}
    </BottomSheet>
  );
}

function MatchBody({
  match,
  onConfirm,
  onScanBarcode,
  onPhotographLabel,
}: {
  match: Match;
  onConfirm: (product: ApiProduct) => void;
  onScanBarcode: () => void;
  onPhotographLabel: () => void;
}) {
  const single = match.decision === 'confirm_top';
  const [selected, setSelected] = useState<number | null>(
    match.preselected_product_id ?? (single ? (match.candidates[0]?.product.id ?? null) : null),
  );
  const chosen = match.candidates.find((c) => c.product.id === selected)?.product;

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{single ? 'Is this your product?' : 'Which one is it?'}</Text>
      <Text style={styles.sub}>
        {single ? 'Confirm before we check it against your profile.' : 'We found a few close matches. Pick the exact product.'}
      </Text>
      <View style={{ gap: 10, marginTop: 14 }}>
        {match.candidates.map(({ product }) => (
          <Pressable
            key={product.id}
            accessibilityRole="radio"
            accessibilityLabel={[product.name, product.brand, product.size_text].filter(Boolean).join(', ')}
            accessibilityState={{ selected: selected === product.id }}
            onPress={() => {
              haptic.select();
              setSelected(product.id);
            }}
            style={[styles.card, selected === product.id && styles.cardOn]}
          >
            {product.image_url ? (
              <Image source={{ uri: product.image_url }} style={styles.thumb} resizeMode="contain" />
            ) : (
              <View style={[styles.thumb, styles.thumbEmpty]}>
                <Feather name="package" size={22} color={colors.textSubtle} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={2}>
                {product.name}
              </Text>
              <Text style={styles.meta} numberOfLines={1}>
                {[product.brand, product.variant_or_flavor, product.size_text].filter(Boolean).join(' · ')}
              </Text>
            </View>
            {!single ? <Radio checked={selected === product.id} /> : null}
          </Pressable>
        ))}
      </View>
      <Button
        title={single ? 'Yes, that’s it' : 'Use this product'}
        disabled={!chosen}
        onPress={() => chosen && onConfirm(chosen)}
        style={{ marginTop: 18 }}
      />
      <Text style={styles.alt}>Not right?</Text>
      <View style={styles.altRow}>
        <Pressable accessibilityRole="button" style={styles.altBtn} onPress={onScanBarcode}>
          <Feather name="maximize" size={16} color={colors.ink} />
          <Text style={styles.altText}>Scan barcode</Text>
        </Pressable>
        <Pressable accessibilityRole="button" style={styles.altBtn} onPress={onPhotographLabel}>
          <Feather name="file-text" size={16} color={colors.ink} />
          <Text style={styles.altText}>Photo of ingredients</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingTop: 6 },
  title: { fontSize: 22, fontWeight: '600', color: colors.ink },
  sub: { fontSize: 15, color: colors.textMuted, marginTop: 4 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: 10,
  },
  cardOn: { borderColor: colors.purple, borderWidth: 2, padding: 9 },
  thumb: { width: 56, height: 56, borderRadius: radius.sm, backgroundColor: '#fff' },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted },
  name: { fontSize: 16, fontWeight: '600', color: colors.ink },
  meta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  alt: { textAlign: 'center', color: colors.textMuted, marginTop: 16, fontSize: 14 },
  altRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  altBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    height: 44,
  },
  altText: { fontSize: 14, fontWeight: '500', color: colors.ink },
});
