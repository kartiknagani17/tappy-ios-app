import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomSheet } from '../../components/BottomSheet';
import { QuestionLayout } from '../../components/QuestionLayout';
import { Button, Checkbox, InfoButton } from '../../components/ui';
import { goNext } from '../../lib/flow';
import { haptic } from '../../lib/haptics';
import { useStore } from '../../lib/store';
import { colors } from '../../theme';

const ITEMS = [
  {
    id: 'added-sugar',
    label: 'Added sugar',
    info: 'Sugars and syrups added during processing, like cane sugar, corn syrup, and dextrose.',
  },
  { id: 'artificial-flavors', label: 'Artificial flavors', info: 'Flavoring substances made in a lab rather than derived from food.' },
  {
    id: 'food-coloring',
    label: 'Artificial food coloring',
    info: 'Synthetic dyes such as Red #40, Yellow #5, and Blue #1. Several carry warning labels in Europe.',
  },
  {
    id: 'artificial-sweeteners',
    label: 'Artificial sweeteners',
    info: 'Low- and no-calorie sweeteners such as sucralose, aspartame, and acesulfame potassium.',
  },
  {
    id: 'common-additives',
    label: 'Common additives',
    info: 'Preservatives and processing aids that are restricted or controversial in many countries, like BHA, potassium bromate, and azodicarbonamide.',
  },
  {
    id: 'emulsifiers',
    label: 'Emulsifiers',
    info: 'Ingredients like polysorbate 80 and carrageenan that early research links to gut irritation.',
  },
];

export default function Avoid() {
  const avoidList = useStore((s) => s.avoidList);
  const set = useStore((s) => s.set);
  const applyAvoidList = useStore((s) => s.applyAvoidList);
  const [info, setInfo] = useState<(typeof ITEMS)[number] | null>(null);

  const toggle = (id: string) => {
    haptic.select();
    set({ avoidList: avoidList.includes(id) ? avoidList.filter((x) => x !== id) : [...avoidList, id] });
  };

  return (
    <>
      <QuestionLayout
        step="avoid"
        title="We'll help you avoid these ingredients"
        subtitle="You can always update these selections later."
        footer={
          <Button
            testID="continue"
            title="Continue"
            onPress={() => {
              applyAvoidList();
              goNext('avoid');
            }}
          />
        }
      >
        {ITEMS.map((it, i) => (
          <View key={it.id} style={[styles.row, i < ITEMS.length - 1 && styles.divider]}>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityLabel={it.label}
              accessibilityState={{ checked: avoidList.includes(it.id) }}
              onPress={() => toggle(it.id)}
              style={styles.rowMain}
            >
              <Checkbox checked={avoidList.includes(it.id)} />
              <Text style={styles.label}>{it.label}</Text>
            </Pressable>
            <InfoButton size={20} onPress={() => setInfo(it)} />
          </View>
        ))}
      </QuestionLayout>
      <BottomSheet visible={!!info} onClose={() => setInfo(null)} handle>
        <View style={{ paddingHorizontal: 16, paddingTop: 12, gap: 12 }}>
          <Text style={styles.sheetTitle}>{info?.label}</Text>
          <Text style={styles.sheetBody}>{info?.info}</Text>
          <Button title="Got it" onPress={() => setInfo(null)} style={{ marginTop: 8 }} />
        </View>
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 58 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 16, alignSelf: 'stretch' },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  label: { flex: 1, fontSize: 16, color: colors.text },
  sheetTitle: { fontSize: 22, fontWeight: '600', color: colors.ink },
  sheetBody: { fontSize: 15, lineHeight: 22, color: colors.text },
});
