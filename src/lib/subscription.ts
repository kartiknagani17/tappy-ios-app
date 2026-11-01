import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Purchases, { INTRO_ELIGIBILITY_STATUS, LOG_LEVEL, PURCHASES_ERROR_CODE, type CustomerInfo, type PurchasesStoreProduct } from 'react-native-purchases';
import { setRequestIdentity } from './api';
import { useStore } from './store';

/**
 * In-app subscriptions through RevenueCat (react-native-purchases), on top of StoreKit.
 *
 * Setup (see README → "Payments"):
 *  - App Store Connect: an auto-renewable subscription group with the product ids in PLANS, each with
 *    a 7-day free-trial introductory offer.
 *  - RevenueCat: an entitlement with id ENTITLEMENT_ID attached to those products.
 *  - EXPO_PUBLIC_REVENUECAT_IOS_KEY: the RevenueCat public iOS SDK key (appl_…), set in eas.json.
 *
 * Purchases need a development or App Store build; in Expo Go the SDK runs in preview mode.
 */
export const REVENUECAT_IOS_KEY = (process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '').trim();
export const ENTITLEMENT_ID = 'tappy_pro';

export const TRIAL_DAYS = 7;
export const REMINDER_DAYS_BEFORE = 2;

/** Fallback prices (USD) until the App Store returns localized prices. Keep in sync with App Store Connect. */
export const PLANS = {
  annual: { id: 'tapi_annual', price: 49.99, label: '1 year' },
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

let configured = false;
const purchasesAvailable = () => Platform.OS === 'ios' && !!REVENUECAT_IOS_KEY;

const isActive = (info: CustomerInfo) => !!info.entitlements.active[ENTITLEMENT_ID];
const applyCustomerInfo = (info: CustomerInfo) => useStore.getState().set({ trialActive: isActive(info) });
/** Lets the server check this purchaser's subscription when it scans (see api.ts). */
const syncPurchaserId = () =>
  Purchases.getAppUserID().then(
    (id) => setRequestIdentity({ purchaser: id }),
    () => {},
  );

/** Call once at launch. Keeps `trialActive` in the store in step with the App Store (renewals, refunds, expiry). */
export function initPurchases() {
  if (configured || !purchasesAvailable()) {
    if (!REVENUECAT_IOS_KEY && Platform.OS === 'ios') console.warn('[purchases] EXPO_PUBLIC_REVENUECAT_IOS_KEY is not set; purchases are disabled.');
    return;
  }
  if (__DEV__) void Purchases.setLogLevel(LOG_LEVEL.WARN);
  Purchases.configure({ apiKey: REVENUECAT_IOS_KEY });
  configured = true;
  Purchases.addCustomerInfoUpdateListener(applyCustomerInfo);
  Purchases.getCustomerInfo().then(applyCustomerInfo, () => {});
  void syncPurchaserId();
}

/** Ties purchases to the Tappy account, so a subscription follows the user to a new phone. */
export async function identifyPurchaser(appUserId: string) {
  if (!configured) return;
  try {
    const { customerInfo } = await Purchases.logIn(appUserId);
    applyCustomerInfo(customerInfo);
    void syncPurchaserId();
  } catch {
    // ignore: purchases still work anonymously
  }
}

export async function resetPurchaser() {
  if (!configured) return;
  try {
    if (await Purchases.isAnonymous()) return;
    applyCustomerInfo(await Purchases.logOut());
    void syncPurchaserId();
  } catch {
    // ignore
  }
}

export type PlanPrice = { priceString: string; perMonthString: string | null; trialDays: number | null; trialEligible: boolean };

const trialDaysOf = (p: PurchasesStoreProduct) => {
  const intro = p.introPrice;
  if (!intro || intro.price !== 0) return null;
  const n = intro.periodNumberOfUnits;
  return intro.periodUnit === 'DAY' ? n : intro.periodUnit === 'WEEK' ? n * 7 : intro.periodUnit === 'MONTH' ? n * 30 : null;
};

/** Localized App Store prices and free-trial eligibility for each plan; null until purchases are set up. */
export async function loadPrices(): Promise<Record<string, PlanPrice> | null> {
  if (!configured) return null;
  try {
    const ids = [PLANS.annual.id, PLANS.annualOffer.id];
    const [products, eligibility] = await Promise.all([
      Purchases.getProducts(ids),
      Purchases.checkTrialOrIntroductoryPriceEligibility(ids).catch(() => ({}) as Record<string, { status: INTRO_ELIGIBILITY_STATUS }>),
    ]);
    const out: Record<string, PlanPrice> = {};
    for (const p of products) {
      const status = eligibility[p.identifier]?.status;
      out[p.identifier] = {
        priceString: p.priceString,
        perMonthString: p.pricePerMonthString,
        trialDays: trialDaysOf(p),
        // Unknown counts as not eligible, so we never promise a trial Apple won't give.
        trialEligible: status === INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE && trialDaysOf(p) !== null,
      };
    }
    return out;
  } catch {
    return null;
  }
}

export class PurchasesUnavailableError extends Error {
  constructor() {
    super('Purchases aren’t available in this build.');
  }
}

/**
 * Shows the App Store purchase sheet. Resolves true when the subscription is active, false when the
 * user cancels. Apple applies the free trial automatically when the user is eligible.
 */
export async function startTrial(productId: string, withTrial: boolean): Promise<boolean> {
  if (!configured) throw new PurchasesUnavailableError();
  const [product] = await Purchases.getProducts([productId]);
  if (!product) throw new Error(`Product ${productId} was not found in the App Store.`);
  try {
    const { customerInfo } = await Purchases.purchaseStoreProduct(product);
    applyCustomerInfo(customerInfo);
    if (!isActive(customerInfo)) return false;
    if (withTrial) await scheduleTrialReminder();
    return true;
  } catch (e) {
    const err = e as { code?: string; userCancelled?: boolean | null };
    if (err.userCancelled || err.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) return false;
    throw e;
  }
}

export async function restorePurchases(): Promise<boolean> {
  if (!configured) throw new PurchasesUnavailableError();
  const info = await Purchases.restorePurchases();
  applyCustomerInfo(info);
  return isActive(info);
}

/** Local notification 2 days before the trial ends. Silently no-ops without permission. */
export async function scheduleTrialReminder() {
  if (Platform.OS === 'web') return;
  try {
    const perm = await Notifications.getPermissionsAsync();
    if (perm.status !== 'granted') return;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Your Tappy trial ends in 2 days',
        body: 'Keep scanning with confidence, or cancel anytime in Settings before it renews.',
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: reminderDate() },
    });
  } catch {
    // ignore
  }
}
