import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { RestrictionSheet } from '../../components/RestrictionSheet';
import { Button, Chip, Footer, OnboardingHeader, Screen } from '../../components/ui';
import { INGREDIENT_COUNT_LABEL } from '../../data/ingredients';
import { RESTRICTIONS, SECTION_TITLES, type Restriction, type Section } from '../../data/restrictions';
import { goNext, progressFor } from '../../lib/flow';
import { haptic } from '../../lib/haptics';
import { useStore } from '../../lib/store';
import { colors, radius, noOutline } from '../../theme';

const SECTIONS: Section[] = ['diets', 'allergens', 'conditions'];

export default function Restrictions() {
  const restrictions = useStore((s) => s.restrictions);
  const setRestriction = useStore((s) => s.setRestriction);
  const editing = useLocalSearchParams<{ edit?: string }>().edit === '1';
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => (q ? RESTRICTIONS.filter((r) => r.name.toLowerCase().includes(q)) : RESTRICTIONS), [q]);
  const selected = RESTRICTIONS.filter((r) => restrictions[r.id]);

  const onChipPress = (r: Restriction) => {
    if (r.kind === 'toggle') {
      haptic.select();
      setRestriction(r.id, restrictions[r.id] ? null : { level: 'intolerance' });
      return;
    }
    setOpenId(r.id);
  };

  return (
    <Screen>
      <OnboardingHeader progress={editing ? undefined : progressFor('restrictions')} />
      <ScrollView
        stickyHeaderIndices={[1]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        <View style={styles.intro}>
          <Text style={styles.title}>What are your dietary restrictions?</Text>
          <Text style={styles.subtitle}>Don't see your restrictions here? No worries. You can pick from {INGREDIENT_COUNT_LABEL} ingredients later!</Text>
        </View>

        <View style={styles.searchWrap}>
          <View style={styles.search}>
            <Feather name="search" size={20} color={colors.ink} />
            <TextInput
              testID="restriction-search"
              accessibilityLabel="Search for a diet, allergy, or condition"
              value={query}
              onChangeText={setQuery}
              placeholder="Search for a diet, allergy, or condition"
              placeholderTextColor={colors.textSubtle}
              style={[styles.searchInput, noOutline]}
              returnKeyType="search"
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
            {query ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={14} onPress={() => setQuery('')}>
                <Feather name="x-circle" size={18} color={colors.textSubtle} />
              </Pressable>
            ) : null}
          </View>
        </View>

        <View>
          {selected.length > 0 && !q ? (
            <Animated.View entering={FadeIn}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selectedRow}>
                {selected.map((r) => (
                  <Chip key={r.id} label={r.name} selected chevron={r.kind !== 'toggle'} onPress={() => onChipPress(r)} />
                ))}
              </ScrollView>
            </Animated.View>
          ) : null}

          {SECTIONS.map((sec) => {
            const items = filtered.filter((r) => r.section === sec);
            if (!items.length) return null;
            return (
              <View key={sec} style={styles.section}>
                <Text style={styles.sectionTitle}>{SECTION_TITLES[sec]}</Text>
                <Animated.View layout={LinearTransition} style={styles.chips}>
                  {items.map((r) => (
                    <Chip
                      key={r.id}
                      testID={`chip-${r.id}`}
                      label={r.name}
                      chevron={r.kind !== 'toggle'}
                      selected={r.kind === 'toggle' && !!restrictions[r.id]}
                      dimmed={r.kind !== 'toggle' && !!restrictions[r.id]}
                      onPress={() => onChipPress(r)}
                    />
                  ))}
                </Animated.View>
              </View>
            );
          })}

          {filtered.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No matches for "{query}"</Text>
              <Text style={styles.emptyBody}>You'll be able to pick from {INGREDIENT_COUNT_LABEL} individual ingredients on the next screen.</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <Footer>
        <Button
          testID="continue"
          title={editing ? 'Done' : 'Continue to More Options'}
          onPress={() => (editing ? router.back() : goNext('restrictions'))}
        />
      </Footer>

      <RestrictionSheet
        restrictionId={openId}
        current={openId ? restrictions[openId] : undefined}
        onClose={() => setOpenId(null)}
        onSave={(id, sel) => {
          setRestriction(id, sel);
          setOpenId(null);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { paddingHorizontal: 16, paddingTop: 12 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '600', color: colors.ink, letterSpacing: -0.4 },
  subtitle: { fontSize: 15, lineHeight: 22, color: colors.text, marginTop: 10 },
  searchWrap: {
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  search: {
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
  searchInput: { flex: 1, fontSize: 16, color: colors.ink, height: '100%' },
  selectedRow: { paddingHorizontal: 16, paddingTop: 16, gap: 10 },
  section: { paddingHorizontal: 16, marginTop: 26 },
  sectionTitle: { fontSize: 19, fontWeight: '600', color: colors.ink, marginBottom: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  empty: { padding: 24, alignItems: 'center' },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: colors.ink, textAlign: 'center' },
  emptyBody: { fontSize: 15, color: colors.textMuted, textAlign: 'center', marginTop: 6, lineHeight: 21 },
});
