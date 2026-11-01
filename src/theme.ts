import { Platform, type TextStyle } from 'react-native';

// Single source of truth for Tappy's look. Change brand colors here.
export const colors = {
  lime: '#E3FC6D',
  limePressed: '#D4EE55',
  purple: '#583AC5',
  purpleDark: '#4527B0',
  purpleSoft: '#ECE8FA',
  purpleTint: '#C0B4E9',
  ink: '#171717',
  text: '#1F1F1F',
  textMuted: '#6B6B6B',
  textSubtle: '#8E8E93',
  border: '#D9D9DE',
  borderLight: '#ECECEF',
  surface: '#FFFFFF',
  surfaceMuted: '#F4F4F6',
  disabledBg: '#EFEFF2',
  disabledText: '#8A8A90',
  danger: '#D0161E',
  green: '#22C55E',
  greenDark: '#0F9F45',
  yellow: '#FFCB05',
  red: '#FF5A2A',
  backdrop: 'rgba(0,0,0,0.45)',
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
