import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated';
import { DEMO_PRODUCTS, Package } from '../../components/art';
import { Button, Footer, RatingIcon, Screen } from '../../components/ui';
import { colors } from '../../theme';

const SHELF = ['🥫', '🧃', '🥣', '🍪', '🧂', '🫙', '🥫', '🍫', '🧃', '🥨', '🍝', '🫒'];

export default function ScannerReady() {
  const bread = DEMO_PRODUCTS[2];
  // Shrink the illustration on short screens (iPhone SE) so the Continue button stays on screen.
  const { height } = useWindowDimensions();
  const compact = height < 760;
  const cardH = compact ? Math.max(260, Math.min(400, height - 300)) : 400;
  return (
    <Screen>
      <Text style={styles.kicker}>Your personalized scanner is ready!</Text>
      <Animated.View
        entering={FadeIn.duration(500)}
        style={[styles.card, { height: cardH }]}
        accessible={false}
        importantForAccessibility="no-hide-descendants"
      >
        <LinearGradient colors={['#F2E9D8', '#D9CCB4', '#9B8F7C']} style={StyleSheet.absoluteFill} />
        {/* stylized grocery aisle */}
        {[0, 1, 2, 3].map((row) => (
          <View key={row} style={[styles.shelf, { top: 26 + row * 78 }]}>
            {SHELF.map((e, i) => (
              <Text key={i} style={[styles.shelfItem, { opacity: 0.85 - row * 0.12 }]}>
                {SHELF[(i + row * 3) % SHELF.length]}
              </Text>
            ))}
          </View>
        ))}
        <Text style={styles.cart}>🛒</Text>

        <Animated.View entering={FadeInDown.delay(400).duration(500)} style={styles.bubble}>
          <Text style={styles.bubbleText}>
            organic <Text style={styles.bad}>WHOLE WHEAT FLOUR</Text>, <Text style={styles.ok}>water</Text>, organic cracked{' '}
            <Text style={styles.bad}>WHOLE WHEAT</Text>, organic <Text style={styles.warn}>CANE SUGAR</Text>, organic{' '}
            <Text style={styles.bad}>WHEAT GLUTEN</Text>, …
          </Text>
        </Animated.View>
        <Animated.View entering={FadeInUp.delay(200).duration(500)} style={[styles.product, { top: cardH - 240 }]}>
          <Package p={bread} size={170} />
          <View style={{ position: 'absolute', left: 16, bottom: 16 }}>
            <RatingIcon rating="red" size={40} />
          </View>
        </Animated.View>
      </Animated.View>
      <Text style={[styles.headline, compact && { fontSize: 22, lineHeight: 28, marginTop: 16 }]}>
        Scan from 100,000+ products and know if something's safe. Instantly.
      </Text>
      <View style={{ flex: 1 }} />
      <Footer>
        <Button testID="continue" title="Continue" onPress={() => router.replace('/onboarding/pass')} />
      </Footer>
    </Screen>
  );
}

const styles = StyleSheet.create({
  kicker: { textAlign: 'center', fontSize: 15, fontWeight: '500', color: colors.ink, marginTop: 24 },
  card: { marginHorizontal: 24, marginTop: 18, height: 400, borderRadius: 20, overflow: 'hidden' },
  shelf: { position: 'absolute', left: -10, right: -10, flexDirection: 'row', justifyContent: 'space-between' },
  shelfItem: { fontSize: 30 },
  cart: { position: 'absolute', right: 20, bottom: 10, fontSize: 120 },
  bubble: {
    position: 'absolute',
    top: 92,
    right: 18,
    width: 235,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    zIndex: 2,
  },
  bubbleText: { fontSize: 12, lineHeight: 20, color: colors.ink },
  bad: { color: colors.danger, textDecorationLine: 'underline', fontWeight: '600' },
  warn: { color: '#C98600', textDecorationLine: 'underline', fontWeight: '600' },
  ok: { textDecorationLine: 'underline' },
  product: {
    position: 'absolute',
    left: 20,
    top: 160,
    width: 175,
    height: 175,
    backgroundColor: '#fff',
    borderTopLeftRadius: 4,
    borderBottomRightRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headline: {
    fontSize: 28,
    lineHeight: 35,
    fontWeight: '600',
    textAlign: 'center',
    color: colors.ink,
    marginTop: 24,
    paddingHorizontal: 24,
    letterSpacing: -0.4,
  },
});
