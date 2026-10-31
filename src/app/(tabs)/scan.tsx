import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Notifications from 'expo-notifications';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DEMO_PRODUCTS, type DemoProduct } from '../../components/art';
import { ProductSheet } from '../../components/ProductSheet';
import { Button, CloseButton, Logo } from '../../components/ui';
import { haptic } from '../../lib/haptics';
import { useStore } from '../../lib/store';

const TIPS = [
  { title: 'Barcode scanner', body: 'Scan barcodes to instantly check the ingredients/allergens for your Tapi profile(s).' },
  { title: 'Hold steady', body: 'Center the barcode inside the frame. Tapi scans automatically. No button needed.' },
  { title: 'Color ratings', body: 'Green means it likely fits, yellow means limit it, red means avoid. Tap any product for details.' },
  { title: 'Save favorites', body: 'Bookmark products you love to find them later in Lists.' },
];

export default function Scan() {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [focused, setFocused] = useState(true);
  const [tip, setTip] = useState(0);
  const [tipHidden, setTipHidden] = useState(false);
  const [product, setProduct] = useState<DemoProduct | null>(null);
  const [pushPrompt, setPushPrompt] = useState(false);
  const locked = useRef(false);
  const askedPush = useStore((s) => s.askedPush);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  // First visit: our own push pre-prompt, then the account prompt.
  useEffect(() => {
    if (askedPush) return;
    const t = setTimeout(() => setPushPrompt(true), 700);
    return () => clearTimeout(t);
  }, [askedPush]);

  // Ask for camera once the app is reached (system prompt), unless the push prompt is showing.
  useEffect(() => {
    if (!pushPrompt && permission && !permission.granted && permission.canAskAgain && askedPush && Platform.OS !== 'web') {
      requestPermission();
    }
  }, [pushPrompt, permission, askedPush, requestPermission]);

  const afterPush = () => {
    setPushPrompt(false);
    useStore.getState().set({ askedPush: true });
    const st = useStore.getState();
    if (!st.account && !st.accountPromptDismissed) {
      setTimeout(() => router.push({ pathname: '/auth', params: { mode: 'signup', prompt: '1' } }), 350);
    }
  };

  const onScanned = (r: BarcodeScanningResult) => {
    if (locked.current || product) return;
    locked.current = true;
    haptic.success();
    // Demo lookup: map any barcode to a sample product. Replace with your product API.
    const idx = Math.abs([...r.data].reduce((a, c) => a + c.charCodeAt(0), 0)) % DEMO_PRODUCTS.length;
    setProduct(DEMO_PRODUCTS[idx]);
  };

  const cameraReady = permission?.granted && focused;

  return (
    <View style={styles.root}>
      {cameraReady ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128'] }}
          onBarcodeScanned={product ? undefined : onScanned}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.noCam]} />
      )}

      <View style={[styles.logo, { top: insets.top + 6 }]}>
        <Logo size={34} color="#fff" />
      </View>

      {!tipHidden ? (
        <Animated.View entering={FadeIn} style={[styles.tip, { top: insets.top + 64 }]}>
          <View style={styles.tipHead}>
            <Text style={styles.tipTitle}>{TIPS[tip].title}</Text>
            <Pressable accessibilityLabel="Hide tips" hitSlop={10} onPress={() => setTipHidden(true)}>
              <Text style={styles.tipClose}>✕</Text>
            </Pressable>
          </View>
          <Pressable onPress={() => setTip((t) => (t + 1) % TIPS.length)}>
            <Text style={styles.tipBody}>{TIPS[tip].body}</Text>
          </Pressable>
          <View style={styles.tipFoot}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {TIPS.map((_, i) => (
                <Pressable key={i} hitSlop={6} onPress={() => setTip(i)}>
                  <View style={[styles.tipDot, i === tip && { backgroundColor: '#fff' }]} />
                </Pressable>
              ))}
            </View>
            <Pressable
              testID="try-demo"
              accessibilityRole="button"
              hitSlop={10}
              onPress={() => {
                haptic.light();
                setProduct(DEMO_PRODUCTS[4]);
              }}
            >
              <Text style={styles.tipCta}>TRY A DEMO</Text>
            </Pressable>
          </View>
          <View style={styles.tipArrow} />
        </Animated.View>
      ) : null}

      <View style={styles.frameWrap} pointerEvents="none">
        <View style={styles.frame} />
      </View>

      {!permission?.granted ? (
        <View style={[styles.permission, { bottom: 32 }]}>
          <Text style={styles.permText}>
            {Platform.OS === 'web' ? 'Camera scanning works in the iOS app.' : 'Allow camera access to scan barcodes.'}
          </Text>
          <Button
            title={permission && !permission.canAskAgain ? 'Open Settings' : 'Allow camera'}
            variant="primary"
            onPress={() => (permission && !permission.canAskAgain ? Linking.openSettings() : requestPermission())}
            style={{ alignSelf: 'stretch' }}
          />
        </View>
      ) : null}

      <ProductSheet
        product={product}
        onClose={() => {
          setProduct(null);
          setTimeout(() => (locked.current = false), 600);
        }}
        onScanAgain={() => {
          setProduct(null);
          setTimeout(() => (locked.current = false), 600);
        }}
      />

      <Modal transparent visible={pushPrompt} animationType="fade" onRequestClose={afterPush}>
        <View style={styles.modalBackdrop}>
          <Animated.View entering={ZoomIn.springify().damping(16)} style={styles.modal}>
            <View style={styles.modalClose}>
              <CloseButton onPress={afterPush} size={28} />
            </View>
            <Text style={styles.modalTitle}>Don't miss out! Enable push notifications.</Text>
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
  permission: { position: 'absolute', left: 16, right: 16, alignItems: 'center', gap: 12 },
  permText: { color: '#fff', fontSize: 15, textAlign: 'center' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', paddingHorizontal: 24 },
  modal: { backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 24, paddingTop: 40, paddingBottom: 36 },
  modalClose: { position: 'absolute', right: 14, top: 14 },
  modalTitle: { fontSize: 25, lineHeight: 33, textAlign: 'center', color: '#111' },
  modalBody: { fontSize: 18, lineHeight: 27, textAlign: 'center', color: '#111', marginTop: 16 },
});
