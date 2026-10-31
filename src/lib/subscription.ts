import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// TODO: point these at your real legal pages before submitting to the App Store.
export const TERMS_URL = 'https://tapi.app/terms';
export const PRIVACY_URL = 'https://tapi.app/privacy';

export const TRIAL_DAYS = 7;
export const REMINDER_DAYS_BEFORE = 2;

export const PLANS = {
  annual: { id: 'tapi_annual', price: 50, label: '1 year' },
  // One-time "Before you go" offer
  annualOffer: { id: 'tapi_annual_offer', price: 39.99, label: '1 year' },
};

export function reminderDate(from = new Date()) {
  const d = new Date(from);
  d.setDate(d.getDate() + TRIAL_DAYS - REMINDER_DAYS_BEFORE);
  return d;
}

export function formatReminderDate(from = new Date()) {
  return reminderDate(from).toLocaleDateString('en-US', { month: 'long', day: '2-digit' });
}

export const money = (n: number) => `$${n.toFixed(2)}`;

/**
 * Purchase stub. Replace with RevenueCat (react-native-purchases) or StoreKit before release.
 * Resolves true when the user completes the App Store sheet.
 */
export async function startTrial(_productId: string, withTrial: boolean): Promise<boolean> {
  await new Promise((r) => setTimeout(r, 900));
  if (withTrial) await scheduleTrialReminder();
  return true;
}

export async function restorePurchases(): Promise<boolean> {
  await new Promise((r) => setTimeout(r, 700));
  return false;
}

/** Local notification 2 days before the trial ends. Silently no-ops without permission. */
export async function scheduleTrialReminder() {
  if (Platform.OS === 'web') return;
  try {
    const perm = await Notifications.getPermissionsAsync();
    if (perm.status !== 'granted') return;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Your Tapi trial ends in 2 days',
        body: 'Keep scanning with confidence, or cancel anytime in Settings before it renews.',
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: reminderDate() },
    });
  } catch {
    // ignore
  }
}
