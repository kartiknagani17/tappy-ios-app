import { Feather } from '@expo/vector-icons';
import { StyleSheet, Switch, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import { DEMO_PRODUCTS, Package } from '../../components/art';
import { QuestionLayout } from '../../components/QuestionLayout';
import { Button, RatingIcon } from '../../components/ui';
import { goNext } from '../../lib/flow';
import { colors } from '../../theme';

const FLAGGED: { text: string; color: string }[] = [
  { text: 'SUGAR', color: colors.danger },
  { text: 'CORN SYRUP', color: colors.danger },
  { text: 'NATURAL FLAVOR', color: '#D68A00' },
  { text: 'MONO AND DIGLYCERIDES', color: colors.danger },
  { text: 'GUAR GUM', color: colors.danger },
  { text: 'RED 40', color: colors.danger },
  { text: 'BLUE 1', color: colors.danger },
  { text: 'CARRAGEENAN', color: colors.danger },
];

export default function Detective() {
  const p = DEMO_PRODUCTS[4];
  return (
    <QuestionLayout
      step="detective"
      title="Consider us your digital food detective 🔎"
      subtitle={
        'You scan the barcode. Tapi checks the fine print against your "no" list. If a restricted ingredient is hiding in there, we flag it.'
      }
      footer={<Button testID="continue" title="Continue" onPress={() => goNext('detective')} />}
    >
      <View style={styles.panel}>
        <Animated.View
          entering={FadeInDown.duration(500)}
          style={styles.phone}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Text style={styles.time}>9:41</Text>
          <View style={styles.productArea}>
            <Package p={p} size={150} />
          </View>
          <View style={{ paddingHorizontal: 14 }}>
            <RatingIcon rating="red" size={22} />
            <Text style={styles.pname}>{p.name}</Text>
            <Text style={styles.pnote}>Does not fit your Tapi</Text>
            <View style={styles.notifyRow}>
              <Feather name="bell" size={13} />
              <Text style={styles.notifyText}>Get notified of ingredient changes</Text>
              <Switch
                value
                trackColor={{ true: colors.purple, false: '#ddd' }}
                style={{ transform: [{ scale: 0.7 }] }}
              />
            </View>
            <Text style={styles.overview}>Diet Overview</Text>
          </View>
        </Animated.View>
        <Animated.View entering={FadeInRight.delay(450).duration(500)} style={styles.bubble}>
          <Text style={styles.bubbleText}>
            {FLAGGED.map((f, i) => (
              <Text key={f.text}>
                <Text style={{ color: f.color, textDecorationLine: 'underline', fontWeight: '600' }}>{f.text}</Text>
                {i < FLAGGED.length - 1 ? ', ' : '…'}
              </Text>
            ))}
          </Text>
        </Animated.View>
      </View>
    </QuestionLayout>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: colors.surfaceMuted, borderRadius: 18, height: 390, overflow: 'hidden', alignItems: 'center' },
  phone: {
    marginTop: 46,
    width: 230,
    flex: 1,
    backgroundColor: '#fff',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 6,
    borderBottomWidth: 0,
    borderColor: '#E3E3E6',
  },
  time: { fontSize: 10, fontWeight: '600', paddingLeft: 18, paddingTop: 8 },
  productArea: { alignItems: 'center', paddingVertical: 6 },
  pname: { fontSize: 13, fontWeight: '600', color: colors.ink, marginTop: 6 },
  pnote: { fontSize: 10, color: colors.textMuted, marginTop: 2 },
  notifyRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  notifyText: { fontSize: 9, flex: 1, color: colors.ink },
  overview: { fontSize: 12, fontWeight: '700', marginTop: 8, color: colors.ink },
  bubble: {
    position: 'absolute',
    top: 22,
    right: 14,
    width: 190,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 10,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  bubbleText: { fontSize: 10.5, lineHeight: 17 },
});
