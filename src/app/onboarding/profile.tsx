import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { BottomSheet } from '../../components/BottomSheet';
import { FeedbackSheet } from '../../components/FeedbackSheet';
import { RestrictionSheet } from '../../components/RestrictionSheet';
import { Button, CloseButton, Footer, InfoButton, OnboardingHeader, RatingIcon, Screen, TextLink, ratingLabel } from '../../components/ui';
import { INGREDIENTS } from '../../data/ingredients';
import { LEVEL_LABEL, RESTRICTIONS, type Level, type Restriction } from '../../data/restrictions';
import { progressFor } from '../../lib/flow';
import { haptic } from '../../lib/haptics';
import { explain, rateAll } from '../../lib/ratings';
import { useStore, type Rating } from '../../lib/store';
import { colors, radius, noOutline } from '../../theme';

type Tab = 'profile' | 'lookup';
type Filter = 'all' | Rating | 'manual';
const FILTER_LABEL: Record<Filter, string> = { all: 'Filter', green: 'Can eat', yellow: 'Limit this', red: 'Avoid', manual: 'Changed' };

export default function Profile() {
  const editing = useLocalSearchParams<{ edit?: string }>().edit === '1';
  const [tab, setTab] = useState<Tab>('profile');
  const [missing, setMissing] = useState(false);
  const seenIntro = useStore((s) => s.seenIngredientIntro);
  const [intro, setIntro] = useState(false);

  const switchTab = (t: Tab) => {
    haptic.select();
    setTab(t);
    if (t === 'lookup' && !useStore.getState().seenIngredientIntro) setIntro(true);
  };

  return (
    <Screen>
      <OnboardingHeader progress={editing ? undefined : progressFor('profile')} />
      <View style={styles.head}>
        <Text style={styles.title}>{editing ? 'Your dietary profile' : 'Your Tappy looks great'}</Text>
        <Text style={styles.subtitle}>
          {editing
            ? 'Changes save automatically and update every rating in Tappy.'
            : "We've personalized your Tappy based on your selections. You can adjust this anytime!"}
        </Text>
      </View>
      <Tabs tab={tab} onChange={switchTab} />
      <View style={{ flex: 1, backgroundColor: tab === 'lookup' ? '#FAFAFB' : '#fff' }}>
        {tab === 'profile' ? <ProfileTab editing={editing} onReview={() => switchTab('lookup')} /> : <LookupTab />}
      </View>
      <Footer>
        <Button
          testID="show-me"
          title={editing ? 'Done' : 'Show me what I can eat'}
          onPress={() => (editing ? router.back() : router.push('/onboarding/finishing'))}
        />
        {tab === 'lookup' ? (
          <TextLink title="Don't see an ingredient?" onPress={() => setMissing(true)} style={{ textAlign: 'center' }} />
        ) : null}
      </Footer>

      <FeedbackSheet
        visible={missing}
        onClose={() => setMissing(false)}
        header="Don't see an ingredient?"
        title="What are we missing?"
        body="While we have over 2,900 options of ingredients you can restrict or limit, we don't have everything. What else would you like to see on Tappy?"
      />

      <BottomSheet
        visible={intro && !seenIntro}
        onClose={() => {
          setIntro(false);
          useStore.getState().set({ seenIngredientIntro: true });
        }}
        handle
      >
        <View style={styles.introSheet}>
          <View style={styles.introHead}>
            <View style={{ width: 26 }} />
            <Text style={styles.introTitle}>Ingredient lookup</Text>
            <CloseButton
              onPress={() => {
                setIntro(false);
                useStore.getState().set({ seenIngredientIntro: true });
              }}
            />
          </View>
          <Text style={styles.introBody}>
            Tappy has automatically rated ingredients as Green, Yellow, or Red based on your selected diets. You can review or fine-tune
            specific ingredients as needed.
          </Text>
          <View style={styles.legend}>
            {(['green', 'yellow', 'red'] as Rating[]).map((r) => (
              <View key={r} style={{ alignItems: 'center', gap: 10 }}>
                <RatingIcon rating={r} size={52} />
                <Text style={styles.legendText}>{ratingLabel[r]}</Text>
              </View>
            ))}
          </View>
          <Button
            testID="review-ingredients"
            title="Review ingredients"
            onPress={() => {
              setIntro(false);
              useStore.getState().set({ seenIngredientIntro: true });
            }}
          />
          <TextLink
            title="Return to dietary profile"
            style={{ textAlign: 'center', marginTop: 4 }}
            onPress={() => {
              setIntro(false);
              useStore.getState().set({ seenIngredientIntro: true });
              setTab('profile');
            }}
          />
        </View>
      </BottomSheet>
    </Screen>
  );
}

function Tabs({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  const [w, setW] = useState(0);
  const x = useSharedValue(0);
  useEffect(() => {
    x.set(withTiming(tab === 'profile' ? 0 : w / 2, { duration: 220 }));
  }, [tab, w, x]);
  const ind = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return (
    <View style={styles.tabs} onLayout={(e) => setW(e.nativeEvent.layout.width - 32)}>
      <View style={{ flexDirection: 'row' }}>
        {(['profile', 'lookup'] as Tab[]).map((t) => (
          <Pressable
            key={t}
            testID={`tab-${t}`}
            accessibilityRole="tab"
            accessibilityLabel={t === 'profile' ? 'Dietary Profile' : 'Ingredient Lookup'}
            accessibilityState={{ selected: tab === t }}
            style={styles.tab}
            onPress={() => onChange(t)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'profile' ? 'Dietary Profile' : 'Ingredient Lookup'}
            </Text>
          </Pressable>
        ))}
      </View>
      <Animated.View style={[styles.indicator, { width: w / 2 }, ind]} />
    </View>
  );
}

// ---------------- Dietary profile ----------------
function ProfileTab({ onReview, editing }: { onReview: () => void; editing: boolean }) {
  const restrictions = useStore((s) => s.restrictions);
  const setRestriction = useStore((s) => s.setRestriction);
  const [about, setAbout] = useState<Restriction | null>(null);
  const [feedbackFor, setFeedbackFor] = useState<Restriction | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const selected = RESTRICTIONS.filter((r) => restrictions[r.id]);
  const groups: { level: Level; title: string }[] = [
    { level: 'severe', title: 'Severe' },
    { level: 'intolerance', title: 'Intolerances' },
    { level: 'preference', title: 'Preferences' },
  ];

  return (
    <>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        <Pressable
          testID="review-banner"
          accessibilityRole="button"
          accessibilityLabel="Review individual ingredient ratings"
          onPress={onReview}
          style={styles.banner}
        >
          <Text style={styles.bannerText}>Review individual ingredient ratings</Text>
          <Feather name="arrow-right" size={22} color={colors.purple} />
        </Pressable>

        {selected.length === 0 ? (
          <View style={styles.emptyProfile}>
            <Text style={styles.emptyTitle}>No restrictions yet</Text>
            <Text style={styles.emptyBody}>Add diets, allergies, or conditions so Tappy can rate ingredients for you.</Text>
          </View>
        ) : null}

        {groups.map((g) => {
          const items = selected.filter((r) => (restrictions[r.id].level ?? 'intolerance') === g.level);
          if (!items.length) return null;
          return (
            <View key={g.level} style={{ marginTop: 28 }}>
              <Text style={styles.groupTitle}>{g.title}</Text>
              <View style={{ gap: 12, marginTop: 14 }}>
                {items.map((r) => {
                  const sel = restrictions[r.id];
                  const subs = (r.items ?? []).filter((i) => sel.items?.includes(i.id));
                  const open = !!expanded[r.id];
                  return (
                    <Animated.View key={r.id} entering={FadeIn} style={styles.card}>
                      <View style={styles.cardRow}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={r.name}
                          accessibilityHint="Edit this restriction"
                          style={styles.cardMain}
                          onPress={() => (r.kind === 'toggle' ? setAbout(r) : setEditId(r.id))}
                        >
                          <Text style={styles.cardText}>{r.name}</Text>
                        </Pressable>
                        {subs.length ? (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={open ? `Hide ${r.name} details` : `Show ${r.name} details`}
                            hitSlop={12}
                            onPress={() => setExpanded((e) => ({ ...e, [r.id]: !open }))}
                          >
                            <Feather name={open ? 'chevron-up' : 'chevron-down'} size={20} color={colors.ink} />
                          </Pressable>
                        ) : null}
                        <InfoButton onPress={() => setAbout(r)} />
                      </View>
                      {open ? (
                        <View style={styles.subList}>
                          {subs.map((s) => (
                            <Text key={s.id} style={styles.subItem}>
                              • {s.label}
                            </Text>
                          ))}
                        </View>
                      ) : null}
                    </Animated.View>
                  );
                })}
              </View>
            </View>
          );
        })}

        <Pressable
          testID="add-restrictions"
          accessibilityRole="button"
          accessibilityLabel={selected.length ? 'Add or edit restrictions' : 'Add restrictions'}
          style={styles.addBtn}
          onPress={() => router.push({ pathname: '/onboarding/restrictions', params: { edit: '1' } })}
        >
          <Feather name="plus" size={18} color={colors.purple} />
          <Text style={styles.addText}>{selected.length ? 'Add or edit restrictions' : 'Add restrictions'}</Text>
        </Pressable>
      </ScrollView>

      <BottomSheet visible={!!about} onClose={() => setAbout(null)} handle>
        {about ? (
          <View style={styles.aboutSheet}>
            <View style={styles.introHead}>
              <View style={{ width: 26 }} />
              <Text style={styles.introTitle}>{about.section === 'allergens' ? 'About the avoidance' : 'About the diet'}</Text>
              <CloseButton onPress={() => setAbout(null)} />
            </View>
            <Text style={styles.aboutName}>{about.name}</Text>
            <Text style={styles.aboutBody}>{about.about}</Text>
            {restrictions[about.id]?.level ? (
              <Text style={styles.aboutMeta}>Your setting: {LEVEL_LABEL[restrictions[about.id].level as Level]}</Text>
            ) : null}
            <TextLink
              title={about.section === 'allergens' ? 'Feedback on this restriction?' : 'Feedback on this diet?'}
              style={{ textAlign: 'center', marginTop: 32 }}
              onPress={() => {
                const r = about;
                setAbout(null);
                setTimeout(() => setFeedbackFor(r), 280);
              }}
            />
          </View>
        ) : null}
      </BottomSheet>

      <FeedbackSheet
        visible={!!feedbackFor}
        onClose={() => setFeedbackFor(null)}
        header="Feedback"
        title={`Feedback on ${feedbackFor?.name ?? ''}`}
        body="Is something missing or wrong with this restriction? Tell us and our nutrition team will review it."
        placeholder="Share your feedback"
      />

      <RestrictionSheet
        restrictionId={editId}
        current={editId ? restrictions[editId] : undefined}
        onClose={() => setEditId(null)}
        onSave={(id, sel) => {
          setRestriction(id, sel);
          setEditId(null);
        }}
      />
    </>
  );
}

// ---------------- Ingredient lookup ----------------
function LookupTab() {
  const restrictions = useStore((s) => s.restrictions);
  const overrides = useStore((s) => s.ingredientOverrides);
  const setOverride = useStore((s) => s.setOverride);
  const resetOverrides = useStore((s) => s.resetOverrides);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const rated = useMemo(() => rateAll(restrictions, overrides), [restrictions, overrides]);
  const base = useMemo(() => rateAll(restrictions, {}), [restrictions]);
  const q = query.trim().toLowerCase();
  const list = rated.filter(
    (i) =>
      (!q || i.name.toLowerCase().includes(q)) && (filter === 'all' || (filter === 'manual' ? !!overrides[i.id] : i.rating === filter)),
  );
  const hasOverrides = Object.keys(overrides).length > 0;
  const detail = detailId ? rated.find((i) => i.id === detailId) : undefined;
  const detailBase = detailId ? base.find((i) => i.id === detailId) : undefined;

  const cycle = (id: string, current: Rating) => {
    haptic.select();
    const next: Rating = current === 'green' ? 'yellow' : current === 'yellow' ? 'red' : 'green';
    const orig = base.find((i) => i.id === id)?.rating;
    setOverride(id, next === orig ? null : next);
  };

  return (
    <>
      <View style={styles.lookupBar}>
        <View style={styles.lookupSearch}>
          <Feather name="search" size={20} color={colors.ink} />
          <TextInput
            testID="ingredient-search"
            accessibilityLabel="Search ingredients"
            value={query}
            onChangeText={setQuery}
            placeholder="Search ingredients"
            placeholderTextColor={colors.textSubtle}
            style={[{ flex: 1, fontSize: 16, color: colors.ink, height: '100%' }, noOutline]}
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
        </View>
        <Pressable
          testID="filter"
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={`Filter: ${FILTER_LABEL[filter]}`}
          style={[styles.filterBtn, filter !== 'all' && styles.filterBtnActive]}
          onPress={() => setFilterOpen(true)}
        >
          <Text style={[styles.filterText, filter !== 'all' && { color: colors.purple }]}>{FILTER_LABEL[filter]}</Text>
          <Feather name="chevron-down" size={16} color={filter !== 'all' ? colors.purple : colors.ink} />
        </Pressable>
      </View>
      <View style={styles.countRow}>
        <Text style={styles.count}>
          Showing {list.length.toLocaleString()} result{list.length === 1 ? '' : 's'}
        </Text>
        <TextLink
          title="Reset manual changes"
          muted={!hasOverrides}
          onPress={() => {
            if (!hasOverrides) return;
            haptic.warning();
            resetOverrides();
          }}
          style={{ fontSize: 15 }}
        />
      </View>
      <FlatList
        data={list}
        keyExtractor={(i) => i.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap: 10 }}
        initialNumToRender={14}
        ListEmptyComponent={
          <View style={styles.emptyProfile}>
            <Text style={styles.emptyTitle}>No ingredients found</Text>
            <Text style={styles.emptyBody}>Try a different search or filter.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.ingRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.name}: ${ratingLabel[item.rating]}. Tap to change.`}
              hitSlop={8}
              onPress={() => cycle(item.id, item.rating)}
            >
              <RatingIcon rating={item.rating} />
            </Pressable>
            <Pressable
              style={{ flex: 1, alignSelf: 'stretch', justifyContent: 'center' }}
              accessibilityRole="button"
              accessibilityLabel={`${item.name} details`}
              onPress={() => setDetailId(item.id)}
            >
              <Text style={styles.ingName}>{item.name}</Text>
              {overrides[item.id] ? <Text style={styles.ingChanged}>Changed by you</Text> : null}
            </Pressable>
            <InfoButton color="#666" size={24} onPress={() => setDetailId(item.id)} />
          </View>
        )}
      />

      <BottomSheet visible={filterOpen} onClose={() => setFilterOpen(false)} handle>
        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          <Text style={[styles.introTitle, { textAlign: 'left', marginBottom: 8 }]}>Filter ingredients</Text>
          {(['all', 'green', 'yellow', 'red', 'manual'] as Filter[]).map((f) => (
            <Pressable
              key={f}
              accessibilityRole="radio"
              accessibilityLabel={f === 'all' ? 'All ingredients' : f === 'manual' ? 'Changed by me' : ratingLabel[f]}
              accessibilityState={{ selected: filter === f }}
              style={styles.filterRow}
              onPress={() => {
                haptic.select();
                setFilter(f);
                setFilterOpen(false);
              }}
            >
              {f === 'all' || f === 'manual' ? (
                <Feather name={f === 'all' ? 'list' : 'edit-3'} size={22} color={colors.ink} style={{ width: 26 }} />
              ) : (
                <RatingIcon rating={f} />
              )}
              <Text style={styles.filterRowText}>
                {f === 'all' ? 'All ingredients' : f === 'manual' ? 'Changed by me' : ratingLabel[f]}
              </Text>
              {filter === f ? <Feather name="check" size={20} color={colors.purple} /> : null}
            </Pressable>
          ))}
        </View>
      </BottomSheet>

      <BottomSheet visible={!!detail} onClose={() => setDetailId(null)} handle>
        {detail ? (
          <View style={styles.aboutSheet}>
            <View style={styles.introHead}>
              <View style={{ width: 26 }} />
              <Text style={styles.introTitle}>Ingredient</Text>
              <CloseButton onPress={() => setDetailId(null)} />
            </View>
            <Text style={styles.aboutName}>{detail.name}</Text>
            {(() => {
              const reasons = explain(INGREDIENTS.find((i) => i.id === detail.id)!, restrictions);
              return (
                <Text style={styles.aboutBody}>
                  {reasons.length
                    ? `Flagged by: ${reasons.map((r) => r.name).join(', ')}.`
                    : "This ingredient doesn't conflict with any of your selections."}
                </Text>
              );
            })()}
            <Text style={[styles.groupTitle, { fontSize: 16, marginTop: 22 }]}>Your rating</Text>
            <View style={styles.segment}>
              {(['green', 'yellow', 'red'] as Rating[]).map((r) => (
                <Pressable
                  key={r}
                  accessibilityRole="radio"
                  accessibilityLabel={ratingLabel[r]}
                  accessibilityState={{ selected: detail.rating === r }}
                  style={[styles.segBtn, detail.rating === r && styles.segBtnActive]}
                  onPress={() => {
                    haptic.select();
                    setOverride(detail.id, r === detailBase?.rating ? null : r);
                  }}
                >
                  <RatingIcon rating={r} size={30} />
                  <Text style={styles.segText}>{ratingLabel[r]}</Text>
                </Pressable>
              ))}
            </View>
            {overrides[detail.id] ? (
              <TextLink
                title="Reset to Tappy's rating"
                style={{ textAlign: 'center', marginTop: 18 }}
                onPress={() => setOverride(detail.id, null)}
              />
            ) : null}
          </View>
        ) : null}
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: 16, paddingTop: 12 },
  title: { fontSize: 30, lineHeight: 36, fontWeight: '600', color: colors.ink, letterSpacing: -0.5 },
  subtitle: { fontSize: 16, lineHeight: 23, color: colors.text, marginTop: 8 },
  tabs: { marginTop: 14, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  tabText: { fontSize: 15, color: colors.textMuted, fontWeight: '500' },
  tabTextActive: { color: colors.ink },
  indicator: { height: 3, backgroundColor: colors.ink, borderRadius: 2 },
  banner: {
    backgroundColor: colors.purpleSoft,
    borderRadius: radius.lg,
    paddingHorizontal: 18,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bannerText: { color: colors.purple, fontSize: 16, fontWeight: '600', flex: 1 },
  groupTitle: { fontSize: 22, fontWeight: '600', color: colors.ink },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: '#fff' },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingRight: 18 },
  cardMain: { flex: 1, paddingVertical: 19, paddingLeft: 18 },
  cardText: { flex: 1, fontSize: 16, color: colors.ink },
  subList: { paddingHorizontal: 18, paddingBottom: 14, gap: 6, marginTop: -4 },
  subItem: { fontSize: 14, color: colors.textMuted },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center', marginTop: 24, paddingVertical: 12 },
  addText: { color: colors.purple, fontSize: 16, fontWeight: '600' },
  emptyProfile: { alignItems: 'center', paddingVertical: 32, paddingHorizontal: 16 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: colors.ink },
  emptyBody: { fontSize: 15, color: colors.textMuted, textAlign: 'center', marginTop: 6, lineHeight: 21 },
  introSheet: { paddingHorizontal: 16, paddingTop: 4, gap: 18 },
  introHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  introTitle: { fontSize: 20, fontWeight: '600', color: colors.ink, textAlign: 'center' },
  introBody: { fontSize: 16, lineHeight: 24, color: colors.text },
  legend: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#F8F8F9',
    borderRadius: radius.xl,
    paddingVertical: 24,
  },
  legendText: { fontSize: 16, fontWeight: '500', color: colors.ink },
  aboutSheet: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12 },
  aboutName: { fontSize: 22, fontWeight: '600', color: colors.ink, marginTop: 22 },
  aboutBody: { fontSize: 16, lineHeight: 24, color: colors.text, marginTop: 14 },
  aboutMeta: { fontSize: 14, color: colors.textMuted, marginTop: 10 },
  lookupBar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 16 },
  lookupSearch: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    height: 50,
    paddingHorizontal: 14,
    backgroundColor: '#fff',
  },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 42,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  filterBtnActive: { borderColor: colors.purple, backgroundColor: colors.purpleSoft },
  filterText: { fontSize: 15, color: colors.ink, fontWeight: '500' },
  countRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  count: { fontSize: 15, color: colors.textMuted },
  ingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: '#fff',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingHorizontal: 16,
    minHeight: 62,
  },
  ingName: { fontSize: 16, color: colors.ink },
  ingChanged: { fontSize: 12, color: colors.purple, marginTop: 2 },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 54 },
  filterRowText: { flex: 1, fontSize: 17, color: colors.ink },
  segment: { flexDirection: 'row', gap: 10, marginTop: 12 },
  segBtn: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segBtnActive: { borderColor: colors.purple, borderWidth: 2, backgroundColor: colors.purpleSoft },
  segText: { fontSize: 14, fontWeight: '500', color: colors.ink },
});
