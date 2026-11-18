import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { openLegal } from '../../lib/legal';
import { Button, Checkbox, Footer, Screen } from '../../components/ui';
import { haptic } from '../../lib/haptics';
import { useStore } from '../../lib/store';
import { colors, radius } from '../../theme';

export default function Safety() {
  const agreed = useStore((s) => s.agreedToTerms);
  const set = useStore((s) => s.set);
  const toggle = () => {
    haptic.select();
    set({ agreedToTerms: !agreed });
  };

  return (
    <Screen>
      <View style={styles.content}>
        <Feather name="shield" size={56} color={colors.ink} />
        <Text style={styles.title}>Your safety is our priority</Text>
        <Text style={styles.body}>
          <Text style={{ fontWeight: '700' }}>Always read the ingredients and allergen warnings on the package yourself</Text> before
          eating, especially if you live with life-threatening allergies.
        </Text>
        <Text style={styles.body}>
          Tappy’s ratings come from product databases and software. They can be wrong or out of date, and they aren’t medical advice.
        </Text>
      </View>
      <Footer>
        {/* The checkbox and the sentence toggle the agreement; the two links inside the sentence are their
            own press targets (nested Text), so tapping them opens the document instead of ticking the box. */}
        <View style={[styles.agree, agreed && styles.agreeOn]}>
          <Pressable
            testID="agree"
            accessibilityRole="checkbox"
            accessibilityLabel="I agree to Tappy's Terms of Use and Privacy Policy. I understand Tappy can be wrong and isn't medical advice, and I'll always check the package myself."
            accessibilityState={{ checked: agreed }}
            hitSlop={8}
            onPress={toggle}
          >
            <Checkbox checked={agreed} size={24} />
          </Pressable>
          <Text style={styles.agreeText} onPress={toggle} suppressHighlighting>
            I agree to Tappy's{' '}
            <Text testID="terms-link" accessibilityRole="link" style={styles.link} onPress={() => openLegal('terms')}>
              Terms of Use
            </Text>{' '}
            and{' '}
            <Text testID="privacy-link" accessibilityRole="link" style={styles.link} onPress={() => openLegal('privacy')}>
              Privacy Policy
            </Text>
            . I understand Tappy can be wrong and isn’t medical advice, and I’ll always check the package myself.
          </Text>
        </View>
        <Button
          testID="continue"
          title={agreed ? 'Continue' : 'Check the box above to continue'}
          disabled={!agreed}
          onPress={() => {
            set({ onboarded: true });
            router.replace('/(tabs)/scan');
          }}
        />
      </Footer>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 48 },
  title: { fontSize: 31, lineHeight: 38, fontWeight: '600', color: colors.ink, marginTop: 18, letterSpacing: -0.5 },
  body: { fontSize: 17, lineHeight: 25, color: colors.text, marginTop: 10 },
  agree: {
    flexDirection: 'row',
    gap: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: 18,
    alignItems: 'flex-start',
  },
  agreeOn: { backgroundColor: colors.accentSoft, borderColor: colors.accentTint },
  agreeText: { flex: 1, fontSize: 16, lineHeight: 24, color: colors.text },
  link: { color: colors.link, textDecorationLine: 'underline' },
});
