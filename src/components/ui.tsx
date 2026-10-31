import { Feather, Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect } from 'react';
import { ActivityIndicator, Pressable, type PressableProps, StyleSheet, Text, type TextStyle, View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { haptic } from '../lib/haptics';
import type { Rating } from '../lib/store';
import { colors, radius, type } from '../theme';

// ---------- Logo ----------
export function Logo({ size = 40, color = colors.ink }: { size?: number; color?: string }) {
  return (
    <Text
      accessibilityRole="header"
      accessibilityLabel="Tapi"
      style={{ fontSize: size, fontWeight: '800', color, letterSpacing: -size * 0.06, lineHeight: size * 1.15 }}
    >
      tapi
    </Text>
  );
}

// ---------- Pressable with scale feedback ----------
export function Tappable({
  style,
  children,
  scaleTo = 0.97,
  disabled,
  onPressIn,
  onPressOut,
  ...rest
}: PressableProps & { style?: ViewStyle | ViewStyle[]; scaleTo?: number; children?: React.ReactNode }) {
  const scale = useSharedValue(1);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Pressable
      disabled={disabled}
      onPressIn={(e) => {
        scale.set(withTiming(scaleTo, { duration: 90 }));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.set(withSpring(1, { damping: 14, stiffness: 260 }));
        onPressOut?.(e);
      }}
      {...rest}
    >
      <Animated.View style={[style as ViewStyle, aStyle]}>{children}</Animated.View>
    </Pressable>
  );
}

// ---------- Buttons ----------
type ButtonVariant = 'primary' | 'outline' | 'purple' | 'ghost';
export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
  textStyle,
  icon,
  testID,
}: {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  icon?: React.ReactNode;
  testID?: string;
}) {
  const isDisabled = disabled || loading;
  const bg = isDisabled ? colors.disabledBg : variant === 'primary' ? colors.lime : variant === 'purple' ? colors.purple : 'transparent';
  const fg = isDisabled ? colors.disabledText : variant === 'purple' ? '#fff' : colors.ink;
  return (
    <Tappable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!isDisabled }}
      disabled={isDisabled}
      onPress={() => {
        haptic.light();
        onPress?.();
      }}
      style={
        [styles.btn, { backgroundColor: bg }, variant === 'outline' && !isDisabled ? styles.btnOutline : null, style ?? null].filter(
          Boolean,
        ) as ViewStyle[]
      }
    >
      {loading ? (
        <ActivityIndicator color={colors.ink} />
      ) : (
        <View style={styles.row}>
          {icon}
          <Text style={[styles.btnText, { color: fg }, textStyle]}>{title}</Text>
        </View>
      )}
    </Tappable>
  );
}

export function TextLink({ title, onPress, style, muted }: { title: string; onPress?: () => void; style?: TextStyle; muted?: boolean }) {
  return (
    <Text
      accessibilityRole="link"
      onPress={onPress}
      suppressHighlighting
      style={[styles.link, muted && { color: colors.textMuted }, style]}
    >
      {title}
    </Text>
  );
}

// ---------- Layout ----------
export function Screen({
  children,
  style,
  edges = ['top'],
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  edges?: ('top' | 'bottom')[];
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        { flex: 1, backgroundColor: colors.surface },
        edges.includes('top') && { paddingTop: insets.top },
        edges.includes('bottom') && { paddingBottom: insets.bottom },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Footer({ children, border = true, style }: { children: React.ReactNode; border?: boolean; style?: ViewStyle }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.footer, border && styles.footerBorder, { paddingBottom: Math.max(insets.bottom, 16) }, style]}>{children}</View>
  );
}

export function BackButton({ onPress, color = colors.ink }: { onPress?: () => void; color?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Go back"
      hitSlop={12}
      onPress={() => {
        haptic.select();
        if (onPress) onPress();
        else if (router.canGoBack()) router.back();
      }}
      style={{ padding: 4 }}
    >
      <Feather name="arrow-left" size={24} color={color} />
    </Pressable>
  );
}

export function ProgressBar({ progress }: { progress: number }) {
  const w = useSharedValue(progress);
  useEffect(() => {
    w.set(withTiming(progress, { duration: 450 }));
  }, [progress, w]);
  const aStyle = useAnimatedStyle(() => ({ width: `${Math.max(2, w.value * 100)}%` }));
  return (
    <View
      style={styles.progressTrack}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
    >
      <Animated.View style={[styles.progressFill, aStyle]} />
    </View>
  );
}

export function OnboardingHeader({ progress, onBack, hideBack }: { progress?: number; onBack?: () => void; hideBack?: boolean }) {
  return (
    <View style={styles.header}>
      {hideBack ? <View style={{ width: 32 }} /> : <BackButton onPress={onBack} />}
      {progress !== undefined ? <ProgressBar progress={progress} /> : <View style={{ flex: 1 }} />}
    </View>
  );
}

// ---------- Selection controls ----------
export function OptionCard({
  label,
  subtitle,
  emoji,
  selected,
  onPress,
  testID,
}: {
  label: string;
  subtitle?: string;
  emoji?: string;
  selected?: boolean;
  onPress?: () => void;
  testID?: string;
}) {
  return (
    <Tappable
      testID={testID}
      accessibilityRole="radio"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={label}
      scaleTo={0.985}
      onPress={() => {
        haptic.select();
        onPress?.();
      }}
      style={[styles.option, selected ? styles.optionSelected : null].filter(Boolean) as ViewStyle[]}
    >
      <View style={[styles.row, { alignItems: 'flex-start' }]}>
        {emoji ? <Text style={styles.optionEmoji}>{emoji}</Text> : null}
        <View style={{ flex: 1 }}>
          <Text style={styles.optionLabel}>{label}</Text>
          {subtitle ? <Text style={styles.optionSub}>{subtitle}</Text> : null}
        </View>
      </View>
    </Tappable>
  );
}

export function Checkbox({ checked, size = 22 }: { checked: boolean; size?: number }) {
  return (
    <View
      style={[styles.checkbox, { width: size, height: size }, checked && { backgroundColor: colors.purple, borderColor: colors.purple }]}
    >
      {checked ? <Feather name="check" size={size * 0.72} color="#fff" /> : null}
    </View>
  );
}

export function Radio({ checked }: { checked: boolean }) {
  return <View style={[styles.radio, checked && { borderColor: colors.purple }]}>{checked ? <View style={styles.radioDot} /> : null}</View>;
}

export function InfoButton({ onPress, size = 22, color = colors.ink }: { onPress?: () => void; size?: number; color?: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="More info" hitSlop={10} onPress={onPress}>
      <Feather name="info" size={size} color={color} />
    </Pressable>
  );
}

export function Chip({
  label,
  onPress,
  selected,
  dimmed,
  chevron = true,
  testID,
}: {
  label: string;
  onPress?: () => void;
  selected?: boolean;
  dimmed?: boolean;
  chevron?: boolean;
  testID?: string;
}) {
  return (
    <Tappable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!selected }}
      onPress={() => {
        haptic.select();
        onPress?.();
      }}
      style={[styles.chip, selected && styles.chipSelected, dimmed && styles.chipDimmed].filter(Boolean) as ViewStyle[]}
    >
      <Text style={[styles.chipText, dimmed && { color: '#A9A9AE' }]}>{label}</Text>
      {chevron ? <Feather name="chevron-down" size={16} color={dimmed ? '#A9A9AE' : colors.ink} style={{ marginLeft: 6 }} /> : null}
    </Tappable>
  );
}

// ---------- Rating icons ----------
export function RatingIcon({ rating, size = 26 }: { rating: Rating; size?: number }) {
  const fill = rating === 'green' ? colors.green : rating === 'yellow' ? colors.yellow : colors.red;
  const sw = size / 14;
  return (
    <Svg width={size} height={size} viewBox="0 0 28 28">
      <Circle cx={14} cy={14} r={12.5} fill={fill} stroke={colors.ink} strokeWidth={sw} />
      {rating === 'green' && (
        <Path
          d="M8 14.5 L12.3 18.5 L20.5 9.5"
          stroke={colors.ink}
          strokeWidth={sw}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {rating === 'yellow' && <Line x1={2} y1={14} x2={26} y2={14} stroke={colors.ink} strokeWidth={sw} />}
      {rating === 'red' && (
        <>
          <Line x1={5.5} y1={5.5} x2={22.5} y2={22.5} stroke={colors.ink} strokeWidth={sw} />
          <Line x1={22.5} y1={5.5} x2={5.5} y2={22.5} stroke={colors.ink} strokeWidth={sw} />
        </>
      )}
    </Svg>
  );
}

export const ratingLabel: Record<Rating, string> = { green: 'Can eat', yellow: 'Limit this', red: 'Avoid' };

export function CloseButton({
  onPress,
  size = 26,
  color = colors.ink,
  testID,
}: {
  onPress?: () => void;
  size?: number;
  color?: string;
  testID?: string;
}) {
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel="Close" hitSlop={12} onPress={onPress}>
      <Ionicons name="close" size={size} color={color} />
    </Pressable>
  );
}

export const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  btn: {
    height: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  btnOutline: { borderWidth: 1.5, borderColor: colors.ink, backgroundColor: '#fff' },
  btnText: { fontSize: 18, fontWeight: '600', letterSpacing: -0.2 },
  link: { fontSize: 15, color: colors.ink, textDecorationLine: 'underline', fontWeight: '500' },
  footer: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: colors.surface, gap: 12 },
  footerBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, height: 52 },
  progressTrack: { flex: 1, height: 9, borderRadius: 9, backgroundColor: colors.surfaceMuted, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 9, backgroundColor: colors.purple },
  option: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 18,
    paddingVertical: 16,
    backgroundColor: '#fff',
  },
  optionSelected: { borderColor: colors.purple, borderWidth: 2, paddingHorizontal: 17, paddingVertical: 15 },
  optionEmoji: { fontSize: 17, marginRight: 10, lineHeight: 23 },
  optionLabel: { fontSize: 16, lineHeight: 23, color: colors.text },
  optionSub: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
  checkbox: {
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#C7C7CC',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: '#C7C7CC',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.purple },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    height: 40,
    backgroundColor: '#fff',
  },
  chipSelected: { borderColor: colors.ink, borderWidth: 2, paddingHorizontal: 11 },
  chipDimmed: { backgroundColor: colors.surfaceMuted, borderColor: colors.surfaceMuted },
  chipText: { fontSize: 15, color: colors.text },
});

export { type };
