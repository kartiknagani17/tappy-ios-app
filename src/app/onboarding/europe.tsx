import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { QuestionLayout } from '../../components/QuestionLayout';
import { Button } from '../../components/ui';
import { goNext } from '../../lib/flow';
import { colors } from '../../theme';

const ADDITIVES = [
  'Titanium dioxide',
  'Potassium bromate',
  'Azodicarbonamide',
  'Propylparaben',
  'Red #3',
  'Red #40',
  'Yellow #5',
  'Yellow #6',
  'BHA',
  'BHT',
  'Carrageenan',
  'Nitrates & nitrites',
  'High fructose corn syrup',
  'Sorbitol',
  'Aspartame',
  'Seed oils',
  'Artificial flavors',
  'Sucralose',
];

export default function Europe() {
  return (
    <QuestionLayout
      step="europe"
      title="If it's banned in Europe, why is it in your pantry?"
      subtitle="Dozens of additives allowed in the U.S. are restricted overseas due to health concerns. Tappy helps you spot them instantly."
      footer={<Button testID="continue" title="Continue" onPress={() => goNext('europe')} />}
    >
      <View style={styles.panel}>
        <View style={styles.chips}>
          {ADDITIVES.map((a, i) => (
            <Animated.View key={a} entering={FadeIn.delay(i * 35).duration(300)} style={styles.chip}>
              <Text style={styles.chipText}>{a}</Text>
            </Animated.View>
          ))}
        </View>
        <LinearGradient colors={['rgba(244,244,246,0)', '#F4F4F6']} style={styles.fade} pointerEvents="none" />
        <View style={styles.badges} pointerEvents="none">
          <Animated.View entering={ZoomIn.delay(500).springify().damping(13)} style={[styles.badge, { marginRight: -18, zIndex: 1 }]}>
            <Text style={styles.flag}>🇺🇸</Text>
            <Text style={styles.badgeLabel}>Permitted</Text>
          </Animated.View>
          <Animated.View entering={ZoomIn.delay(750).springify().damping(13)} style={[styles.badge, styles.badgeRed]}>
            <Text style={styles.flag}>🇪🇺</Text>
            <Text style={[styles.badgeLabel, { color: colors.danger }]}>Restricted</Text>
          </Animated.View>
        </View>
      </View>
    </QuestionLayout>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: colors.surfaceMuted, borderRadius: 18, padding: 20, height: 380, overflow: 'hidden' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: { backgroundColor: '#F3EEEC', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  chipText: { fontSize: 14, color: '#4A3C38' },
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 200 },
  badges: { position: 'absolute', bottom: 18, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center' },
  badge: {
    width: 138,
    height: 138,
    borderRadius: 69,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
    borderWidth: 4,
    borderColor: colors.hairline,
  },
  badgeRed: { backgroundColor: '#FDECEC', borderColor: '#F7DADA' },
  flag: { fontSize: 50 },
  badgeLabel: { fontSize: 18, fontWeight: '600', color: '#6F625E', marginTop: 4 },
});
