import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, Share, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { api, ApiError, type ApiProduct } from '../lib/api';
import { haptic } from '../lib/haptics';
import { useStore, type Rating } from '../lib/store';
import {
  computeVerdict,
  fitLabel,
  formatAllergens,
  highlightParts,
  restrictionBreakdown,
  SOURCE_LABEL,
  verdictCopy,
  type Flag,
  type RestrictionRow,
  type VerdictState,
} from '../lib/verdict';
import { setWatching } from '../lib/watch';
import { colors, noOutline, radius } from '../theme';
import { BottomSheet } from './BottomSheet';
import { Button, CloseButton, RatingIcon } from './ui';

const ICON: Record<VerdictState, Rating | null> = {
  avoid: 'red',
  limit: 'yellow',
  no_conflicts: 'green',
  unknown: null,
};
/** Text color for a flagged ingredient in the ingredient list. */
const HIT_COLOR: Record<Rating, string> = { red: '#C2410C', yellow: '#B7791F', green: colors.text };
/** Overview rows shown before "Show more". */
const ROWS_COLLAPSED = 3;
const SIMILAR_SHOWN = 10;

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
  onOpenProduct,
}: {
  product: ApiProduct | null;
  demo?: boolean;
  onClose: () => void;
  onScanAgain?: () => void;
  /** recheck: the product has ingredients on file, but the user's package may show a newer recipe. */
  onPhotographLabel?: (gtin: string | null, recheck?: boolean) => void;
  /** Open another product's result (from "Similar items"). */
  onOpenProduct?: (product: ApiProduct) => void;
}) {
  const restrictions = useStore((s) => s.restrictions);
  const overrides = useStore((s) => s.ingredientOverrides);
  const tried = useStore((s) => (product ? s.tried[product.gtin14] : undefined));
  const watched = useStore((s) => (product ? !!s.watched[product.gtin14] : false));
  const [reporting, setReporting] = useState(false);
  const [reacting, setReacting] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [scrolled, setScrolled] = useState(false);

  const verdict = useMemo(() => (product ? computeVerdict(product, restrictions, overrides) : null), [product, restrictions, overrides]);
  const rows = useMemo(() => (product ? restrictionBreakdown(product, restrictions, overrides) : []), [product, restrictions, overrides]);
  const ratingByTerm = useMemo(() => new Map(verdict?.flags.map((f) => [f.term, f.rating]) ?? []), [verdict]);
  const similar = useSimilar(demo ? null : product, restrictions, overrides);

  // A new product starts at the top with everything collapsed (state reset during render, not in an effect).
  const key = product?.gtin14 ?? '';
  const [shownKey, setShownKey] = useState(key);
  if (shownKey !== key) {
    setShownKey(key);
    setShowAll(false);
    setOpen(new Set());
    setScrolled(false);
  }

  const unverified = product && (product.source === 'ocr' || product.source === 'user') && !product.verified;
  const allergenLine = product ? formatAllergens(product.allergens_text) : null;
  const canFollow = !!product && product.id !== null && !demo;
  const shownRows = showAll ? rows : rows.slice(0, ROWS_COLLAPSED);

  return (
    <BottomSheet visible={!!product} onClose={onClose} handle maxHeight={0.92}>
      {product && verdict ? (
        <View style={{ flexShrink: 1 }}>
          {/* Top bar: the product name appears once the hero has scrolled away */}
          <View style={[styles.topBar, scrolled && styles.topBarScrolled]}>
            <CloseButton onPress={onClose} />
            <Text style={styles.topTitle} numberOfLines={2}>
              {scrolled ? product.name : demo ? 'Sample product' : ''}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Share"
              hitSlop={10}
              onPress={() => {
                Share.share({ message: `${product.name}: ${fitLabel(verdict).toLowerCase()} (checked with Tappy)` }).catch(() => {});
              }}
              style={styles.iconBtn}
            >
              <Feather name="share" size={22} color={colors.ink} />
            </Pressable>
          </View>

          <ScrollView
            key={key}
            style={{ flexShrink: 1 }}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}
            scrollEventThrottle={32}
            onScroll={(e) => {
              const y = e.nativeEvent.contentOffset.y;
              if (y > 300 !== scrolled) setScrolled(y > 300);
            }}
          >
            {/* Hero */}
            <View style={styles.hero}>
              {product.image_url ? (
                <Image source={{ uri: product.image_url }} style={styles.heroImage} resizeMode="contain" accessibilityIgnoresInvertColors />
              ) : (
                <View style={[styles.heroImage, styles.heroEmpty]}>
                  <Feather name="package" size={48} color={colors.textSubtle} />
                </View>
              )}
            </View>
            <View style={{ marginTop: 4 }}>
              {ICON[verdict.state] ? (
                <RatingIcon rating={ICON[verdict.state]!} size={44} />
              ) : (
                <Feather name="help-circle" size={44} color={colors.textMuted} />
              )}
            </View>
            <Text style={styles.name}>{product.name}</Text>
            {product.brand || product.size_text ? (
              <Text style={styles.meta} numberOfLines={1}>
                {[product.brand, product.variant_or_flavor, product.size_text].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
            <Text style={styles.fit}>{fitLabel(verdict)}</Text>

            {/* Follow-up actions */}
            {canFollow ? (
              <>
                <View style={styles.divider} />
                <View style={styles.actionRow}>
                  <Feather name="bell" size={24} color={colors.ink} />
                  <Text style={styles.actionText}>Get notified of ingredient changes</Text>
                  <Switch
                    value={watched}
                    accessibilityLabel="Get notified of ingredient changes"
                    trackColor={{ true: colors.purple, false: colors.border }}
                    onValueChange={(on) => {
                      haptic.select();
                      void setWatching(product, on);
                    }}
                  />
                </View>
                <View style={styles.divider} />
                <View style={styles.actionRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.triedSmall}>Tried it?</Text>
                    <Text style={styles.triedBig}>Log how it went for you</Text>
                  </View>
                  {(['up', 'down'] as const).map((v) => (
                    <Pressable
                      key={v}
                      accessibilityRole="button"
                      accessibilityLabel={v === 'up' ? 'It went well' : 'It didn’t go well'}
                      accessibilityState={{ selected: tried === v }}
                      onPress={() => {
                        haptic.select();
                        useStore.getState().setTried(product.gtin14, tried === v ? null : v);
                      }}
                      style={[styles.thumb, tried === v && styles.thumbOn]}
                    >
                      <Feather name={v === 'up' ? 'thumbs-up' : 'thumbs-down'} size={22} color={colors.ink} />
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}

            <View style={styles.band} />

            {/* Diet overview: one row per restriction in the profile, worst first */}
            <Text style={styles.h2}>Diet overview</Text>
            {rows.length ? (
              <>
                <View style={{ gap: 12, marginTop: 14 }}>
                  {shownRows.map((row) => (
                    <OverviewRow
                      key={row.id}
                      row={row}
                      open={open.has(row.id)}
                      onToggle={() => {
                        haptic.select();
                        setOpen((s) => {
                          const n = new Set(s);
                          if (n.has(row.id)) n.delete(row.id);
                          else n.add(row.id);
                          return n;
                        });
                      }}
                    />
                  ))}
                </View>
                {rows.length > ROWS_COLLAPSED ? (
                  <Pressable accessibilityRole="button" onPress={() => setShowAll((s) => !s)} style={styles.showMore} hitSlop={8}>
                    <Text style={styles.showMoreText}>{showAll ? 'Show less' : 'Show more'}</Text>
                    <Feather name={showAll ? 'chevron-up' : 'chevron-down'} size={18} color={colors.ink} />
                  </Pressable>
                ) : null}
              </>
            ) : (
              <Text style={styles.overviewEmpty}>{verdictCopy(verdict).body}</Text>
            )}

            {verdict.reason === 'no_ingredients' && onPhotographLabel ? (
              <Button
                title="Photograph the ingredient list"
                onPress={() => onPhotographLabel(product.gtin14 || null)}
                style={{ marginTop: 14 }}
                icon={<Feather name="camera" size={18} color={colors.ink} style={{ marginRight: 8 }} />}
              />
            ) : null}

            <View style={styles.warning}>
              <Feather name="alert-triangle" size={16} color="#8A5A00" />
              <Text style={styles.warningText}>Check the package yourself. Recipes change, and our data can be wrong or out of date.</Text>
            </View>

            <View style={styles.band} />

            {/* What the verdict was based on */}
            <Text style={styles.h2}>Ingredients</Text>
            {product.ingredients_text ? (
              <Text style={styles.ingredients}>{highlight(product.ingredients_text, verdict.flags, ratingByTerm)}</Text>
            ) : (
              <Text style={styles.missing}>No ingredient list on file for this product.</Text>
            )}

            {allergenLine ? (
              <>
                <View style={styles.divider} />
                <Text style={styles.h3}>Allergen statement</Text>
                <Text style={styles.ingredients}>{allergenLine}</Text>
              </>
            ) : null}

            <View style={styles.provenance}>
              <Text style={styles.provText}>
                Source: {demo ? 'Tappy sample data' : (SOURCE_LABEL[product.source] ?? product.source)} · Updated{' '}
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

            {!demo ? (
              <>
                {product.ingredients_text && product.gtin14 && product.id !== null && onPhotographLabel ? (
                  <>
                    <View style={styles.divider} />
                    <LinkRow
                      icon="camera"
                      title="Package looks different?"
                      body="Photograph the ingredient list. If the recipe changed, we’ll update it."
                      onPress={() => onPhotographLabel(product.gtin14, true)}
                    />
                  </>
                ) : null}
                <View style={styles.divider} />
                <LinkRow
                  icon="activity"
                  title="Report a reaction"
                  body="Felt unwell after trying this product? Tell us what happened."
                  onPress={() => setReacting(true)}
                />
                {product.id !== null ? (
                  <>
                    <View style={styles.divider} />
                    <LinkRow
                      icon="flag"
                      title="Report a data issue"
                      body="Wrong ingredients, rating, or product info? Let us know."
                      onPress={() => setReporting(true)}
                      testID="report"
                    />
                  </>
                ) : null}
              </>
            ) : null}

            {/* Alternatives that fit the profile */}
            {similar.state !== 'off' ? (
              <>
                <View style={styles.band} />
                <Text style={styles.h2}>Similar items</Text>
                {similar.state === 'loading' ? (
                  <Text style={styles.overviewEmpty}>Looking for similar products that fit your profile…</Text>
                ) : similar.items.length ? (
                  <>
                    <Text style={styles.similarSub}>Products like this one that fit your profile.</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingTop: 12 }}>
                      {similar.items.map((p) => (
                        <Pressable
                          key={p.gtin14}
                          accessibilityRole="button"
                          accessibilityLabel={`${p.name}, fits your profile`}
                          disabled={!onOpenProduct}
                          onPress={() => onOpenProduct?.(p)}
                          style={styles.card}
                        >
                          <View style={styles.cardImageWrap}>
                            {p.image_url ? (
                              <Image source={{ uri: p.image_url }} style={styles.cardImage} resizeMode="contain" />
                            ) : (
                              <Feather name="package" size={32} color={colors.textSubtle} />
                            )}
                            <View style={styles.cardBadge}>
                              <RatingIcon rating="green" size={30} />
                            </View>
                          </View>
                          <Text style={styles.cardName} numberOfLines={2}>
                            {p.name}
                          </Text>
                          {p.brand ? (
                            <Text style={styles.cardBrand} numberOfLines={1}>
                              {p.brand}
                            </Text>
                          ) : null}
                        </Pressable>
                      ))}
                    </ScrollView>
                  </>
                ) : (
                  <Text style={styles.overviewEmpty}>We couldn’t find similar products that fit your profile yet.</Text>
                )}
              </>
            ) : null}
          </ScrollView>

          {onScanAgain ? (
            <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
              <Button title="Scan another product" onPress={onScanAgain} />
            </View>
          ) : null}
          <ReportSheet productId={reporting ? product.id : null} onClose={() => setReporting(false)} />
          <ReactionSheet product={reacting ? product : null} onClose={() => setReacting(false)} />
        </View>
      ) : null}
    </BottomSheet>
  );
}

function OverviewRow({ row, open, onToggle }: { row: RestrictionRow; open: boolean; onToggle: () => void }) {
  const definite = row.flags.filter((f) => !f.mayContain);
  const mayContain = row.flags.filter((f) => f.mayContain);
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${row.name}: ${row.rating === 'green' ? 'nothing found' : row.rating === 'red' ? 'conflicts' : 'some concerns'}`}
        onPress={onToggle}
        style={styles.rowHead}
      >
        <RatingIcon rating={row.rating} size={30} />
        <Text style={styles.rowName}>{row.name}</Text>
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={20} color={colors.ink} />
      </Pressable>
      {open ? (
        <View style={styles.rowBody}>
          {row.flags.length ? (
            <>
              {definite.length ? (
                <Text style={styles.rowText}>
                  <Text style={styles.rowLabel}>Contains: </Text>
                  {definite.map((f) => f.label).join(', ')}
                </Text>
              ) : null}
              {mayContain.length ? (
                <Text style={styles.rowText}>
                  <Text style={styles.rowLabel}>May contain: </Text>
                  {mayContain.map((f) => f.label).join(', ')}
                </Text>
              ) : null}
            </>
          ) : (
            <Text style={styles.rowText}>We didn’t find anything from this in the ingredient list.</Text>
          )}
          {row.about ? <Text style={styles.rowAbout}>{row.about}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

function LinkRow({
  icon,
  title,
  body,
  onPress,
  testID,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  body: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable accessibilityRole="button" testID={testID} onPress={onPress} style={styles.linkRow}>
      <Feather name={icon} size={24} color={colors.ink} />
      <View style={{ flex: 1 }}>
        <Text style={styles.linkTitle}>{title}</Text>
        <Text style={styles.linkBody}>{body}</Text>
      </View>
      <View style={styles.linkChevron}>
        <Feather name="chevron-right" size={18} color={colors.ink} />
      </View>
    </Pressable>
  );
}

type SimilarState = { state: 'off' } | { state: 'loading' } | { state: 'done'; items: ApiProduct[] };

/**
 * Products like this one that fit the profile. The server returns candidates; the fit is checked
 * here, with the same verdict logic, because the profile never leaves the phone. Hidden entirely
 * when there's no profile to check against or the server can't be reached.
 */
function useSimilar(
  product: ApiProduct | null,
  restrictions: Parameters<typeof computeVerdict>[1],
  overrides: Parameters<typeof computeVerdict>[2],
): SimilarState & { items: ApiProduct[] } {
  const [result, setResult] = useState<{ id: number; products: ApiProduct[] | 'error' } | null>(null);
  const id = product?.id ?? null;
  const hasProfile = Object.keys(restrictions).length > 0;
  useEffect(() => {
    if (id === null || !hasProfile) return;
    let live = true;
    api
      .similar(id)
      .then((r) => live && setResult({ id, products: r.products }))
      .catch(() => live && setResult({ id, products: 'error' }));
    return () => {
      live = false;
    };
  }, [id, hasProfile]);
  // Results for an earlier product don't count: still loading for this one.
  const candidates = result && result.id === id ? result.products : null;
  const items = useMemo(() => {
    if (!Array.isArray(candidates)) return [];
    return candidates
      .filter((p) => {
        const v = computeVerdict(p, restrictions, overrides);
        return v.state === 'no_conflicts' && !v.reason && v.matchedTerms > 0;
      })
      .slice(0, SIMILAR_SHOWN);
  }, [candidates, restrictions, overrides]);
  if (id === null || !hasProfile || candidates === 'error') return { state: 'off', items: [] };
  if (candidates === null) return { state: 'loading', items: [] };
  return { state: 'done', items };
}

/** Underline flagged ingredients in their rating's color, found by the same matcher that produced the verdict. */
function highlight(text: string, flags: Flag[], ratingByTerm: Map<string, Rating>) {
  if (!flags.length) return text;
  return highlightParts(text, flags).map((part, i) =>
    part.hit ? (
      <Text
        key={i}
        style={{ color: HIT_COLOR[ratingByTerm.get(part.term ?? '') ?? 'red'], fontWeight: '700', textDecorationLine: 'underline' }}
      >
        {part.text}
      </Text>
    ) : (
      part.text
    ),
  );
}

function ReactionSheet({ product, onClose }: { product: ApiProduct | null; onClose: () => void }) {
  const [text, setText] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');

  const close = () => {
    onClose();
    setTimeout(() => {
      setText('');
      setState('idle');
      setError('');
    }, 300);
  };

  return (
    <BottomSheet visible={!!product} onClose={close} handle>
      <View style={{ paddingHorizontal: 16, gap: 12 }}>
        {state === 'sent' ? (
          <>
            <Text style={styles.sheetTitle}>Thanks for telling us</Text>
            <Text style={styles.sheetBody}>
              We read every report. If your reaction was serious or is getting worse, contact a doctor or emergency services.
            </Text>
            <Button title="Done" onPress={close} />
          </>
        ) : (
          <>
            <Text style={styles.sheetTitle}>Report a reaction</Text>
            <Text style={styles.sheetBody}>What happened after you had {product?.name ?? 'this product'}?</Text>
            <TextInput
              value={text}
              onChangeText={(t) => {
                setText(t);
                if (error) setError('');
              }}
              placeholder="Bloating about an hour after eating it"
              accessibilityLabel="What happened"
              placeholderTextColor={colors.textSubtle}
              style={[styles.input, { minHeight: 96 }, noOutline]}
              multiline
              maxLength={1500}
            />
            {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
            <Button
              title="Send"
              loading={state === 'sending'}
              onPress={async () => {
                if (!product) return;
                if (text.trim().length < 3) {
                  setError('Tell us a little about what happened first.');
                  return;
                }
                setState('sending');
                try {
                  await api.feedback('Reaction', `${product.name} (barcode ${product.gtin14}): ${text.trim()}`);
                  haptic.success();
                  setState('sent');
                } catch (e) {
                  setError(e instanceof ApiError ? e.message : 'Could not send this. Please try again.');
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
            <Text style={styles.sheetBody}>We’ll review this product. Until then, it’s marked as under review for everyone.</Text>
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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'transparent',
  },
  topBarScrolled: { borderBottomColor: colors.border },
  topTitle: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.ink },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  hero: { alignItems: 'center', paddingTop: 4 },
  heroImage: { width: '100%', height: 200 },
  heroEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted, borderRadius: radius.lg },
  name: { fontSize: 26, lineHeight: 32, fontWeight: '600', color: colors.ink, marginTop: 12, letterSpacing: -0.3 },
  meta: { fontSize: 14, color: colors.textMuted, marginTop: 4 },
  fit: { fontSize: 18, color: colors.textMuted, marginTop: 6 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 14 },
  band: { height: 10, backgroundColor: colors.surfaceMuted, marginHorizontal: -20, marginVertical: 22 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  actionText: { flex: 1, fontSize: 16, fontWeight: '500', color: colors.ink },
  triedSmall: { fontSize: 15, color: colors.textMuted },
  triedBig: { fontSize: 17, fontWeight: '500', color: colors.ink, marginTop: 2 },
  thumb: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbOn: { backgroundColor: colors.lime },
  h2: { fontSize: 24, fontWeight: '600', color: colors.ink, letterSpacing: -0.3 },
  h3: { fontSize: 19, fontWeight: '600', color: colors.ink },
  overviewEmpty: { fontSize: 15, lineHeight: 22, color: colors.textMuted, marginTop: 8 },
  row: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, overflow: 'hidden' },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  rowName: { flex: 1, fontSize: 17, fontWeight: '500', color: colors.ink },
  rowBody: { paddingHorizontal: 16, paddingBottom: 16, marginTop: -4, gap: 6 },
  rowText: { fontSize: 15, lineHeight: 21, color: colors.text },
  rowLabel: { fontWeight: '600' },
  rowAbout: { fontSize: 13, lineHeight: 18, color: colors.textMuted, marginTop: 2 },
  showMore: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginTop: 14 },
  showMoreText: { fontSize: 16, fontWeight: '500', color: colors.ink, textDecorationLine: 'underline' },
  warning: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    backgroundColor: '#FFF6E0',
    borderRadius: radius.md,
    padding: 10,
    marginTop: 16,
  },
  warningText: { fontSize: 13, lineHeight: 18, color: '#5C3D00', flex: 1, fontWeight: '500' },
  ingredients: { fontSize: 16, lineHeight: 26, color: colors.text, marginTop: 10 },
  missing: { fontSize: 15, color: colors.textMuted, marginTop: 10, fontStyle: 'italic' },
  provenance: { marginTop: 16, gap: 6 },
  provText: { fontSize: 12, color: colors.textMuted },
  link: { textDecorationLine: 'underline' },
  badge: { alignSelf: 'flex-start', backgroundColor: '#FFE8CC', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 12, fontWeight: '700', color: '#8A4B00' },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 4 },
  linkTitle: { fontSize: 16, fontWeight: '600', color: colors.ink },
  linkBody: { fontSize: 14, lineHeight: 20, color: colors.textMuted, marginTop: 2 },
  linkChevron: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  similarSub: { fontSize: 14, color: colors.textMuted, marginTop: 4 },
  card: { width: 150 },
  cardImageWrap: {
    width: 150,
    height: 150,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  cardImage: { width: '86%', height: '86%' },
  cardBadge: { position: 'absolute', left: 8, bottom: 8 },
  cardName: { fontSize: 15, fontWeight: '500', color: colors.ink, marginTop: 8 },
  cardBrand: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  sheetTitle: { fontSize: 20, fontWeight: '600', color: colors.ink, marginTop: 6 },
  sheetBody: { fontSize: 14, lineHeight: 20, color: colors.text },
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
