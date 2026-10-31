import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { api, ApiError, type ApiProduct } from '../lib/api';
import { haptic } from '../lib/haptics';
import { useStore } from '../lib/store';
import { computeVerdict, SOURCE_LABEL, verdictCopy, type VerdictState } from '../lib/verdict';
import { colors, noOutline, radius } from '../theme';
import { BottomSheet } from './BottomSheet';
import { Button, CloseButton, RatingIcon } from './ui';

const ICON: Record<VerdictState, 'red' | 'yellow' | 'green' | null> = {
  avoid: 'red',
  limit: 'yellow',
  no_conflicts: 'green',
  unknown: null,
};
const TINT: Record<VerdictState, string> = { avoid: '#FFF1EC', limit: '#FFF8DB', no_conflicts: '#EEFBF2', unknown: colors.surfaceMuted };

function formatDate(iso: string | null) {
  if (!iso) return 'date unknown';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function VerdictSheet({
  product,
  demo,
  onClose,
  onScanAgain,
  onPhotographLabel,
}: {
  product: ApiProduct | null;
  demo?: boolean;
  onClose: () => void;
  onScanAgain?: () => void;
  onPhotographLabel?: (gtin: string | null) => void;
}) {
  const restrictions = useStore((s) => s.restrictions);
  const overrides = useStore((s) => s.ingredientOverrides);
  const [reporting, setReporting] = useState(false);

  const verdict = product ? computeVerdict(product, restrictions, overrides) : null;
  const unverified = product && (product.source === 'ocr' || product.source === 'user') && !product.verified;
  const flaggedTerms = new Set(verdict?.flags.map((f) => f.term) ?? []);

  return (
    <BottomSheet visible={!!product} onClose={onClose} handle maxHeight={0.9}>
      {product && verdict ? (
        <View style={{ flexShrink: 1 }}>
          <View style={styles.head}>
            <Text style={styles.headTitle}>{demo ? 'Sample product' : 'Scan result'}</Text>
            <CloseButton onPress={onClose} />
          </View>
          <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}>
            {/* Which product this verdict is about */}
            <View style={styles.productRow}>
              {product.image_url ? (
                <Image source={{ uri: product.image_url }} style={styles.thumb} resizeMode="contain" />
              ) : (
                <View style={[styles.thumb, styles.thumbEmpty]}>
                  <Feather name="package" size={26} color={colors.textSubtle} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={3}>
                  {product.name}
                </Text>
                <Text style={styles.meta} numberOfLines={2}>
                  {[product.brand, product.variant_or_flavor, product.size_text].filter(Boolean).join(' · ') || ' '}
                </Text>
              </View>
            </View>

            {/* Verdict */}
            <View style={[styles.verdict, { backgroundColor: TINT[verdict.state] }]}>
              <View style={styles.verdictTop}>
                {ICON[verdict.state] ? (
                  <RatingIcon rating={ICON[verdict.state]!} size={30} />
                ) : (
                  <Feather name="help-circle" size={30} color={colors.textMuted} />
                )}
                <Text style={styles.verdictTitle}>{verdictCopy(verdict).title}</Text>
              </View>
              <Text style={styles.verdictBody}>{verdictCopy(verdict).body}</Text>
              {verdict.flags.length ? (
                <View style={{ marginTop: 10, gap: 6 }}>
                  {verdict.flags.map((f) => (
                    <View key={f.term + f.mayContain} style={styles.flag}>
                      <RatingIcon rating={f.rating} size={16} />
                      <Text style={styles.flagText}>
                        <Text style={{ fontWeight: '700', textTransform: 'capitalize' }}>{f.term}</Text>
                        {f.mayContain ? ' (may contain)' : ''}
                        {f.restrictions.length ? ` · ${f.restrictions.join(', ')}` : ''}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>

            <View style={styles.warning}>
              <Feather name="alert-triangle" size={16} color="#8A5A00" />
              <Text style={styles.warningText}>Check the package yourself. Recipes change, and our data can be wrong or out of date.</Text>
            </View>

            {verdict.reason === 'no_ingredients' && onPhotographLabel ? (
              <Button
                title="Photograph the ingredient list"
                onPress={() => onPhotographLabel(product.gtin14 || null)}
                style={{ marginTop: 14 }}
                icon={<Feather name="camera" size={18} color={colors.ink} style={{ marginRight: 8 }} />}
              />
            ) : null}

            {/* What the verdict was based on */}
            <Text style={styles.section}>Ingredients this is based on</Text>
            {product.ingredients_text ? (
              <Text style={styles.ingredients}>{highlight(product.ingredients_text, flaggedTerms)}</Text>
            ) : (
              <Text style={styles.missing}>No ingredient list on file for this product.</Text>
            )}
            {product.allergens_text ? (
              <Text style={[styles.ingredients, { marginTop: 6, fontWeight: '600' }]}>{product.allergens_text}</Text>
            ) : null}

            <View style={styles.provenance}>
              <Text style={styles.provText}>
                Source: {demo ? 'Tapi sample data' : (SOURCE_LABEL[product.source] ?? product.source)} · Updated{' '}
                {formatDate(product.source_updated_at)}
              </Text>
              {unverified ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{product.label ?? 'User-submitted, unverified'}</Text>
                </View>
              ) : null}
              {product.under_review && !unverified ? (
                <Text style={styles.provText}>Someone reported this product; it’s being reviewed.</Text>
              ) : null}
              {product.gtin14 ? <Text style={styles.provText}>Barcode {product.gtin14.replace(/^0+(?=\d{12})/, '')}</Text> : null}
              {!demo ? (
                <Text accessibilityRole="link" style={[styles.provText, styles.link]} onPress={() => router.push('/credits')}>
                  Data sources & credits
                </Text>
              ) : null}
            </View>

            {product.id !== null && !demo ? (
              <Pressable accessibilityRole="button" testID="report" hitSlop={8} onPress={() => setReporting(true)} style={styles.report}>
                <Feather name="flag" size={16} color={colors.danger} />
                <Text style={styles.reportText}>Report wrong info</Text>
              </Pressable>
            ) : null}
          </ScrollView>
          {onScanAgain ? (
            <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
              <Button title="Scan another product" onPress={onScanAgain} />
            </View>
          ) : null}
          <ReportSheet productId={reporting ? product.id : null} onClose={() => setReporting(false)} />
        </View>
      ) : null}
    </BottomSheet>
  );
}

function highlight(text: string, terms: Set<string>) {
  if (!terms.size) return text;
  // Whole words only, so "egg" isn't highlighted inside "eggplant".
  const alts = [...terms]
    .sort((a, b) => b.length - a.length)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  const re = new RegExp(`(?<![A-Za-z0-9])(${alts})(?![A-Za-z0-9])`, 'gi');
  return text.split(re).map((part, i) =>
    terms.has(part.toLowerCase()) ? (
      <Text key={i} style={{ color: colors.danger, fontWeight: '700', textDecorationLine: 'underline' }}>
        {part}
      </Text>
    ) : (
      part
    ),
  );
}

const REASONS = ['Ingredients are wrong or outdated', 'Wrong product for this barcode', 'Allergen info is wrong', 'Other'];

function ReportSheet({ productId, onClose }: { productId: number | null; onClose: () => void }) {
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');

  const close = () => {
    onClose();
    setTimeout(() => {
      setReason(null);
      setNote('');
      setState('idle');
    }, 300);
  };

  return (
    <BottomSheet visible={productId !== null} onClose={close} handle>
      <View style={{ paddingHorizontal: 16, gap: 12 }}>
        {state === 'sent' ? (
          <>
            <Text style={styles.sheetTitle}>Thanks for the report</Text>
            <Text style={styles.verdictBody}>We’ll review this product. Until then, it’s marked as under review for everyone.</Text>
            <Button title="Done" onPress={close} />
          </>
        ) : (
          <>
            <Text style={styles.sheetTitle}>What’s wrong?</Text>
            {REASONS.map((r) => (
              <Pressable
                key={r}
                accessibilityRole="radio"
                accessibilityState={{ selected: reason === r }}
                style={[styles.reason, reason === r && styles.reasonOn]}
                onPress={() => {
                  haptic.select();
                  setReason(r);
                }}
              >
                <Text style={styles.reasonText}>{r}</Text>
                {reason === r ? <Feather name="check" size={18} color={colors.purple} /> : null}
              </Pressable>
            ))}
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Details (optional)"
              accessibilityLabel="Details (optional)"
              placeholderTextColor={colors.textSubtle}
              style={[styles.input, noOutline]}
              multiline
            />
            {state === 'error' ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
            <Button
              title="Send report"
              disabled={!reason}
              loading={state === 'sending'}
              onPress={async () => {
                if (productId === null || !reason) return;
                setState('sending');
                try {
                  await api.report(productId, note.trim() ? `${reason}: ${note.trim()}` : reason);
                  haptic.success();
                  setState('sent');
                } catch (e) {
                  setError(e instanceof ApiError ? e.message : 'Could not send the report.');
                  setState('error');
                }
              }}
            />
          </>
        )}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  headTitle: { fontSize: 15, fontWeight: '600', color: colors.textMuted },
  productRow: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  thumb: { width: 72, height: 72, borderRadius: radius.md, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.borderLight },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted },
  name: { fontSize: 19, fontWeight: '600', color: colors.ink, lineHeight: 24 },
  meta: { fontSize: 14, color: colors.textMuted, marginTop: 3 },
  verdict: { borderRadius: radius.lg, padding: 14, marginTop: 16 },
  verdictTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  verdictTitle: { fontSize: 18, fontWeight: '700', color: colors.ink, flex: 1 },
  verdictBody: { fontSize: 14, lineHeight: 20, color: colors.text, marginTop: 6 },
  flag: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flagText: { fontSize: 14, color: colors.text, flex: 1 },
  warning: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    backgroundColor: '#FFF6E0',
    borderRadius: radius.md,
    padding: 10,
    marginTop: 10,
  },
  warningText: { fontSize: 13, lineHeight: 18, color: '#5C3D00', flex: 1, fontWeight: '500' },
  section: { fontSize: 16, fontWeight: '700', color: colors.ink, marginTop: 20 },
  ingredients: { fontSize: 14, lineHeight: 21, color: colors.text, marginTop: 6 },
  missing: { fontSize: 14, color: colors.textMuted, marginTop: 6, fontStyle: 'italic' },
  provenance: { marginTop: 16, gap: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 12 },
  provText: { fontSize: 12, color: colors.textMuted },
  link: { textDecorationLine: 'underline' },
  badge: { alignSelf: 'flex-start', backgroundColor: '#FFE8CC', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 12, fontWeight: '700', color: '#8A4B00' },
  report: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 14, paddingVertical: 6 },
  reportText: { color: colors.danger, fontWeight: '600', fontSize: 14 },
  sheetTitle: { fontSize: 20, fontWeight: '600', color: colors.ink, marginTop: 6 },
  reason: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 14,
  },
  reasonOn: { borderColor: colors.purple, backgroundColor: colors.purpleSoft },
  reasonText: { fontSize: 15, color: colors.ink },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 12,
    minHeight: 64,
    fontSize: 15,
    color: colors.ink,
  },
});
