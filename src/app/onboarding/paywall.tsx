import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Linking,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { BottomSheet } from '../../components/BottomSheet';
import { Button, CloseButton, Screen } from '../../components/ui';
import { haptic } from '../../lib/haptics';
import { useStore } from '../../lib/store';
import { PLANS, PRIVACY_URL, TERMS_URL, TRIAL_DAYS, money, restorePurchases, startTrial } from '../../lib/subscription';
import { colors } from '../../theme';

const { width: W } = Dimensions.get('window');

// What the plan includes. (Testimonials and a "people joined today" count were removed: they were
// placeholders, and unverifiable reviews/counters are a rejection risk under App Store guidelines 2.3.1 / 5.6.
// Only add them back with real, verifiable data.)
const SLIDES = [
  { emoji: '🔎', title: 'Unlimited scans', text: 'Scan any barcode and instantly see if it fits your diet, allergies, and avoidances.' },
  { emoji: '📸', title: 'Photo scanning', text: 'No barcode handy? Snap the package or the ingredient list and Tapi reads it for you.' },
  {
    emoji: '🥗',
    title: 'Personalized ratings',
    text: 'Every ingredient is rated against your dietary profile: can eat, limit this, or avoid.',
  },
  { emoji: '🔖', title: 'Lists', text: 'Save the products that work for you so your next grocery run is faster.' },
];

export default function Paywall() {
  const [trial, setTrial] = useState(true);
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
  // (e.g. "See plans" on the scanner), it returns to where the user came from.
  const leave = () => {
    if (!useStore.getState().onboarded) router.replace('/onboarding/safety');
    else if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/scan');
  };

  const purchase = async (productId: string, withTrial: boolean, setBusy: (b: boolean) => void) => {
    if (loading || offerLoading) return;
    setBusy(true);
    setMessage(null);
    try {
      const ok = await startTrial(productId, withTrial);
      if (!mounted.current) return;
      if (ok) {
        haptic.success();
        set({ trialActive: true });
        setOffer(false);
        leave();
      } else setMessage('The purchase was not completed. You have not been charged.');
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
      } else setMessage('No active Tapi subscription was found for this Apple ID.');
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
      </View>
      {/* Scrolls only when the screen is too short (iPhone SE) so the legal links stay reachable. */}
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        <Text style={styles.title} accessibilityRole="header">
          Choose your plan
        </Text>

        <Carousel />

        <View style={{ flex: 1 }} />

        <View style={styles.bottom}>
          <View style={styles.trialRow}>
            <Text style={styles.trialText}>{trial ? `${TRIAL_DAYS} Day Free Trial Activated` : 'Enable free trial'}</Text>
            <Switch
              testID="trial-toggle"
              accessibilityLabel="Free trial"
              value={trial}
              onValueChange={(v) => {
                haptic.select();
                setTrial(v);
              }}
              trackColor={{ true: colors.purpleDark, false: '#D1D1D6' }}
              ios_backgroundColor="#D1D1D6"
            />
          </View>

          <View
            style={styles.planCard}
            accessible
            accessibilityRole="radio"
            accessibilityState={{ selected: true }}
            accessibilityLabel={`1 year plan, ${money(plan.price)} per year`}
          >
            <View style={styles.planCheck}>
              <Feather name="check" size={16} color={colors.ink} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.planName}>{plan.label}</Text>
              <Text style={styles.planSub}>{money(monthly)}/month, billed yearly</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.planPrice}>{money(plan.price)}</Text>
              <Text style={styles.planSub}>/ year</Text>
            </View>
          </View>
          <View style={{ height: 18 }} />
          {message ? (
            <Text style={styles.message} accessibilityLiveRegion="polite">
              {message}
            </Text>
          ) : null}

          <Button
            testID="start-trial"
            title={trial ? 'Start FREE trial' : 'Continue'}
            loading={loading}
            onPress={() => purchase(plan.id, trial, setLoading)}
            style={{ borderRadius: 16, height: 60 }}
            textStyle={{ fontWeight: '800', fontSize: 19 }}
          />
          <Text style={styles.fine}>
            {trial
              ? `${TRIAL_DAYS} days free, then ${money(plan.price)}/year. Renews automatically unless canceled at least 24 hours before the trial ends. Cancel anytime in Settings.`
              : `${money(plan.price)}/year. Renews automatically each year unless canceled at least 24 hours before renewal. Cancel anytime in Settings.`}
          </Text>
          <LegalRow onRestore={restore} restoring={restoring} />
        </View>
      </ScrollView>

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
            {TRIAL_DAYS} days free, then only {money(PLANS.annualOffer.price)} / year
          </Text>
          <Text style={styles.offerNoPay}>No payment now · Cancel anytime</Text>
          <Button
            testID="offer-accept"
            title="Start my free week"
            loading={offerLoading}
            onPress={() => purchase(PLANS.annualOffer.id, true, setOfferLoading)}
            style={{ marginTop: 40 }}
            textStyle={{ fontWeight: '800', fontSize: 19 }}
          />
          <Text style={[styles.fine, { marginTop: 10 }]}>
            Renews at {money(PLANS.annualOffer.price)}/year unless canceled at least 24 hours before the trial ends.
          </Text>
          <LegalRow />
          <Pressable
            testID="offer-decline"
            accessibilityRole="button"
            style={{ paddingVertical: 16 }}
            onPress={() => {
              setOffer(false);
              leave();
            }}
          >
            <Text style={styles.decline}>Decline one-time offer →</Text>
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
          <Text testID="restore" accessibilityRole="button" style={styles.legalLink} onPress={onRestore}>
            {restoring ? 'Restoring…' : 'Restore'}
          </Text>
          <Text style={styles.legalDot}>·</Text>
        </>
      ) : null}
      <Text accessibilityRole="link" style={styles.legalLink} onPress={() => Linking.openURL(TERMS_URL)}>
        Terms
      </Text>
      <Text style={styles.legalDot}>·</Text>
      <Text accessibilityRole="link" style={styles.legalLink} onPress={() => Linking.openURL(PRIVACY_URL)}>
        Privacy
      </Text>
    </View>
  );
}

function Carousel() {
  const ref = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const [index, setIndex] = useState(0);
  const dragging = useRef(false);

  useEffect(() => {
    const id = setInterval(() => {
      if (dragging.current) return;
      setIndex((i) => {
        const next = (i + 1) % SLIDES.length;
        ref.current?.scrollTo({ x: next * W, animated: true });
        return next;
      });
    }, 4200);
    return () => clearInterval(id);
  }, []);

  const onEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    dragging.current = false;
    setIndex(Math.round(e.nativeEvent.contentOffset.x / W));
  };

  return (
    <View style={{ marginTop: 28 }}>
      <ScrollView
        ref={ref}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScrollBeginDrag={() => (dragging.current = true)}
        onMomentumScrollEnd={onEnd}
        scrollEventThrottle={16}
      >
        {SLIDES.map((r) => (
          <View key={r.title} style={{ width: W, alignItems: 'center', paddingHorizontal: 40 }}>
            <Text style={styles.stars}>{r.emoji}</Text>
            <Text style={styles.authorName}>{r.title}</Text>
            <Text style={styles.review}>{r.text}</Text>
          </View>
        ))}
      </ScrollView>
      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <Dot key={i} active={i === index} />
        ))}
      </View>
    </View>
  );
}

function Dot({ active }: { active: boolean }) {
  const s = useAnimatedStyle(() => ({
    width: withTiming(active ? 24 : 8, { duration: 220 }),
    backgroundColor: active ? colors.purpleDark : '#D9D9DE',
  }));
  return <Animated.View style={[styles.dot, s]} />;
}

const styles = StyleSheet.create({
  top: { paddingHorizontal: 20, paddingTop: 12, height: 52, justifyContent: 'center' },
  title: { fontSize: 30, fontWeight: '800', textAlign: 'center', color: '#000', marginTop: 12, letterSpacing: -0.6 },
  stars: { fontSize: 26, letterSpacing: 4 },
  review: { fontSize: 16, lineHeight: 23, color: '#6E6E73', textAlign: 'center', marginTop: 10 },
  authorName: { fontSize: 17, fontWeight: '700', color: '#1B1B2A', marginTop: 16 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 24 },
  dot: { height: 8, borderRadius: 4 },
  bottom: { paddingHorizontal: 20, paddingBottom: 8 },
  trialRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, marginBottom: 16 },
  trialText: { fontSize: 17, fontWeight: '700', color: '#000' },
  planCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 2.5,
    borderColor: colors.lime,
    borderRadius: 40,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  planCheck: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' },
  planName: { fontSize: 19, fontWeight: '800', color: '#000' },
  planSub: { fontSize: 14, color: '#222', marginTop: 2 },
  planPrice: { fontSize: 22, color: '#000' },
  fine: { fontSize: 13, color: '#222', textAlign: 'center', marginTop: 12 },
  message: { fontSize: 13, color: colors.danger, textAlign: 'center', marginBottom: 12 },
  legal: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 8 },
  legalLink: { fontSize: 12, color: colors.textMuted, textDecorationLine: 'underline' },
  legalDot: { fontSize: 12, color: colors.textMuted },
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
  offerSub: { fontSize: 17, color: '#7A7A85', textAlign: 'center', marginTop: 14 },
  offerNoPay: { fontSize: 16, fontWeight: '800', color: '#7A7A85', textAlign: 'center', marginTop: 6 },
  decline: { fontSize: 16, color: '#7A7A85', textAlign: 'center' },
});
