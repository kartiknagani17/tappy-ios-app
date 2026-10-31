import { Feather } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Notifications from 'expo-notifications';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DEMO_PRODUCTS } from '../../components/art';
import { BottomSheet } from '../../components/BottomSheet';
import { MatchSheet } from '../../components/MatchSheet';
import { Button, CloseButton, Logo } from '../../components/ui';
import { VerdictSheet } from '../../components/VerdictSheet';
import { api, ApiError, prepareUpload, type ApiProduct, type FrontResult } from '../../lib/api';
import { haptic } from '../../lib/haptics';
import { useStore } from '../../lib/store';
import { colors, noOutline, radius } from '../../theme';

type Mode = 'barcode' | 'front' | 'label';
type Match = Extract<FrontResult, { status: 'match' }>;
type Prompt = { title: string; body: string; actions: ('barcode' | 'front' | 'label' | 'retry' | 'upgrade')[] };

const TIPS = [
  { title: 'Barcode scanner', body: 'Scan barcodes to instantly check the ingredients/allergens for your Tapi profile(s).' },
  { title: 'No barcode handy?', body: 'Switch to Photo and snap the front of the package. You’ll confirm the match before we check it.' },
  { title: 'Color ratings', body: 'Red means it has something you avoid, yellow means something you limit. Always check the package too.' },
  { title: 'Missing product?', body: 'Photograph the ingredient list and Tapi will read it for you right away.' },
];

const MODE_HINT: Record<Mode, string> = {
  barcode: 'Center the barcode in the frame',
  front: 'Snap the front of the package',
  label: 'Fit the whole ingredient list in the frame',
};

/** Same barcode seen again within this window is ignored (camera fires many callbacks per second). */
const SAME_CODE_COOLDOWN_MS = 2500;
const VALID_LENGTHS = [8, 12, 13, 14];
const nowMs = () => Date.now();

/** Push pre-prompt is done (or not needed): continue to the one-time account prompt. */
function markPushAsked() {
  useStore.getState().set({ askedPush: true });
  const st = useStore.getState();
  if (!st.account && !st.accountPromptDismissed) {
    setTimeout(() => router.push({ pathname: '/auth', params: { mode: 'signup', prompt: '1' } }), 350);
  }
}

const demoProduct = (): ApiProduct => {
  const p = DEMO_PRODUCTS[4];
  return {
    id: null,
    gtin14: '',
    name: p.name,
    brand: 'Market',
    variant_or_flavor: null,
    size_text: '1.5 qt',
    ingredients_text: p.ingredients.join(', '),
    allergens_text: 'Contains: milk.',
    nutrition: null,
    category: 'Ice cream',
    image_url: null,
    source: 'off',
    source_updated_at: null,
    verified: true,
    under_review: false,
  };
};

export default function Scan() {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [focused, setFocused] = useState(true);
  const [tip, setTip] = useState(0);
  const [tipHidden, setTipHidden] = useState(false);
  const [pushPrompt, setPushPrompt] = useState(false);
  const askedPush = useStore((s) => s.askedPush);

  const camera = useRef<CameraView>(null);
  const locked = useRef(false);
  const [mode, setMode] = useState<Mode>('barcode');
  const [labelCtx, setLabelCtx] = useState<{ gtin: string | null; frontHash: string | null }>({ gtin: null, frontHash: null });
  const [busy, setBusy] = useState<string | null>(null);
  const [match, setMatch] = useState<Match | null>(null);
  const [verdict, setVerdict] = useState<{ product: ApiProduct; demo?: boolean } | null>(null);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const lastFrontHash = useRef<string | null>(null);
  const lastCode = useRef<{ code: string; at: number } | null>(null);
  const shooting = useRef(false);
  const [manual, setManual] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  // First visit: our own push pre-prompt, then the account prompt.
  useEffect(() => {
    if (askedPush) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      if (Platform.OS !== 'web') {
        // Only pre-prompt when the system prompt can actually still be shown.
        const p = await Notifications.getPermissionsAsync().catch(() => null);
        if (cancelled) return;
        if (p && p.status !== 'undetermined') {
          markPushAsked();
          return;
        }
      }
      if (!cancelled) setPushPrompt(true);
    }, 700);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [askedPush]);

  // Ask for camera once the app is reached (system prompt), unless the push prompt is showing.
  useEffect(() => {
    if (!pushPrompt && permission && !permission.granted && permission.canAskAgain && askedPush && Platform.OS !== 'web') {
      requestPermission();
    }
  }, [pushPrompt, permission, askedPush, requestPermission]);

  const afterPush = () => {
    setPushPrompt(false);
    markPushAsked();
  };

  const unlock = () => setTimeout(() => (locked.current = false), 700);
  const reset = () => {
    if (lastCode.current) lastCode.current.at = nowMs();
    setVerdict(null);
    setMatch(null);
    setPrompt(null);
    setMode('barcode');
    unlock();
  };

  const fail = (e: unknown) => {
    haptic.warning();
    if (e instanceof ApiError && e.code === 'daily_limit_reached') {
      setPrompt({ title: 'Daily free scans used', body: e.message + ' Start your free trial for unlimited scans.', actions: ['upgrade'] });
    } else if (e instanceof ApiError && e.code === 'rate_limited') {
      setPrompt({ title: 'Slow down a little', body: 'Too many scans in a short time. Try again in a minute.', actions: ['retry'] });
    } else {
      setPrompt({
        title: 'Something went wrong',
        body: e instanceof Error ? e.message : 'Please try again.',
        actions: ['retry'],
      });
    }
  };

  const goLabel = (gtin: string | null, frontHash: string | null) => {
    setVerdict(null);
    setMatch(null);
    setPrompt(null);
    setLabelCtx({ gtin, frontHash });
    setMode('label');
    unlock();
  };

  // ---- barcode (no vision call ever happens on this path) ----
  const onScanned = (r: BarcodeScanningResult) => {
    if (locked.current || mode !== 'barcode') return;
    const now = nowMs();
    const prev = lastCode.current;
    if (prev && prev.code === r.data && now - prev.at < SAME_CODE_COOLDOWN_MS) {
      // Still pointing at the product we just showed: keep suppressing until it leaves the frame.
      prev.at = now;
      return;
    }
    lastCode.current = { code: r.data, at: now };
    lookupBarcode(r.data);
  };

  const lookupBarcode = async (code: string) => {
    if (locked.current) return;
    locked.current = true;
    haptic.success();
    lastFrontHash.current = null;
    setBusy('Looking up product…');
    try {
      const res = await api.scanBarcode(code);
      if (res.status === 'found') setVerdict({ product: res.product });
      else if (res.status === 'needs_label_photo') {
        setLabelCtx({ gtin: res.gtin14, frontHash: null });
        setPrompt({
          title: 'We don’t know this one yet',
          body: 'Take a photo of the ingredient list and we’ll read it for you right now.',
          actions: ['label', 'retry'],
        });
      } else
        setPrompt({
          title: 'Couldn’t read that barcode',
          body: 'Hold steady and make sure the whole barcode is in the frame.',
          actions: ['retry', 'front'],
        });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
      // Restart the same-code cooldown from when the result was shown.
      if (lastCode.current) lastCode.current.at = nowMs();
    }
  };

  // ---- photos (front of package / ingredient panel) ----
  const takePhoto = async () => {
    if (!camera.current || busy || shooting.current) return;
    shooting.current = true;
    haptic.medium();
    try {
      setBusy(mode === 'front' ? 'Reading the package…' : 'Reading the ingredients…');
      const pic = await camera.current.takePictureAsync({ quality: 0.8, skipProcessing: false });
      const base64 = await prepareUpload(pic.uri, pic.width, pic.height);
      if (mode === 'front') {
        const res = await api.scanFront(base64);
        lastFrontHash.current = res.front_hash;
        // A label photo taken next belongs to this front photo, not to any earlier barcode.
        setLabelCtx({ gtin: null, frontHash: res.front_hash });
        if (res.status === 'match') setMatch(res);
        else if (res.status === 'needs_barcode_or_label')
          setPrompt({ title: 'Not sure which product this is', body: res.message, actions: ['barcode', 'label'] });
        else
          setPrompt({
            title: res.status === 'not_food_package' ? 'That doesn’t look like food' : 'Couldn’t read the photo',
            body: res.message,
            actions: ['front', 'barcode'],
          });
      } else {
        const res = await api.scanLabel(base64, labelCtx);
        if (res.status === 'unreadable') setPrompt({ title: 'Couldn’t read the ingredients', body: res.message, actions: ['label'] });
        else {
          haptic.success();
          setMode('barcode');
          setVerdict({ product: res.product });
        }
      }
    } catch (e) {
      fail(e);
    } finally {
      shooting.current = false;
      setBusy(null);
    }
  };

  const onPromptAction = (a: Prompt['actions'][number]) => {
    setPrompt(null);
    if (a === 'label') return goLabel(labelCtx.gtin, labelCtx.frontHash);
    if (a === 'upgrade') return router.push('/onboarding/paywall');
    if (a === 'front' || a === 'barcode') setMode(a);
    unlock();
  };

  const cameraReady = permission?.granted && focused;
  const photoMode = mode !== 'barcode';

  return (
    <View style={styles.root}>
      {cameraReady ? (
        <CameraView
          ref={camera}
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
          onBarcodeScanned={mode === 'barcode' && !verdict && !match && !prompt && !busy ? onScanned : undefined}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.noCam]} />
      )}

      <View style={[styles.logo, { top: insets.top + 6 }]}>
        <Logo size={34} color="#fff" />
      </View>

      {!tipHidden && mode === 'barcode' ? (
        <Animated.View entering={FadeIn} style={[styles.tip, { top: insets.top + 64 }]}>
          <View style={styles.tipHead}>
            <Text style={styles.tipTitle}>{TIPS[tip].title}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Hide tips" hitSlop={14} onPress={() => setTipHidden(true)}>
              <Text style={styles.tipClose}>✕</Text>
            </Pressable>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${TIPS[tip].body} Next tip`}
            onPress={() => setTip((t) => (t + 1) % TIPS.length)}
          >
            <Text style={styles.tipBody}>{TIPS[tip].body}</Text>
          </Pressable>
          <View style={styles.tipFoot}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {TIPS.map((_, i) => (
                <Pressable
                  key={i}
                  accessibilityRole="button"
                  accessibilityLabel={`Tip ${i + 1} of ${TIPS.length}`}
                  accessibilityState={{ selected: i === tip }}
                  hitSlop={10}
                  onPress={() => setTip(i)}
                >
                  <View style={[styles.tipDot, i === tip && { backgroundColor: '#fff' }]} />
                </Pressable>
              ))}
            </View>
            <Pressable
              testID="try-demo"
              accessibilityRole="button"
              accessibilityLabel="Try a demo scan"
              hitSlop={12}
              onPress={() => {
                haptic.light();
                locked.current = true;
                setVerdict({ product: demoProduct(), demo: true });
              }}
            >
              <Text style={styles.tipCta}>TRY A DEMO</Text>
            </Pressable>
          </View>
          <View style={styles.tipArrow} />
        </Animated.View>
      ) : null}

      <View style={styles.frameWrap} pointerEvents="none">
        <View style={[styles.frame, photoMode && styles.framePhoto]} />
        <Text style={styles.hint}>{MODE_HINT[mode]}</Text>
      </View>

      {permission?.granted ? (
        <View style={[styles.controls, { bottom: 18 }]}>
          {mode === 'label' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel ingredient photo"
              style={styles.labelBanner}
              onPress={() => setMode('barcode')}
            >
              <Feather name="file-text" size={16} color="#fff" />
              <Text style={styles.labelBannerText}>Ingredient photo · tap to cancel</Text>
            </Pressable>
          ) : (
            <View style={styles.segment}>
              {(['barcode', 'front'] as const).map((m) => (
                <Pressable
                  key={m}
                  testID={`mode-${m}`}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: mode === m }}
                  accessibilityLabel={m === 'barcode' ? 'Barcode' : 'Photo'}
                  hitSlop={{ top: 4, bottom: 4 }}
                  onPress={() => {
                    haptic.select();
                    setMode(m);
                  }}
                  style={[styles.segBtn, mode === m && styles.segBtnOn]}
                >
                  <Feather name={m === 'barcode' ? 'maximize' : 'camera'} size={15} color={mode === m ? colors.ink : '#fff'} />
                  <Text style={[styles.segText, mode === m && { color: colors.ink }]}>{m === 'barcode' ? 'Barcode' : 'Photo'}</Text>
                </Pressable>
              ))}
            </View>
          )}
          {mode === 'barcode' ? <ManualEntryButton onPress={() => setManual(true)} /> : null}
          {photoMode ? (
            <Pressable
              testID="shutter"
              accessibilityRole="button"
              accessibilityLabel="Take photo"
              onPress={takePhoto}
              style={styles.shutter}
            >
              <View style={styles.shutterInner} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {permission && !permission.granted ? (
        <View style={[styles.permission, { bottom: 32 }]}>
          <Text style={styles.permText}>
            {Platform.OS === 'web' ? 'Camera scanning works in the iOS app.' : 'Allow camera access to scan barcodes.'}
          </Text>
          <Button
            title={!permission.canAskAgain ? 'Open Settings' : 'Allow camera'}
            variant="primary"
            onPress={() => (!permission.canAskAgain ? Linking.openSettings() : requestPermission())}
            style={{ alignSelf: 'stretch' }}
          />
          <ManualEntryButton onPress={() => setManual(true)} />
        </View>
      ) : null}

      {busy ? (
        <View style={styles.busy} pointerEvents="auto">
          <ActivityIndicator color="#fff" size="large" />
          <Text style={styles.busyText}>{busy}</Text>
        </View>
      ) : null}

      <ManualBarcodeSheet
        visible={manual}
        onClose={() => setManual(false)}
        onSubmit={(code) => {
          setManual(false);
          setMode('barcode');
          lastCode.current = { code, at: nowMs() };
          // Let the sheet close before the result sheet opens.
          setTimeout(() => lookupBarcode(code), 300);
        }}
      />

      <MatchSheet
        match={match}
        onClose={reset}
        onScanBarcode={() => {
          setMatch(null);
          setMode('barcode');
          unlock();
        }}
        onPhotographLabel={() => goLabel(null, match?.front_hash ?? null)}
        onConfirm={async (product) => {
          const m = match;
          setMatch(null);
          setVerdict({ product });
          // Remember the choice so a repeat photo of this package pre-selects it.
          if (m && product.id !== null) api.confirmFront(m.vision_cache_id, product.id).catch(() => {});
        }}
      />

      <VerdictSheet
        product={verdict?.product ?? null}
        demo={verdict?.demo}
        onClose={reset}
        onScanAgain={reset}
        onPhotographLabel={(gtin) => goLabel(gtin, gtin ? null : lastFrontHash.current)}
      />

      <BottomSheet visible={!!prompt} onClose={reset} handle>
        {prompt ? (
          <View style={{ paddingHorizontal: 16, gap: 10 }}>
            <Text style={styles.promptTitle}>{prompt.title}</Text>
            <Text style={styles.promptBody}>{prompt.body}</Text>
            {prompt.actions.map((a, i) => (
              <Button
                key={a}
                variant={i === 0 ? 'primary' : 'outline'}
                title={
                  {
                    label: 'Photograph ingredient list',
                    barcode: 'Scan the barcode',
                    front: 'Photograph the front',
                    retry: 'Try again',
                    upgrade: 'See plans',
                  }[a]
                }
                onPress={() => onPromptAction(a)}
              />
            ))}
          </View>
        ) : null}
      </BottomSheet>

      <Modal transparent visible={pushPrompt} animationType="fade" onRequestClose={afterPush}>
        <View style={styles.modalBackdrop}>
          <Animated.View entering={ZoomIn.springify().damping(16)} style={styles.modal}>
            <View style={styles.modalClose}>
              <CloseButton testID="push-no" onPress={afterPush} size={28} />
            </View>
            <Text style={styles.modalTitle} accessibilityRole="header">
              Don't miss out! Enable push notifications.
            </Text>
            <Text style={styles.modalBody}>We like giving away free stuff and adding new features 😀</Text>
            <Text style={styles.modalBody}>Do you want to hear about them?</Text>
            <Button
              testID="push-yes"
              title="Yes, I'm in!"
              variant="purple"
              style={{ borderRadius: 6, marginTop: 24, backgroundColor: '#7452F5' }}
              textStyle={{ fontWeight: '500', fontSize: 22 }}
              onPress={async () => {
                if (Platform.OS !== 'web') {
                  try {
                    const p = await Notifications.getPermissionsAsync();
                    if (p.status === 'undetermined') await Notifications.requestPermissionsAsync();
                    else if (p.status === 'denied') Linking.openSettings();
                  } catch {
                    // ignore
                  }
                }
                afterPush();
              }}
            />
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  noCam: { backgroundColor: '#2A2622' },
  logo: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  tip: {
    position: 'absolute',
    left: 12,
    right: 12,
    backgroundColor: '#1C1C1E',
    borderRadius: 14,
    padding: 18,
  },
  tipHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tipTitle: { color: '#fff', fontSize: 20, fontWeight: '600' },
  tipClose: { color: '#999', fontSize: 16 },
  tipBody: { color: '#fff', fontSize: 16, lineHeight: 24, marginTop: 10 },
  tipFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 },
  tipDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#666' },
  tipCta: { color: '#fff', fontWeight: '600', fontSize: 16, letterSpacing: 0.3 },
  tipArrow: {
    position: 'absolute',
    bottom: -10,
    alignSelf: 'center',
    left: '50%',
    marginLeft: -10,
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderTopWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#1C1C1E',
  },
  frameWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  frame: {
    width: 240,
    height: 240,
    borderWidth: 4,
    borderColor: '#fff',
    borderTopLeftRadius: 60,
    borderBottomRightRadius: 60,
    borderTopRightRadius: 4,
    borderBottomLeftRadius: 4,
  },
  framePhoto: { width: 290, height: 360, borderRadius: 24, borderTopLeftRadius: 24, borderBottomRightRadius: 24 },
  hint: { color: '#fff', fontSize: 15, fontWeight: '600', marginTop: 16, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 6 },
  controls: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: 16 },
  segment: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: radius.pill, padding: 4 },
  segBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18, height: 38, borderRadius: radius.pill },
  segBtnOn: { backgroundColor: colors.lime },
  segText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  shutter: { width: 76, height: 76, borderRadius: 38, borderWidth: 5, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#fff' },
  labelBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    height: 38,
  },
  labelBannerText: { color: '#fff', fontWeight: '600' },
  busy: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', gap: 14 },
  busyText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  promptTitle: { fontSize: 22, fontWeight: '600', color: colors.ink, marginTop: 6 },
  promptBody: { fontSize: 15, lineHeight: 22, color: colors.text, marginBottom: 8 },
  permission: { position: 'absolute', left: 16, right: 16, alignItems: 'center', gap: 12 },
  permText: { color: '#fff', fontSize: 15, textAlign: 'center' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', paddingHorizontal: 24 },
  modal: { backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 24, paddingTop: 40, paddingBottom: 36 },
  modalClose: { position: 'absolute', right: 14, top: 14 },
  modalTitle: { fontSize: 25, lineHeight: 33, textAlign: 'center', color: '#111' },
  modalBody: { fontSize: 18, lineHeight: 27, textAlign: 'center', color: '#111', marginTop: 16 },
  manualBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    height: 38,
  },
  manualText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  manualSheet: { paddingHorizontal: 16, gap: 12 },
  manualInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    height: 56,
    paddingHorizontal: 16,
    fontSize: 20,
    letterSpacing: 1.5,
    color: colors.ink,
  },
  manualError: { fontSize: 14, color: colors.danger },
});

function ManualEntryButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      testID="manual-entry"
      accessibilityRole="button"
      accessibilityLabel="Type a barcode number"
      hitSlop={{ top: 4, bottom: 4 }}
      onPress={() => {
        haptic.select();
        onPress();
      }}
      style={styles.manualBtn}
    >
      <Feather name="hash" size={16} color="#fff" />
      <Text style={styles.manualText}>Type barcode number</Text>
    </Pressable>
  );
}

/** Fallback when the camera is unavailable, denied, or can't read a damaged barcode. */
function ManualBarcodeSheet({ visible, onClose, onSubmit }: { visible: boolean; onClose: () => void; onSubmit: (code: string) => void }) {
  return (
    <BottomSheet visible={visible} onClose={onClose} handle>
      {/* Remount on open so the field starts empty. */}
      {visible ? <ManualBarcodeBody onClose={onClose} onSubmit={onSubmit} /> : null}
    </BottomSheet>
  );
}

function ManualBarcodeBody({ onClose, onSubmit }: { onClose: () => void; onSubmit: (code: string) => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const digits = code.replace(/\D/g, '');
  const submit = () => {
    if (!VALID_LENGTHS.includes(digits.length)) {
      setError('Barcodes are 8, 12, 13 or 14 digits. Check the numbers under the bars.');
      return;
    }
    onSubmit(digits);
  };
  return (
    <View style={styles.manualSheet}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={styles.promptTitle} accessibilityRole="header">
          Type the barcode
        </Text>
        <CloseButton onPress={onClose} />
      </View>
      <Text style={styles.promptBody}>Enter the numbers printed under the barcode on the package.</Text>
      <TextInput
        testID="manual-barcode-input"
        accessibilityLabel="Barcode number"
        value={code}
        onChangeText={(t) => {
          setCode(t.replace(/[^\d ]/g, ''));
          setError(null);
        }}
        placeholder="e.g. 012345678905"
        placeholderTextColor={colors.textSubtle}
        keyboardType="number-pad"
        returnKeyType="search"
        maxLength={18}
        autoFocus
        onSubmitEditing={submit}
        style={[styles.manualInput, noOutline]}
      />
      {error ? (
        <Text style={styles.manualError} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <Button testID="manual-barcode-submit" title="Look up product" disabled={digits.length < 8} onPress={submit} />
    </View>
  );
}
