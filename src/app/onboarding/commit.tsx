import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { OnboardingHeader, Screen } from '../../components/ui';
import { goNext, progressFor } from '../../lib/flow';
import { haptic } from '../../lib/haptics';
import { useStore } from '../../lib/store';
import { colors } from '../../theme';

const HOLD_MS = 2400;
const SIZE = 300;

export default function Commit() {
  const duration = useStore((s) => s.duration) ?? 7;
  const [state, setState] = useState<'idle' | 'holding' | 'done'>('idle');
  const fill = useSharedValue(0);
  const pulse = useSharedValue(0);
  // 0 → 1 as the filled button turns into the "Goal set!" circle.
  const done = useSharedValue(0);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);
  const advance = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (ticker.current) clearInterval(ticker.current);
      // Don't navigate forward if the user already left this screen.
      if (advance.current) clearTimeout(advance.current);
      cancelAnimation(pulse);
      cancelAnimation(fill);
      cancelAnimation(done);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const complete = () => {
    if (ticker.current) clearInterval(ticker.current);
    if (advance.current) return;
    setState('done');
    haptic.success();
    const ease = Easing.inOut(Easing.sin);
    done.set(withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) }));
    pulse.set(
      withDelay(
        520,
        withRepeat(withSequence(withTiming(1, { duration: 900, easing: ease }), withTiming(0, { duration: 900, easing: ease })), -1),
      ),
    );
    advance.current = setTimeout(() => goNext('commit'), 1700);
  };

  const onPressIn = () => {
    if (state === 'done') return;
    if (ticker.current) clearInterval(ticker.current);
    setState('holding');
    haptic.light();
    // light haptic ticks while holding
    ticker.current = setInterval(() => haptic.light(), 300);
    fill.set(
      withTiming(1, { duration: HOLD_MS * (1 - fill.get()), easing: Easing.linear }, (finished) => {
        if (finished) runOnJS(complete)();
      }),
    );
  };

  const onPressOut = () => {
    if (state === 'done' || fill.get() >= 1) return;
    if (ticker.current) clearInterval(ticker.current);
    cancelAnimation(fill);
    // Drain smoothly from wherever the finger let go; no spring, so nothing overshoots or bounces.
    fill.set(withTiming(0, { duration: 200 + 350 * fill.get(), easing: Easing.out(Easing.cubic) }));
    setState('idle');
  };

  const innerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.12 + fill.value * 0.88 }],
    // Fades in over the first few percent instead of popping, so a quick tap or release never flickers.
    opacity: Math.min(1, fill.value * 8) * (0.55 + fill.value * 0.45),
  }));
  const outerRingStyle = useAnimatedStyle(() => ({
    transform: [{ scale: (0.82 + done.value * 0.18) * (1 + pulse.value * 0.06) }],
    opacity: done.value * (0.35 + pulse.value * 0.25),
  }));
  const innerRingStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.88 + done.value * 0.12 }],
    opacity: done.value * 0.5,
  }));
  const doneCircleStyle = useAnimatedStyle(() => ({
    opacity: done.value,
    transform: [{ scale: 0.94 + done.value * 0.06 }],
  }));
  const doneTextStyle = useAnimatedStyle(() => ({
    opacity: done.value,
    transform: [{ scale: 0.85 + done.value * 0.15 }],
  }));
  const labelStyle = useAnimatedStyle(() => ({
    color: fill.value > 0.88 ? '#fff' : colors.text,
    opacity: 1 - done.value,
  }));

  return (
    <Screen>
      <OnboardingHeader progress={progressFor('commit')} />
      <View style={styles.content}>
        <Text style={styles.title}>Make it official</Text>
        <Text style={styles.subtitle}>
          Press and hold below to lock it in! No daily tasks are required. Just scan as you shop.
        </Text>
      </View>

      <View style={styles.center}>
        <Animated.View pointerEvents="none" style={[styles.ring, styles.ringOuter, outerRingStyle]} />
        <Animated.View pointerEvents="none" style={[styles.ring, styles.ringInner, innerRingStyle]} />
        <Pressable
          testID="hold"
          accessibilityRole="button"
          accessibilityLabel={state === 'done' ? 'Goal set' : `Press and hold to try this diet for ${duration} days`}
          accessibilityHint="Hold for about two seconds"
          disabled={state === 'done'}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          onLongPress={() => {}}
          delayLongPress={HOLD_MS + 1000}
          style={styles.outer}
        >
          <Animated.View style={[styles.inner, innerStyle]} />
          <View style={styles.labelWrap} pointerEvents="none">
            <Animated.Text style={[styles.small, labelStyle]}>Press and hold to try this diet for</Animated.Text>
            <Animated.Text style={[styles.big, labelStyle]}>{duration} days</Animated.Text>
          </View>
          <Animated.View pointerEvents="none" style={[styles.doneCircle, doneCircleStyle]}>
            <Animated.Text style={[styles.doneText, doneTextStyle]}>Goal set!</Animated.Text>
          </Animated.View>
        </Pressable>
      </View>
      <Text style={styles.caption}>{state === 'idle' ? 'Press and hold to continue' : state === 'holding' ? 'Almost there…' : ' '}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 12 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '600', color: colors.ink, letterSpacing: -0.4 },
  subtitle: { fontSize: 15, lineHeight: 22, color: colors.text, marginTop: 10 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  outer: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  inner: {
    position: 'absolute',
    width: SIZE - 24,
    height: SIZE - 24,
    borderRadius: (SIZE - 24) / 2,
    backgroundColor: colors.accent,
  },
  labelWrap: { alignItems: 'center' },
  small: { fontSize: 13, fontWeight: '500' },
  big: { fontSize: 38, fontWeight: '600', marginTop: 2 },
  ring: { position: 'absolute', backgroundColor: colors.accentTint },
  ringOuter: { width: SIZE + 110, height: SIZE + 110, borderRadius: (SIZE + 110) / 2 },
  ringInner: { width: SIZE + 50, height: SIZE + 50, borderRadius: (SIZE + 50) / 2 },
  doneCircle: {
    position: 'absolute',
    top: -1,
    left: -1,
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: colors.accentDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: { color: '#fff', fontSize: 36, fontWeight: '600' },
  caption: { textAlign: 'center', fontSize: 14, color: colors.textMuted, marginBottom: 40 },
});
