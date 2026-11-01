import { StyleSheet, Text, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { DEMO_PRODUCTS, Package } from '../../components/art';
import { QuestionLayout } from '../../components/QuestionLayout';
import { Button } from '../../components/ui';
import { goNext } from '../../lib/flow';
import { useStore } from '../../lib/store';

export default function Committed() {
  const duration = useStore((s) => s.duration) ?? 7;
  return (
    <QuestionLayout
      step="committed"
      title="You're committed 🙌"
      subtitle={`For the next ${duration} days, Tappy will tailor recommendations around your unique profile. Ready to eat with more confidence?`}
      footer={<Button testID="continue" title="I'm ready" onPress={() => goNext('committed')} />}
    >
      <View style={styles.panel}>
        <Animated.View
          entering={ZoomIn.delay(100).springify()}
          style={[styles.card, { backgroundColor: '#A7CC86', top: 14, left: 30, transform: [{ rotate: '10deg' }] }]}
        >
          <Text style={{ fontSize: 64 }}>🌴</Text>
          <Text style={styles.cardLabel}>Medjool Dates</Text>
        </Animated.View>
        <Animated.View
          entering={ZoomIn.delay(250).springify()}
          style={[styles.card, styles.plate, { top: 120, right: -20, transform: [{ rotate: '-14deg' }] }]}
        >
          <Text style={{ fontSize: 70 }}>🌮</Text>
        </Animated.View>
        <Animated.View
          entering={ZoomIn.delay(400).springify()}
          style={[styles.card, { backgroundColor: '#F7D44C', top: 190, left: 40, transform: [{ rotate: '0deg' }] }]}
        >
          <Package
            p={{ ...DEMO_PRODUCTS[0], name: 'Simple Crackers', brand: 'SIMPLE', emoji: '🍘', color: '#FFF4D6', accent: '#2D7A3E' }}
            size={120}
          />
        </Animated.View>
      </View>
    </QuestionLayout>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: '#ECECEE', borderRadius: 18, height: 330, overflow: 'hidden' },
  card: {
    position: 'absolute',
    width: 190,
    height: 170,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 5,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  plate: { backgroundColor: '#3A91B5' },
  cardLabel: { fontWeight: '800', color: '#3B2263', marginTop: 4, fontSize: 15 },
});
