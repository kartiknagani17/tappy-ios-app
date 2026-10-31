import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { BottomSheet } from '../../components/BottomSheet';
import { Button, CloseButton, Footer, Screen } from '../../components/ui';
import { haptic } from '../../lib/haptics';
import { useStore } from '../../lib/store';
import { PLANS, PRIVACY_URL, TERMS_URL, TRIAL_DAYS, money, restorePurchases, startTrial } from '../../lib/subscription';
import { colors } from '../../theme';

// What the subscription unlocks. Plain feature list: no testimonials or live counters
// unless they come from real, verifiable data (App Store guidelines 2.3.1 / 5.6).
const FEATURES: { icon: React.ComponentProps<typeof Feather>['name']; text: string }[] = [
  { icon: 'maximize', text: 'Unlimited barcode scans' },
  { icon: 'camera', text: 'Photo scans of packages and ingredient lists' },
  { icon: 'sliders', text: 'Ratings personalized to every diet and allergy in your profile' },
  { icon: 'bookmark', text: 'Save products to lists' },
];

const renewalCopy = (price: number) =>
  `Payment is charged to your Apple ID when the free trial ends. The subscription renews automatically at ${money(price)}/year unless canceled at least 24 hours before the end of the trial or current period. Cancel anytime in Settings > Apple ID > Subscriptions.`;

export default function Paywall() {
  const [loading, setLoading] = useState(false);
  const [offer, setOffer] = useState(false);
  const [offerLoading, setOfferLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const set = useStore((s) => s.set);
  const plan = PLANS.annual;
  const monthly = Math.floor((plan.price / 12) * 100) / 100;
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  // During onboarding the paywall leads to the safety screen. When opened later
  // (e.g. from "See plans" on the scanner), it returns to where the user came from.
  const leave = () => {
    if (!useStore.getState().onboarded) router.replace('/onboarding/safety');
    else if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/scan');
  };

  const purchase = async (productId: string, setBusy: (b: boolean) => void) => {
    if (loading || offerLoading) return;
    setBusy(true);
    setMessage(null);
    try {
      const ok = await startTrial(productId, true);
      if (!mounted.current) return;
      if (ok) {
        haptic.success();
        set({ trialActive: true });
        setOffer(false);
        leave();
      } else {
        setMessage('The purchase was not completed. You have not been charged.');
      }
    } catch {
      if (mounted.current) setMessage('Something went wrong with the App Store. Please try again.');
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const restore = async () => {
    if (restoring) return;
    setRestoring(true);
    setMessage(null);
    try {
      const restored = await restorePurchases();
      if (!mounted.current) return;
      if (restored) {
        haptic.success();
        set({ trialActive: true });
        leave();
      } else {
        setMessage('No active Tapi subscription was found for this Apple ID.');
      }
    } catch {
      if (mounted.current) setMessage('Could not reach the App Store. Please try again.');
    } finally {
      if (mounted.current) setRestoring(false);
    }
  };

  return (
    <Screen>
      <View style={styles.top}>
        <CloseButton testID="paywall-close" onPress={() => setOffer(true)} size={30} color="#4A4A5A" />
        <Pressable testID="restore" accessibilityRole="button" accessibilityLabel="Restore purchases" hitSlop={12} onPress={restore}>
          <Text style={styles.restoreTop}>{restoring ? 'Restoring…' : 'Restore'}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.title} accessibilityRole="header">
          Choose your plan
        </Text>
        <Text style={styles.subtitle}>Try Tapi Unlimited free for {TRIAL_DAYS} days.</Text>

        <View style={styles.features}>
          {FEATURES.map((f) => (
            <View key={f.text} style={styles.feature}>
              <View style={styles.featureIcon}>
                <Feather name={f.icon} size={18} color={colors.purpleDark} />
              </View>
              <Text style={styles.featureText}>{f.text}</Text>
            </View>
          ))}
        </View>

        <View
          style={styles.planCard}
          accessible
          accessibilityRole="radio"
          accessibilityState={{ selected: true }}
          accessibilityLabel={`Annual plan, ${TRIAL_DAYS} days free, then ${money(plan.price)} per year`}
        >
          <View style={styles.planCheck}>
            <Feather name="check" size={16} color={colors.ink} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.planName}>Annual</Text>
            <Text style={styles.planSub}>{TRIAL_DAYS}-day free trial</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.planPrice}>{money(plan.price)}/year</Text>
            <Text style={styles.planSub}>about {money(monthly)}/month</Text>
          </View>
        </View>

        <Text style={styles.terms}>{renewalCopy(plan.price)}</Text>
      </ScrollView>

      <Footer>
        {message ? (
          <Text style={styles.message} accessibilityLiveRegion="polite">
            {message}
          </Text>
        ) : null}
        <Button
          testID="start-trial"
          title="Start free trial"
          loading={loading}
          onPress={() => purchase(plan.id, setLoading)}
          style={{ borderRadius: 16, minHeight: 60 }}
          textStyle={{ fontWeight: '800', fontSize: 19 }}
        />
        <Text style={styles.fine}>
          {TRIAL_DAYS} days free, then {money(plan.price)}/year. Auto-renews. Cancel anytime.
        </Text>
        <LegalRow onRestore={restore} restoring={restoring} />
      </Footer>

      <BottomSheet
        visible={offer}
        onClose={() => setOffer(false)}
        style={{ borderTopLeftRadius: 60, borderTopRightRadius: 60 }}
        topAccessory={
          <View style={styles.ribbon}>
            <View style={styles.ribbonBack} />
            <View style={styles.ribbonFront}>
              <Text style={styles.ribbonText}>FREE TRIAL</Text>
            </View>
          </View>
        }
      >
        <Animated.View entering={FadeIn} style={styles.offer}>
          <Text style={styles.offerTitle}>Before you go...</Text>
          <Text style={styles.offerSub}>
            {TRIAL_DAYS} days free, then {money(PLANS.annualOffer.price)}/year
          </Text>
          <Text style={styles.offerNoPay}>No payment now · Cancel anytime</Text>
          <Button
            testID="offer-accept"
            title="Start my free week"
            loading={offerLoading}
            onPress={() => purchase(PLANS.annualOffer.id, setOfferLoading)}
            style={{ marginTop: 28 }}
            textStyle={{ fontWeight: '800', fontSize: 19 }}
          />
          <Text style={styles.offerTerms}>{renewalCopy(PLANS.annualOffer.price)}</Text>
          <LegalRow />
          <Pressable
            testID="offer-decline"
            accessibilityRole="button"
            style={{ paddingVertical: 14, minHeight: 44 }}
            onPress={() => {
              setOffer(false);
              leave();
            }}
          >
            <Text style={styles.decline}>No thanks, continue without a trial →</Text>
          </Pressable>
        </Animated.View>
      </BottomSheet>
    </Screen>
  );
}

function LegalRow({ onRestore, restoring }: { onRestore?: () => void; restoring?: boolean }) {
  return (
    <View style={styles.legal}>
      {onRestore ? (
        <>
          <Text accessibilityRole="button" style={styles.legalLink} onPress={onRestore}>
            {restoring ? 'Restoring…' : 'Restore purchases'}
          </Text>
          <Text style={styles.legalDot}>·</Text>
        </>
      ) : null}
      <Text accessibilityRole="link" style={styles.legalLink} onPress={() => Linking.openURL(TERMS_URL)}>
        Terms of Use
      </Text>
      <Text style={styles.legalDot}>·</Text>
      <Text accessibilityRole="link" style={styles.legalLink} onPress={() => Linking.openURL(PRIVACY_URL)}>
        Privacy Policy
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  top: {
    paddingHorizontal: 20,
    paddingTop: 8,
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  restoreTop: { fontSize: 15, fontWeight: '600', color: colors.textMuted },
  scroll: { paddingHorizontal: 20, paddingBottom: 16 },
  title: { fontSize: 30, fontWeight: '800', textAlign: 'center', color: '#000', marginTop: 4, letterSpacing: -0.6 },
  subtitle: { fontSize: 16, lineHeight: 22, color: colors.text, textAlign: 'center', marginTop: 8 },
  features: { gap: 14, marginTop: 24, marginBottom: 24 },
  feature: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  featureIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.purpleSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: { flex: 1, fontSize: 16, lineHeight: 22, color: colors.ink },
  planCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 2.5,
    borderColor: colors.purpleDark,
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  planCheck: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' },
  planName: { fontSize: 19, fontWeight: '800', color: '#000' },
  planSub: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
  planPrice: { fontSize: 20, fontWeight: '700', color: '#000' },
  terms: { fontSize: 12, lineHeight: 17, color: colors.textMuted, marginTop: 14 },
  message: { fontSize: 14, lineHeight: 20, color: colors.danger, textAlign: 'center' },
  fine: { fontSize: 13, color: '#222', textAlign: 'center' },
  legal: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 8 },
  legalLink: { fontSize: 13, color: colors.textMuted, textDecorationLine: 'underline', paddingVertical: 4 },
  legalDot: { fontSize: 13, color: colors.textMuted, paddingVertical: 4 },
  ribbon: { width: 300, height: 110, alignItems: 'center', justifyContent: 'center' },
  ribbonBack: {
    position: 'absolute',
    width: 190,
    height: 62,
    backgroundColor: colors.lime,
    borderWidth: 3,
    borderColor: '#000',
    transform: [{ rotate: '-4deg' }, { translateY: 20 }, { translateX: 6 }],
  },
  ribbonFront: {
    width: 260,
    height: 74,
    backgroundColor: colors.lime,
    borderWidth: 3.5,
    borderColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-4deg' }],
  },
  ribbonText: { fontSize: 32, fontWeight: '900', fontStyle: 'italic', color: '#000', letterSpacing: 0.5 },
  offer: { paddingHorizontal: 24, paddingTop: 76, alignItems: 'stretch' },
  offerTitle: { fontSize: 34, fontWeight: '900', textAlign: 'center', color: '#000', letterSpacing: -0.6 },
  offerSub: { fontSize: 17, color: '#55555F', textAlign: 'center', marginTop: 14 },
  offerNoPay: { fontSize: 16, fontWeight: '800', color: '#55555F', textAlign: 'center', marginTop: 6 },
  offerTerms: { fontSize: 11, lineHeight: 15, color: colors.textMuted, textAlign: 'center', marginTop: 12, marginBottom: 6 },
  decline: { fontSize: 16, color: '#55555F', textAlign: 'center' },
});
