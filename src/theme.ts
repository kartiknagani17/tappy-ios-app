import { Platform, type TextStyle } from 'react-native';

// Single source of truth for Tappy's look. Change brand colors here.
export const colors = {
  // Sunset Coral. primary = buttons and badges (white text on top).
  // accent = secondary actions, toggles, links, saved state (white text on top).
  primary: '#E04D2A',
  primaryPressed: '#C73E1C',
  onPrimary: '#FFFFFF',
  // The lighter coral of the app icon and splash (logo only, not for buttons).
  brand: '#FF7A59',
  accent: '#B4274F',
  accentDark: '#931F40',
  accentSoft: '#FFEBE4',
  accentTint: '#F6B9A8',
  ink: '#1F1513',
  text: '#2A1F1C',
  textMuted: '#7A6A66',
  textSubtle: '#9A8C88',
  border: '#EBDFDB',
  borderLight: '#F3EBE8',
  surface: '#FFFFFF',
  surfaceMuted: '#F7F2F0',
  disabledBg: '#F3EEEC',
  disabledText: '#9A8C88',
  danger: '#D0161E',
  green: '#22C55E',
  greenDark: '#0F9F45',
  yellow: '#FFCB05',
  red: '#FF5A2A',
  backdrop: 'rgba(31,21,19,0.45)',
  // Splash and icon background (cream), also used behind the logo.
  cream: '#FFF6F1',
  // Neutral UI greys, warmed to match the palette.
  inactive: '#9A8C88',
  hairline: '#F3EBE8',
  fill: '#F7F2F0',
  link: '#B4274F',
};

/** Removes the browser focus ring on TextInputs when previewing on web. */
export const noOutline: TextStyle = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as unknown as TextStyle) : {};

export const radius = { sm: 8, md: 10, lg: 14, xl: 20, pill: 999 };

export const space = (n: number) => n * 4;

export const type = {
  display: { fontSize: 30, lineHeight: 36, fontWeight: '600' as const, color: colors.ink, letterSpacing: -0.4 },
  title: { fontSize: 24, lineHeight: 30, fontWeight: '600' as const, color: colors.ink, letterSpacing: -0.3 },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '600' as const, color: colors.ink },
  body: { fontSize: 16, lineHeight: 23, color: colors.text },
  bodySm: { fontSize: 14, lineHeight: 20, color: colors.text },
  caption: { fontSize: 12, lineHeight: 16, color: colors.textMuted },
};
