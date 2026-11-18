import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LegalSheet, type LegalDocId } from '../../components/LegalSheet';
import { Button, Checkbox, Footer, Screen } from '../../components/ui';
import { haptic } from '../../lib/haptics';
import { useStore } from '../../lib/store';
import { colors, radius } from '../../theme';

export default function Safety() {
  const agreed = useStore((s) => s.agreedToTerms);
  const set = useStore((s) => s.set);
  const [legal, setLegal] = useState<LegalDocId | null>(null);

  return (
    <Screen>
      <View style={styles.content}>
        <Feather name="shield" size={56} color={colors.ink} />
        <Text style={styles.title}>Your safety is our priority</Text>
        <Text style={styles.body}>
          <Text style={{ fontWeight: '700' }}>Always double-check ingredients</Text>, especially if you live with life-threatening
          allergies.
        </Text>
      </View>
      <Footer>
        <Pressable
          testID="agree"
          accessibilityRole="checkbox"
          accessibilityLabel="I agree to Tappy's Terms of Service and Privacy Policy, and I'll always double-check ingredient and allergen info."
          accessibilityState={{ checked: agreed }}
          onPress={() => {
            haptic.select();
            set({ agreedToTerms: !agreed });
          }}
          style={[styles.agree, agreed && styles.agreeOn]}
        >
          <Checkbox checked={agreed} size={24} />
          <Text style={styles.agreeText}>
            I agree to Tappy's{' '}
            <Text accessibilityRole="link" style={styles.link} onPress={() => setLegal('terms')}>
              Terms of Service
            </Text>{' '}
            and{' '}
            <Text accessibilityRole="link" style={styles.link} onPress={() => setLegal('privacy')}>
              Privacy Policy
            </Text>
            , and I'll always double-check ingredient and allergen info.
          </Text>
        </Pressable>
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
      <LegalSheet doc={legal} onClose={() => setLegal(null)} />
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
