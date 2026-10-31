import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { Button, Footer, Screen } from '../../components/ui';
import { money, PLANS, TRIAL_DAYS } from '../../lib/subscription';
import { colors } from '../../theme';

export default function Pass() {
  return (
    <Screen>
      <View style={styles.center}>
        <Animated.View entering={ZoomIn.duration(400)} style={styles.pill}>
          <Text style={styles.pillText}>FREE TRIAL</Text>
        </Animated.View>
        <Animated.Text entering={FadeInDown.delay(150).duration(450)} style={styles.title}>
          Unlimited Pass{'\n'}
          {TRIAL_DAYS} days <Text style={{ color: colors.purpleDark }}>free</Text>
        </Animated.Text>
        <Text style={styles.sub}>
          Then {money(PLANS.annual.price)}/year. Cancel anytime before the trial ends and you won't be charged.
        </Text>
      </View>
      <Footer border={false}>
        <Button
          testID="try-free"
          title="Try for free 🙌"
          onPress={() => router.push('/onboarding/reminder')}
          textStyle={{ fontWeight: '700' }}
        />
      </Footer>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pill: { backgroundColor: '#EAECF0', borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10 },
  pillText: { fontSize: 17, fontWeight: '600', color: '#4F5370', letterSpacing: 0.3 },
  sub: { fontSize: 15, lineHeight: 21, color: colors.textMuted, textAlign: 'center', marginTop: 16, paddingHorizontal: 32 },
  title: { fontSize: 38, lineHeight: 48, fontWeight: '800', textAlign: 'center', marginTop: 24, color: '#000', letterSpacing: -0.8 },
});
