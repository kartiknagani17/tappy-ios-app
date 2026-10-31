import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { PhoneMockup } from '../components/art';
import { Button, Footer, Logo, Screen, TextLink } from '../components/ui';
import { AUTH_ENABLED } from '../lib/auth';
import { useStore } from '../lib/store';
import { colors } from '../theme';

export default function Welcome() {
  // Notification permission is no longer requested on first open with no context.
  // It's asked on the trial-reminder screen, where the user sees why (onboarding/reminder.tsx).
  return (
    <Screen>
      <View style={styles.top}>
        <Animated.View entering={FadeInDown.duration(500)} style={{ alignItems: 'center' }}>
          <Logo size={44} />
          <Text style={styles.title}>Let's find food{'\n'}you can eat</Text>
        </Animated.View>
        <Animated.View entering={FadeInUp.delay(150).duration(600)} style={styles.phoneWrap}>
          <PhoneMockup />
        </Animated.View>
      </View>
      <Footer border={false}>
        <Button
          testID="get-started"
          title="Get Started 🎉"
          onPress={() => {
            useStore.getState().resetAll();
            router.push('/onboarding/mindset');
          }}
        />
        {AUTH_ENABLED ? (
          <Text style={styles.login}>
            Have an account?{' '}
            <TextLink title="Log in" onPress={() => router.push({ pathname: '/auth', params: { mode: 'login' } })} style={{ fontSize: 15 }} />
          </Text>
        ) : null}
      </Footer>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flex: 1, alignItems: 'center', paddingTop: 16, overflow: 'hidden' },
  title: { fontSize: 30, lineHeight: 38, fontWeight: '600', color: colors.ink, textAlign: 'center', marginTop: 18, letterSpacing: -0.4 },
  phoneWrap: { marginTop: 28, flex: 1, width: '100%' },
  login: { textAlign: 'center', fontSize: 15, color: colors.ink, marginBottom: 4 },
});
