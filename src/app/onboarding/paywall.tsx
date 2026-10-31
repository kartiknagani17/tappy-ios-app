import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  Linking,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
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
import { JOINED_TODAY, PLANS, PRIVACY_URL, TERMS_URL, TRIAL_DAYS, money, restorePurchases, startTrial } from '../../lib/subscription';
import { colors, radius } from '../../theme';

const { width: W } = Dimensions.get('window');

// Placeholder testimonials. Replace with real, verifiable App Store reviews before launch.
const REVIEWS = [
  {
    name: 'Emily C.',
    color: '#F6C9B6',
    text: 'I use this every single day. The quick barcode scan and ingredients save me so much time. I discovered so many safe, tasty products thanks to it!',
  },
  {
    name: 'Michael S.',
    color: '#B6D7F6',
    text: "Love this app! I can scan anything and instantly know if it fits my diet. It's made grocery shopping so much easier.",
  },
  {
    name: 'Sarah T.',
    color: '#D9C8F5',
    text: "Tapi has made eating healthy so simple! I just scan, and I know right away if it works for me. It's like having a personal nutrition coach in my pocket.",
  },
  {
    name: 'Caroline M.',
    color: '#F5E3A8',
    text: "I can't imagine shopping without this app anymore. It helps me find the right foods fast, and I feel so much more confident about every choice.",
  },
];

export default function Paywall() {
  const [trial, setTrial] = useState(true);
  const [loading, setLoading] = useState(false);
  const [offer, setOffer] = useState(false);
  const [offerLoading, setOfferLoading] = useState(false);
  const set = useStore((s) => s.set);
  const plan = PLANS.annual;
  const monthly = Math.floor((plan.price / 12) * 100) / 100;

  const purchase = async (productId: string, withTrial: boolean, setBusy: (b: boolean) => void) => {
    setBusy(true);
    try {
      const ok = await startTrial(productId, withTrial);
      if (ok) {
        haptic.success();
        set({ trialActive: true });
        setOffer(false);
        router.replace('/onboarding/safety');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View style={styles.top}>
        <CloseButton testID="paywall-close" onPress={() => setOffer(true)} size={30} color="#4A4A5A" />
      </View>
      <Text style={styles.title}>Choose your plan</Text>

      <Carousel />

      <View style={{ flex: 1 }} />

      <View style={styles.bottom}>
        <View style={styles.trialRow}>
          <Text style={styles.trialText}>{trial ? `${TRIAL_DAYS} Day Free Trial Activated` : 'Enable free trial'}</Text>
          <Switch
            testID="trial-toggle"
            value={trial}
            onValueChange={(v) => {
              haptic.select();
              setTrial(v);
            }}
            trackColor={{ true: colors.purpleDark, false: '#D1D1D6' }}
            ios_backgroundColor="#D1D1D6"
          />
        </View>

        <View style={styles.planCard} accessibilityRole="radio" accessibilityState={{ selected: true }}>
          <View style={styles.planCheck}>
            <Feather name="check" size={16} color={colors.ink} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.planName}>{plan.label}</Text>
            <Text style={styles.planSub}>{money(plan.price)} paid yearly</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.planPrice}>{money(monthly)}</Text>
            <Text style={styles.planSub}>/ month</Text>
          </View>
        </View>
        <View style={styles.tipArrow} />
        <View style={styles.tip}>
          <Text style={styles.tipText}>{JOINED_TODAY.toLocaleString()} people have joined this plan today!</Text>
        </View>

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
            ? `${TRIAL_DAYS} days free, then ${money(monthly)}/month. Billed as ${money(plan.price)}/year`
            : `${money(monthly)}/month. Billed as ${money(plan.price)}/year`}
        </Text>
        <LegalRow />
      </View>

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
          <Text style={styles.offerNoPay}>No payment now</Text>
          <Button
            testID="offer-accept"
            title="Start my free week"
            loading={offerLoading}
            onPress={() => purchase(PLANS.annualOffer.id, true, setOfferLoading)}
            style={{ marginTop: 40 }}
            textStyle={{ fontWeight: '800', fontSize: 19 }}
          />
          <Pressable
            testID="offer-decline"
            accessibilityRole="button"
            style={{ paddingVertical: 16 }}
            onPress={() => {
              setOffer(false);
              router.replace('/onboarding/safety');
            }}
          >
            <Text style={styles.decline}>Decline one-time offer →</Text>
          </Pressable>
        </Animated.View>
      </BottomSheet>
    </Screen>
  );
}

function LegalRow() {
  return (
    <View style={styles.legal}>
      <Text
        style={styles.legalLink}
        onPress={async () => {
          const restored = await restorePurchases();
          if (Platform.OS !== 'web')
            Alert.alert(
              restored ? 'Purchases restored' : 'No purchases found',
              restored ? '' : 'We couldn’t find an active Tapi subscription for this Apple ID.',
            );
        }}
      >
        Restore
      </Text>
      <Text style={styles.legalDot}>·</Text>
      <Text style={styles.legalLink} onPress={() => Linking.openURL(TERMS_URL)}>
        Terms
      </Text>
      <Text style={styles.legalDot}>·</Text>
      <Text style={styles.legalLink} onPress={() => Linking.openURL(PRIVACY_URL)}>
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
        const next = (i + 1) % REVIEWS.length;
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
        {REVIEWS.map((r) => (
          <View key={r.name} style={{ width: W, alignItems: 'center', paddingHorizontal: 40 }}>
            <Text style={styles.stars}>⭐⭐⭐⭐⭐</Text>
            <Text style={styles.review}>{r.text}</Text>
            <View style={styles.author}>
              <View style={[styles.avatar, { backgroundColor: r.color }]}>
                <Text style={styles.avatarText}>{r.name[0]}</Text>
              </View>
              <Text style={styles.authorName}>{r.name}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
      <View style={styles.dots}>
        {REVIEWS.map((_, i) => (
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
  review: { fontSize: 16, lineHeight: 23, color: '#7A7A7F', textAlign: 'center', marginTop: 20 },
  author: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 18 },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontWeight: '700', fontSize: 17, color: '#333' },
  authorName: { fontSize: 17, fontWeight: '700', color: '#1B1B2A' },
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
  tipArrow: {
    alignSelf: 'center',
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderBottomWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#DCD6F3',
    marginTop: 8,
  },
  tip: { backgroundColor: '#DCD6F3', borderRadius: radius.md, paddingVertical: 11, alignItems: 'center', marginBottom: 18 },
  tipText: { fontSize: 14, fontWeight: '700', color: '#111' },
  fine: { fontSize: 13, color: '#222', textAlign: 'center', marginTop: 12 },
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
