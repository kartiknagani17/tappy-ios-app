import React, { useEffect, useState } from 'react';
import { Dimensions, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';

const SCREEN_H = Dimensions.get('window').height;

type Props = {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** show the small grabber at the top */
  handle?: boolean;
  /** fraction of screen height the sheet may take */
  maxHeight?: number;
  /** take full height (page-style sheet) */
  full?: boolean;
  style?: ViewStyle;
  /** disallow dismissing by tapping backdrop / swiping */
  locked?: boolean;
  /** extra content rendered above the sheet (e.g. ribbon) */
  topAccessory?: React.ReactNode;
  padBottom?: boolean;
};

export function BottomSheet({
  visible,
  onClose,
  children,
  handle = false,
  maxHeight = 0.9,
  full = false,
  style,
  locked = false,
  topAccessory,
  padBottom = true,
}: Props) {
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(0);
  const drag = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      // Mount first, then animate in. Unmount after the exit animation finishes.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMounted(true);
      drag.set(0);
      progress.set(withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) }));
    } else if (mounted) {
      progress.set(
        withTiming(0, { duration: 240, easing: Easing.in(Easing.cubic) }, (done) => {
          if (done) runOnJS(setMounted)(false);
        }),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const pan = Gesture.Pan()
    .enabled(!locked)
    .activeOffsetY(8)
    .onUpdate((e) => {
      drag.set(Math.max(0, e.translationY));
    })
    .onEnd((e) => {
      if (e.translationY > 120 || e.velocityY > 900) {
        runOnJS(onClose)();
      } else {
        drag.set(withTiming(0, { duration: 180 }));
      }
    });

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * SCREEN_H + drag.value }],
  }));

  if (!mounted) return null;

  return (
    <Modal transparent visible={mounted} animationType="none" onRequestClose={locked ? undefined : onClose} statusBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.backdrop }, backdropStyle]}>
          <Pressable accessibilityLabel="Dismiss" style={{ flex: 1 }} onPress={locked ? undefined : onClose} />
        </Animated.View>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.anchor} pointerEvents="box-none">
          <GestureDetector gesture={pan}>
            <Animated.View
              style={[
                styles.sheet,
                full ? { height: SCREEN_H - insets.top - 24 } : { maxHeight: SCREEN_H * maxHeight },
                padBottom && { paddingBottom: Math.max(insets.bottom, 16) },
                sheetStyle,
                style,
              ]}
            >
              {topAccessory ? (
                <View style={styles.accessory} pointerEvents="none">
                  {topAccessory}
                </View>
              ) : null}
              {handle ? <View style={styles.handle} /> : null}
              {children}
            </Animated.View>
          </GestureDetector>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  anchor: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'visible',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E2E2E6',
    marginTop: 8,
    marginBottom: 4,
  },
  accessory: { position: 'absolute', top: -56, left: 0, right: 0, alignItems: 'center', zIndex: 2 },
});
