import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { CircularProgress, Confetti } from '../../components/art';
import { Button, Footer, Screen } from '../../components/ui';
import { haptic } from '../../lib/haptics';
import { useStore } from '../../lib/store';
import { colors } from '../../theme';

const DURATION = 5200;

export default function Finishing() {
  const restrictionCount = useStore((s) => Object.keys(s.restrictions).length);
  // Placeholder estimate until a real product catalog is connected.
  const products = useMemo(() => Math.max(18000, 128426 - restrictionCount * 6913), [restrictionCount]);
  const [p, setP] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => {
      const t = Math.min(1, (Date.now() - start) / DURATION);
      // ease-in-out so the ring feels like real work happening
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      setP(eased);
      if (t >= 1) {
        clearInterval(id);
        haptic.success();
      }
    }, 50);
    return () => clearInterval(id);
  }, []);

  const done = p >= 1;
  const steps = [
    { at: 0, label: 'Personalizing your barcode scanner' },
    { at: 0.3, label: 'Generating 2 million+ ingredient insights' },
    {
      at: 0.62,
      label: `Identifying ${Math.round(products * Math.min(1, Math.max(0, (p - 0.62) / 0.38))).toLocaleString()} products you can eat`,
    },
  ];
  const doneAt = [0.3, 0.62, 1];

  return (
    <Screen>
      <View style={styles.center}>
        <View style={styles.ring}>
          <CircularProgress value={p} size={150} stroke={8} />
          <Text style={styles.pct}>{Math.round(p * 100)}%</Text>
        </View>
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>{done ? 'Your profile is ready!' : 'Finishing your profile'}</Text>
        {steps.map((s, i) =>
          p >= s.at ? (
            <Animated.View key={i} entering={FadeInDown.duration(300)} style={styles.step}>
              <View style={{ width: 28 }}>
                {p >= doneAt[i] ? <Feather name="check" size={22} color={colors.accent} /> : <ActivityIndicator color={colors.accent} />}
              </View>
              <Text style={styles.stepText}>{s.label}</Text>
            </Animated.View>
          ) : null,
        )}
      </View>
      {done ? <Confetti /> : null}
      {done ? (
        <Animated.View entering={FadeIn.delay(300)}>
          <Footer border={false}>
            <Button testID="continue" title="Continue" onPress={() => router.replace('/onboarding/scanner-ready')} />
          </Footer>
        </Animated.View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', marginTop: 90 },
  ring: { alignItems: 'center', justifyContent: 'center' },
  pct: { position: 'absolute', fontSize: 34, fontWeight: '600', color: colors.ink },
  body: { flex: 1, paddingHorizontal: 16, marginTop: 64 },
  title: { fontSize: 30, fontWeight: '600', color: colors.ink, marginBottom: 14, letterSpacing: -0.4 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  stepText: { fontSize: 16, color: colors.text, flex: 1 },
});
