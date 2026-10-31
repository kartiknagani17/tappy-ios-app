import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RESTRICTION_BY_ID, levelOptions, type Level, type Restriction, type Selection } from '../data/restrictions';
import { haptic } from '../lib/haptics';
import { colors, radius } from '../theme';
import { BottomSheet } from './BottomSheet';
import { Button, Checkbox, CloseButton, InfoButton, Radio } from './ui';

type Props = {
  restrictionId: string | null;
  current?: Selection;
  onClose: () => void;
  onSave: (id: string, sel: Selection | null) => void;
};

const CROSS_CONTACT =
  'Cross-contact happens when an allergen is unintentionally transferred to another food, for example from shared equipment or a "may contain" facility.';

export function RestrictionSheet({ restrictionId, current, onClose, onSave }: Props) {
  const r = restrictionId ? RESTRICTION_BY_ID[restrictionId] : undefined;
  return (
    <BottomSheet visible={!!r} onClose={onClose} maxHeight={0.88}>
      {/* Keyed so local state resets for each restriction opened. */}
      {r ? <SheetBody key={r.id} r={r} current={current} onClose={onClose} onSave={onSave} /> : null}
    </BottomSheet>
  );
}

function SheetBody({ r, current, onClose, onSave }: { r: Restriction } & Omit<Props, 'restrictionId'>) {
  const [step, setStep] = useState<'pick' | 'severity'>(r.kind === 'severity' ? 'severity' : 'pick');
  const [level, setLevel] = useState<Level | undefined>(current?.level);
  const [items, setItems] = useState<string[]>(current?.items ?? []);
  const [showAbout, setShowAbout] = useState(false);
  const [showSeverityHelp, setShowSeverityHelp] = useState(false);
  const [showCross, setShowCross] = useState(false);
  const [openInfo, setOpenInfo] = useState<string | null>(null);
  const isSelected = !!current;

  return (
    <>
      <View style={{ flexShrink: 1 }}>
        <View style={styles.topRow}>
          <CloseButton onPress={onClose} size={30} />
          {isSelected ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove ${r.name}`}
              hitSlop={6}
              onPress={() => {
                haptic.warning();
                onSave(r.id, null);
              }}
              style={styles.remove}
            >
              <Text style={styles.removeText}>Remove selection</Text>
            </Pressable>
          ) : null}
        </View>

        <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={styles.body} bounces={false}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{r.name}</Text>
            <InfoButton onPress={() => setShowAbout((v) => !v)} />
          </View>
          {showAbout ? <Text style={styles.help}>{r.about}</Text> : null}

          {step === 'pick' ? (
            <PickStep r={r} items={items} setItems={setItems} openInfo={openInfo} setOpenInfo={setOpenInfo} />
          ) : (
            <>
              <View style={[styles.row, { marginTop: 20, marginBottom: 14 }]}>
                <Text style={styles.question}>How severe is this restriction?</Text>
                <InfoButton size={19} onPress={() => setShowSeverityHelp((v) => !v)} />
              </View>
              {showSeverityHelp ? (
                <Text style={[styles.help, { marginTop: -4, marginBottom: 12 }]}>
                  Tapi uses severity to rate ingredients. Severe and Intolerance mark matching ingredients as Avoid. Preference marks them
                  as Limit this.
                </Text>
              ) : null}
              <View style={styles.levelBox}>
                {severityOptions(r).map((o, idx) => (
                  <Pressable
                    key={o.level}
                    accessibilityRole="radio"
                    accessibilityLabel={`${o.title}. ${o.body}${o.linkCrossContact ? (o.linkCrossContact === 'notOk' ? 'cross-contact is not ok.' : 'cross-contact is ok.') : ''}`}
                    accessibilityState={{ selected: level === o.level }}
                    onPress={() => {
                      haptic.select();
                      setLevel(o.level);
                    }}
                    style={[styles.levelRow, idx > 0 && styles.levelDivider, level === o.level && styles.levelRowActive]}
                  >
                    <Radio checked={level === o.level} />
                    <View style={{ flex: 1, marginLeft: 16 }}>
                      <Text style={styles.levelTitle}>{o.title}</Text>
                      <Text style={styles.levelBody}>
                        {o.body}
                        {o.linkCrossContact ? (
                          <>
                            <Text style={styles.crossLink} onPress={() => setShowCross((v) => !v)}>
                              cross-contact
                            </Text>
                            {o.linkCrossContact === 'notOk' ? ' is not ok.' : ' is ok.'}
                          </>
                        ) : null}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </View>
              {showCross ? <Text style={[styles.help, { marginTop: 12 }]}>{CROSS_CONTACT}</Text> : null}
            </>
          )}
        </ScrollView>

        <View style={styles.footer}>
          {step === 'pick' ? (
            <Button title="Next" disabled={items.length === 0} onPress={() => setStep('severity')} />
          ) : (
            <Button
              title="Save selection"
              disabled={!level}
              onPress={() => {
                haptic.success();
                onSave(r.id, r.kind === 'severity' ? { level } : { level, items });
              }}
            />
          )}
        </View>
      </View>
    </>
  );
}

function severityOptions(r: Restriction) {
  if (r.kind === 'severity') return levelOptions(r);
  // After picking items from a checklist / radio, ask severity for the group.
  return levelOptions({
    ...r,
    kind: 'severity',
    voice: 'avoid',
    crossContact: r.section !== 'diets' || r.id === 'alpha-gal',
    phrase: 'these',
  });
}

function PickStep({
  r,
  items,
  setItems,
  openInfo,
  setOpenInfo,
}: {
  r: Restriction;
  items: string[];
  setItems: (v: string[]) => void;
  openInfo: string | null;
  setOpenInfo: (v: string | null) => void;
}) {
  const all = r.items ?? [];
  const allSelected = all.length > 0 && items.length === all.length;
  const toggle = (id: string) => {
    haptic.select();
    if (r.kind === 'radio') setItems([id]);
    else setItems(items.includes(id) ? items.filter((x) => x !== id) : [...items, id]);
  };
  return (
    <>
      <Text style={[styles.question, { marginTop: 20 }]}>Which of these do you avoid?</Text>
      {r.hint ? <Text style={styles.hint}>{r.hint}</Text> : null}
      <View style={{ marginTop: 12 }}>
        {r.kind === 'checklist' ? (
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: allSelected }}
            onPress={() => {
              haptic.select();
              setItems(allSelected ? [] : all.map((i) => i.id));
            }}
            style={[styles.itemRow, styles.itemDivider]}
          >
            <Checkbox checked={allSelected} />
            <Text style={[styles.itemLabel, { fontWeight: '500' }]}>{allSelected ? 'Deselect all' : 'Select all'}</Text>
            {r.mostCommon ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>Most common</Text>
              </View>
            ) : null}
          </Pressable>
        ) : null}
        {all.map((it, idx) => (
          <View key={it.id} style={idx < all.length - 1 ? styles.itemDivider : undefined}>
            <View style={styles.itemRow}>
              <Pressable
                accessibilityRole={r.kind === 'radio' ? 'radio' : 'checkbox'}
                accessibilityLabel={it.label}
                accessibilityState={{ checked: items.includes(it.id) }}
                onPress={() => toggle(it.id)}
                style={styles.itemMain}
              >
                {r.kind === 'radio' ? <Radio checked={items.includes(it.id)} /> : <Checkbox checked={items.includes(it.id)} />}
                <Text style={styles.itemLabel}>{it.label}</Text>
              </Pressable>
              <InfoButton size={24} color="#555" onPress={() => setOpenInfo(openInfo === it.id ? null : it.id)} />
            </View>
            {openInfo === it.id ? <Text style={[styles.help, { marginLeft: 38, marginBottom: 12, marginTop: -4 }]}>{it.info}</Text> : null}
          </View>
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 18,
    minHeight: 64,
  },
  remove: { backgroundColor: colors.danger, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 9, minHeight: 40, justifyContent: 'center' },
  removeText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  body: { paddingHorizontal: 16, paddingBottom: 24 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 8 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '600', color: colors.ink, flex: 1, letterSpacing: -0.3 },
  question: { fontSize: 19, fontWeight: '600', color: colors.ink },
  hint: { fontSize: 14, lineHeight: 21, color: colors.text, marginTop: 6 },
  help: { fontSize: 14, lineHeight: 20, color: colors.textMuted, marginTop: 8 },
  levelBox: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, overflow: 'hidden' },
  levelRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 16, backgroundColor: '#fff' },
  levelRowActive: { backgroundColor: '#FAFAFC' },
  levelDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  levelTitle: { fontSize: 17, fontWeight: '600', color: colors.ink, marginBottom: 2 },
  levelBody: { fontSize: 15, lineHeight: 22, color: colors.text },
  crossLink: { textDecorationLine: 'underline', fontWeight: '600', color: colors.ink },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 56, paddingVertical: 8 },
  itemMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 16, alignSelf: 'stretch' },
  itemDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  itemLabel: { fontSize: 17, color: colors.text, flex: 1 },
  badge: { backgroundColor: colors.greenDark, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
