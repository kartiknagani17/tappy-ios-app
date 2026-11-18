import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useEffect, useRef, useState } from 'react';
import { Button, Footer, Screen } from '../../components/ui';
import { formatReminderDate, REMINDER_DAYS_BEFORE } from '../../lib/subscription';
import { colors } from '../../theme';

export default function Reminder() {
  const rot = useSharedValue(0);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  // Ask for notification permission here, in context: the reminder is the reason we need it.
  const onContinue = async () => {
    if (busy) return;
    setBusy(true);
    if (Platform.OS !== 'web') {
      try {
        const p = await Notifications.getPermissionsAsync();
        if (p.status === 'undetermined') await Notifications.requestPermissionsAsync();
      } catch {
        // Continue without reminders.
      }
    }
    if (!mounted.current) return;
    setBusy(false);
    router.push('/onboarding/paywall');
  };
  useEffect(() => {
    rot.set(
      withDelay(
        400,
        withRepeat(
          withSequence(
            withTiming(14, { duration: 90 }),
            withTiming(-14, { duration: 120 }),
            withTiming(8, { duration: 100 }),
            withTiming(0, { duration: 90 }),
          ),
          2,
        ),
      ),
    );
  }, [rot]);
  const bell = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value}deg` }] }));

  return (
    <Screen>
      <View style={styles.center}>
        <Animated.View style={bell}>
          <Ionicons name="notifications-outline" size={84} color="#1F1513" />
        </Animated.View>
        <Animated.Text entering={FadeInDown.duration(400)} style={styles.title}>
          We'll remind you <Text style={{ color: colors.accentDark }}>{`${REMINDER_DAYS_BEFORE}\u00A0days`}</Text>
          {'\n'}before your trial ends
        </Animated.Text>
        <Text style={styles.sub}>You'll get a push notification on {formatReminderDate()}</Text>
      </View>
      <Footer border={false}>
        <Button testID="continue" title="Continue" loading={busy} onPress={onContinue} textStyle={{ fontWeight: '700' }} />
      </Footer>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  title: { fontSize: 31, lineHeight: 40, fontWeight: '800', textAlign: 'center', marginTop: 36, color: '#1F1513', letterSpacing: -0.6 },
  sub: { fontSize: 15, fontWeight: '500', color: '#1F1513', marginTop: 16, textAlign: 'center' },
});
