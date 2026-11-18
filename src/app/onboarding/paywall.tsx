import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { BottomSheet } from '../../components/BottomSheet';
import { LegalSheet, type LegalDocId } from '../../components/LegalSheet';
import { Button, CloseButton, Screen } from '../../components/ui';
import { haptic } from '../../lib/haptics';
import { useStore } from '../../lib/store';
import {
  PLANS,
  PurchasesUnavailableError,
  TRIAL_DAYS,
  loadPrices,
  money,
  restorePurchases,
  startTrial,
  type PlanPrice,
} from '../../lib/subscription';
import { colors } from '../../theme';

const { width: W } = Dimensions.get('window');

// What the plan includes. (Testimonials and a "people joined today" count were removed: they were
// placeholders, and unverifiable reviews/counters are a rejection risk under App Store guidelines 2.3.1 / 5.6.
// Only add them back with real, verifiable data.)
const SLIDES = [
  { emoji: '🔎', title: 'Unlimited scans', text: 'Scan any barcode and instantly see if it fits your diet, allergies, and avoidances.' },
  { emoji: '📸', title: 'Ingredient photos', text: 'Product not in our database yet? Photograph the ingredient list and Tappy reads it for you.' },
  {
    emoji: '🥗',
    title: 'Personalized ratings',
    text: 'Every ingredient is rated against your dietary profile: can eat, limit this, or avoid.',
  },
  { emoji: '🔖', title: 'Lists', text: 'Save the products that work for you so your next grocery run is faster.' },
];

export default function Paywall() {
  const [prices, setPrices] = useState<Record<string, PlanPrice> | null>(null);
  const [legal, setLegal] = useState<LegalDocId | null>(null);
  const [loading, setLoading] = useState(false);
  const [offer, setOffer] = useState(false);
  const [offerLoading, setOfferLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const set = useStore((s) => s.set);
  const plan = PLANS.annual;
  const monthly = Math.floor((plan.price / 12) * 100) / 100;
  const mounted = useRef(true);
  useEffect(() => {
    loadPrices().then((p) => mounted.current && setPrices(p));
    return () => {
      mounted.current = false;
    };
  }, []);

  // Localized App Store prices once loaded; the USD fallbacks only show until then (or in dev builds without purchases).
  const annual = prices?.[plan.id];
  const offerPrice = prices?.[PLANS.annualOffer.id];
  const priceText = annual?.priceString ?? money(plan.price);
  const monthlyText = annual?.perMonthString ?? money(monthly);
  const offerPriceText = offerPrice?.priceString ?? money(PLANS.annualOffer.price);
  // Only promise a free trial Apple will actually give this Apple ID.
  const trial = annual ? annual.trialEligible : true;
  const trialDays = annual?.trialDays ?? TRIAL_DAYS;
  const offerTrial = offerPrice ? offerPrice.trialEligible : true;
  const offerTrialDays = offerPrice?.trialDays ?? TRIAL_DAYS;

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
    } catch (e) {
      if (!mounted.current) return;
      setMessage(
        e instanceof PurchasesUnavailableError
          ? 'Purchases aren’t available in this build. Install Tappy from the App Store or TestFlight.'
          : 'Something went wrong with the App Store. Please try again.',
      );
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
      } else setMessage('No active Tappy subscription was found for this Apple ID.');
    } catch {
      if (mounted.current) setMessage('Could not reach the App Store. Please try again.');
    } finally {
      if (mounted.current) setRestoring(false);
    }
  };

  return (
    <Screen>
      <View style={styles.top}>
        <CloseButton testID="paywall-close" onPress={() => setOffer(true)} size={30} color="#4A3C38" />
      </View>
      {/* Scrolls only when the screen is too short (iPhone SE) so the legal links stay reachable. */}
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        <Text style={styles.title} accessibilityRole="header">
          Choose your plan
        </Text>

        <Carousel />

        <View style={{ flex: 1 }} />

        <View style={styles.bottom}>
          {trial ? (
            <View style={styles.trialRow} accessible accessibilityLabel={`${trialDays}-day free trial activated`}>
              <Text style={styles.trialText}>{trialDays} Day Free Trial Activated</Text>
              <View style={styles.switchTrack}>
                <View style={styles.switchThumb} />
              </View>
            </View>
          ) : null}

          <View
            style={styles.planCard}
            accessible
            accessibilityRole="radio"
            accessibilityState={{ selected: true }}
            accessibilityLabel={`1 year plan, ${priceText} paid yearly, ${monthlyText} per month`}
          >
            <View style={styles.planCheck}>
              <Feather name="check" size={16} color={colors.onPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.planName}>{plan.label}</Text>
              <Text style={styles.planSub}>{priceText} paid yearly</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.planPrice}>{monthlyText}</Text>
              <Text style={styles.planSub}>/ month</Text>
            </View>
          </View>
          <View style={styles.pillArrow} />
          <View style={styles.pill}>
            <Text style={styles.pillText}>{trial ? 'No payment now · Cancel anytime' : 'Cancel anytime'}</Text>
          </View>

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
            style={{ borderRadius: 18, height: 62, marginTop: 24 }}
            textStyle={{ fontWeight: '800', fontSize: 20 }}
          />
          <Text style={styles.fineMain}>
            {trial
              ? `${trialDays} days free, then ${monthlyText}/month. Billed as ${priceText}/year`
              : `${monthlyText}/month. Billed as ${priceText}/year`}
          </Text>
          <Text style={styles.fine}>
            Renews automatically unless canceled at least 24 hours before {trial ? 'the trial ends' : 'renewal'}. Cancel anytime in Settings.
          </Text>
          <LegalRow onRestore={restore} restoring={restoring} onOpen={setLegal} />
        </View>
      </ScrollView>

      <BottomSheet
        visible={offer}
        onClose={() => setOffer(false)}
        style={{ borderTopLeftRadius: 60, borderTopRightRadius: 60 }}
        topAccessory={
          <View style={styles.ribbon}>
            <View style={styles.ribbonBackTop} />
            <View style={styles.ribbonBackBottom} />
            <View style={styles.ribbonFront}>
              <Text style={styles.ribbonText}>FREE TRIAL</Text>
            </View>
          </View>
        }
      >
        <Animated.View entering={FadeIn} style={styles.offer}>
          <Text style={styles.offerTitle} accessibilityRole="header">
            Before you go...
          </Text>
          <Text style={styles.offerSub}>
            {offerTrial ? `${offerTrialDays} days free, then only ${offerPriceText} / year` : `Only ${offerPriceText} / year`}
          </Text>
          {offerTrial ? <Text style={styles.offerNoPay}>No payment now</Text> : null}
          <Button
            testID="offer-accept"
            title={offerTrial ? 'Start my free week' : 'Claim this offer'}
            loading={offerLoading}
            onPress={() => purchase(PLANS.annualOffer.id, offerTrial, setOfferLoading)}
            style={{ marginTop: 48, height: 62, borderRadius: 31 }}
            textStyle={{ fontWeight: '800', fontSize: 20 }}
          />
          <Pressable
            testID="offer-decline"
            accessibilityRole="button"
            style={{ paddingVertical: 18 }}
            onPress={() => {
              setOffer(false);
              leave();
            }}
          >
            <Text style={styles.decline}>Decline one-time offer →</Text>
          </Pressable>
          <Text style={styles.offerFine}>
            Renews at {offerPriceText}/year unless canceled at least 24 hours before {offerTrial ? 'the trial ends' : 'renewal'}.
          </Text>
          <LegalRow onOpen={setLegal} />
        </Animated.View>
      </BottomSheet>
      <LegalSheet doc={legal} onClose={() => setLegal(null)} />
    </Screen>
  );
}

function LegalRow({ onRestore, restoring, onOpen }: { onRestore?: () => void; restoring?: boolean; onOpen: (doc: LegalDocId) => void }) {
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
      <Text accessibilityRole="link" style={styles.legalLink} onPress={() => onOpen('terms')}>
        Terms
      </Text>
      <Text style={styles.legalDot}>·</Text>
      <Text accessibilityRole="link" style={styles.legalLink} onPress={() => onOpen('privacy')}>
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
    backgroundColor: active ? colors.accentDark : '#D9D9DE',
  }));
  return <Animated.View style={[styles.dot, s]} />;
}

const styles = StyleSheet.create({
  top: { paddingHorizontal: 20, paddingTop: 12, height: 52, justifyContent: 'center' },
  title: { fontSize: 30, fontWeight: '800', textAlign: 'center', color: '#1F1513', marginTop: 12, letterSpacing: -0.6 },
  stars: { fontSize: 26, letterSpacing: 4 },
  review: { fontSize: 16, lineHeight: 23, color: colors.textMuted, textAlign: 'center', marginTop: 10 },
  authorName: { fontSize: 17, fontWeight: '700', color: colors.ink, marginTop: 16 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 24 },
  dot: { height: 8, borderRadius: 4 },
  bottom: { paddingHorizontal: 20, paddingBottom: 8 },
  trialRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 22 },
  trialText: { fontSize: 18, fontWeight: '700', color: '#1F1513' },
  switchTrack: { width: 56, height: 32, borderRadius: 16, backgroundColor: colors.accent, padding: 3, alignItems: 'flex-end' },
  switchThumb: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#fff' },
  planCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 2.5,
    borderColor: colors.primary,
    borderRadius: 40,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  planCheck: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  planName: { fontSize: 20, fontWeight: '800', color: '#1F1513' },
  planSub: { fontSize: 15, color: '#2A1F1C', marginTop: 2 },
  planPrice: { fontSize: 23, color: '#1F1513' },
  pillArrow: {
    alignSelf: 'center',
    marginTop: 8,
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderBottomWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: colors.accentSoft,
  },
  pill: { backgroundColor: colors.accentSoft, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  pillText: { fontSize: 15, fontWeight: '700', color: '#1F1513' },
  fineMain: { fontSize: 14, color: '#2A1F1C', textAlign: 'center', marginTop: 14 },
  fine: { fontSize: 11, color: colors.textMuted, textAlign: 'center', marginTop: 6 },
  message: { fontSize: 13, color: colors.danger, textAlign: 'center', marginBottom: 12 },
  legal: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 8 },
  legalLink: { fontSize: 12, color: colors.textMuted, textDecorationLine: 'underline' },
  legalDot: { fontSize: 12, color: colors.textMuted },
  ribbon: { width: 300, height: 110, alignItems: 'center', justifyContent: 'center' },
  ribbonBackTop: {
    position: 'absolute',
    width: 140,
    height: 56,
    backgroundColor: colors.primary,
    borderWidth: 3,
    borderColor: '#000',
    transform: [{ rotate: '-4deg' }, { translateX: 70 }, { translateY: -22 }],
  },
  ribbonBackBottom: {
    position: 'absolute',
    width: 140,
    height: 56,
    backgroundColor: colors.primary,
    borderWidth: 3,
    borderColor: '#000',
    transform: [{ rotate: '-4deg' }, { translateX: -50 }, { translateY: 24 }],
  },
  ribbonFront: {
    width: 260,
    height: 74,
    backgroundColor: colors.primary,
    borderWidth: 3.5,
    borderColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-4deg' }],
  },
  ribbonText: { fontSize: 32, fontWeight: '900', fontStyle: 'italic', color: colors.onPrimary, letterSpacing: 0.5 },
  offer: { paddingHorizontal: 24, paddingTop: 76, alignItems: 'stretch' },
  offerTitle: { fontSize: 36, fontWeight: '900', textAlign: 'center', color: '#1F1513', letterSpacing: -0.6 },
  offerSub: { fontSize: 18, color: colors.textMuted, textAlign: 'center', marginTop: 16 },
  offerNoPay: { fontSize: 17, fontWeight: '800', color: colors.textMuted, textAlign: 'center', marginTop: 4 },
  offerFine: { fontSize: 11, color: colors.textMuted, textAlign: 'center' },
  decline: { fontSize: 17, color: colors.textMuted, textAlign: 'center' },
});
