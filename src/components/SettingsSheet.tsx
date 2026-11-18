import { Feather } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { LEGAL_CONTACT } from '../../server/src/legal/content';
import { ApiError } from '../lib/api';
import { AUTH_ENABLED, deleteAccount as deleteServerAccount, signOut } from '../lib/auth';
import { haptic } from '../lib/haptics';
import { useStore } from '../lib/store';
import { PurchasesUnavailableError, redeemCode, restorePurchases } from '../lib/subscription';
import { colors, radius } from '../theme';
import { BottomSheet } from './BottomSheet';
import { LegalSheet, type LegalDocId } from './LegalSheet';

const SUPPORT_EMAIL = LEGAL_CONTACT;
const MANAGE_SUBSCRIPTIONS_URL = 'https://apps.apple.com/account/subscriptions';

const FAQS: { q: string; a: string }[] = [
  {
    q: 'How does Tappy decide if a product fits me?',
    a: 'Tappy reads the ingredient list and allergen statements and compares them with the diets, allergies and ingredients you chose. Green means we found nothing you avoid, yellow means it has something you limit, and red means it has something you avoid.',
  },
  {
    q: 'Is Tappy medical advice?',
    a: 'No. Tappy is an informational guide based on label data, which can be wrong or out of date. Always read the ingredients and allergen warnings on the package yourself before eating, and follow your doctor’s advice.',
  },
  {
    q: 'Where does the product information come from?',
    a: 'From Open Food Facts, the USDA FoodData Central database, and label photos shared by Tappy users. See Data sources & credits in Settings.',
  },
  {
    q: 'A product is missing or looks wrong. What can I do?',
    a: 'Scan the barcode. If we don’t have the ingredients, Tappy asks you to photograph the ingredient list and reads it for you. You can also report a problem from the product page, or contact support.',
  },
  {
    q: 'How do I change my diet or allergies?',
    a: 'Open Settings and choose Edit dietary profile.',
  },
  {
    q: 'How do I cancel my subscription?',
    a: 'Subscriptions are managed by Apple. Open Settings > Manage subscription, or go to Settings > Apple ID > Subscriptions on your iPhone.',
  },
];

const confirm = (title: string, msg: string, onOk: () => void, okText = 'Continue') => {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${msg}`)) onOk();
    return;
  }
  Alert.alert(title, msg, [
    { text: 'Cancel', style: 'cancel' },
    { text: okText, style: 'destructive', onPress: onOk },
  ]);
};
const notify = (title: string, msg: string) => {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${msg}`);
  else Alert.alert(title, msg);
};

const PROVIDER_LABEL = { email: 'Email', apple: 'Apple', google: 'Google', facebook: 'Facebook' } as const;

/**
 * Account and settings, a sheet that slides up from the account button on Lists and Grocery.
 * Starts with who is signed in so people can see which account they are using.
 */
export function SettingsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const account = useStore((s) => s.account);
  const contributePhotos = useStore((s) => s.contributePhotos);
  const trialActive = useStore((s) => s.trialActive);
  const [restoring, setRestoring] = useState(false);
  const [legal, setLegal] = useState<LegalDocId | null>(null);
  const [faq, setFaq] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const version = Constants.expoConfig?.version ?? '';

  const restore = async () => {
    if (restoring) return;
    setRestoring(true);
    try {
      const ok = await restorePurchases();
      if (ok) {
        haptic.success();
        useStore.getState().set({ trialActive: true });
        notify('Purchases restored', 'Your Tappy subscription is active on this device.');
      } else notify('No purchases found', 'We couldn’t find an active Tappy subscription for this Apple ID.');
    } catch (e) {
      notify(
        'Couldn’t restore',
        e instanceof PurchasesUnavailableError ? 'Purchases aren’t available in this build.' : 'Could not reach the App Store. Please try again.',
      );
    } finally {
      setRestoring(false);
    }
  };

  const redeem = async () => {
    try {
      await redeemCode();
    } catch (e) {
      notify(
        'Couldn’t open Redeem code',
        e instanceof PurchasesUnavailableError
          ? 'Redeeming codes isn’t available in this build. You can also redeem a code in the App Store app.'
          : 'Please try again, or redeem the code in the App Store app.',
      );
    }
  };

  const contactSupport = () => {
    const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`Tappy support (v${version} ${Platform.OS})`)}`;
    Linking.openURL(url).catch(() => notify('Contact support', `Email us at ${SUPPORT_EMAIL}`));
  };

  const deleteAccount = () =>
    confirm(
      'Delete your account?',
      'This permanently deletes your Tappy account, dietary profile and saved lists. This can’t be undone. An App Store subscription is not canceled automatically; manage it in Settings > Apple ID > Subscriptions.',
      async () => {
        try {
          await deleteServerAccount();
        } catch (e) {
          notify(
            'Couldn’t delete your account',
            e instanceof ApiError && e.code === 'no_session' ? e.message : 'We couldn’t reach Tappy. Check your connection and try again.',
          );
          return;
        }
        haptic.warning();
        onClose();
        useStore.getState().resetAll();
        router.replace('/welcome');
      },
      'Delete account',
    );

  return (
    <BottomSheet visible={visible} onClose={onClose} handle>
      <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ paddingHorizontal: 16 }}>
        <Text style={styles.sheetTitle} accessibilityRole="header">
          Settings
        </Text>

        <View style={styles.accountCard} testID="account-section">
          <View style={styles.avatar}>
            <Feather name="user" size={22} color={colors.text} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.accountLabel}>Account</Text>
            {account ? (
              <>
                <Text style={styles.accountMain} numberOfLines={1}>
                  {account.email || 'Apple ID (email hidden)'}
                </Text>
                <Text style={styles.accountSub}>Signed in with {PROVIDER_LABEL[account.provider]}</Text>
              </>
            ) : (
              <>
                <Text style={styles.accountMain}>Not signed in</Text>
                <Text style={styles.accountSub}>Your profile and lists are saved on this phone only.</Text>
              </>
            )}
          </View>
          {!account && AUTH_ENABLED ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Log in or create an account"
              hitSlop={8}
              onPress={() => {
                onClose();
                router.push({ pathname: '/auth', params: { mode: 'signup' } });
              }}
              style={styles.accountBtn}
            >
              <Text style={styles.accountBtnText}>Log in</Text>
            </Pressable>
          ) : null}
        </View>

        <Row
          icon="sliders"
          label="Edit dietary profile"
          onPress={() => {
            onClose();
            router.push({ pathname: '/onboarding/profile', params: { edit: '1' } });
          }}
        />
        <View style={styles.row}>
          <Feather name="image" size={20} color={colors.ink} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowText}>Share product photos</Text>
            <Text style={styles.rowSub}>Keep package photos to improve Tappy’s database. Off: photos are deleted after scanning.</Text>
          </View>
          <Switch
            testID="share-photos"
            accessibilityLabel="Share product photos"
            value={contributePhotos}
            onValueChange={(v) => useStore.getState().set({ contributePhotos: v })}
            trackColor={{ true: colors.accent, false: '#E0D3CE' }}
          />
        </View>
        <Row icon="rotate-ccw" label={restoring ? 'Restoring…' : 'Restore purchases'} onPress={restore} testID="restore" />
        {Platform.OS === 'ios' ? <Row icon="gift" label="Redeem code" onPress={redeem} testID="redeem" /> : null}
        {trialActive && Platform.OS === 'ios' ? (
          <Row icon="credit-card" label="Manage subscription" onPress={() => Linking.openURL(MANAGE_SUBSCRIPTIONS_URL)} external />
        ) : null}
        <Row icon="help-circle" label="FAQs" onPress={() => setFaq(true)} testID="faqs" />
        <Row icon="mail" label="Contact support" onPress={contactSupport} testID="contact" external />
        <Row icon="shield" label="Privacy Policy" onPress={() => setLegal('privacy')} testID="privacy" />
        <Row icon="file-text" label="Terms of Use" onPress={() => setLegal('terms')} testID="terms" />
        <Row
          icon="info"
          label="Data sources & credits"
          onPress={() => {
            onClose();
            router.push('/credits');
          }}
        />
        <View style={styles.row} accessible accessibilityLabel={`App version ${version}`} testID="app-version">
          <Feather name="smartphone" size={20} color={colors.ink} />
          <Text style={styles.rowText}>App version</Text>
          <Text style={styles.versionText}>{version}</Text>
        </View>
        {account ? (
          <Row
            icon="log-out"
            label="Log out"
            onPress={() => {
              onClose();
              void signOut();
            }}
          />
        ) : null}
        {account ? <Row icon="user-x" label="Delete account" danger onPress={deleteAccount} testID="delete-account" /> : null}
        <Row
          icon="refresh-ccw"
          label="Reset app & restart onboarding"
          testID="reset"
          danger
          onPress={() =>
            confirm('Reset Tappy?', 'This clears your profile and restarts onboarding on this device.', () => {
              onClose();
              useStore.getState().resetAll();
              router.replace('/welcome');
            })
          }
        />
      </ScrollView>
      <LegalSheet doc={legal} onClose={() => setLegal(null)} />

      <BottomSheet visible={faq} onClose={() => setFaq(false)} handle maxHeight={0.85}>
        <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <Text style={styles.sheetTitle} accessibilityRole="header">
            FAQs
          </Text>
          {FAQS.map((f, i) => (
            <Pressable
              key={f.q}
              accessibilityRole="button"
              accessibilityState={{ expanded: openFaq === i }}
              style={styles.faq}
              onPress={() => setOpenFaq(openFaq === i ? null : i)}
            >
              <View style={styles.faqHead}>
                <Text style={styles.faqQ}>{f.q}</Text>
                <Feather name={openFaq === i ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textSubtle} />
              </View>
              {openFaq === i ? <Text style={styles.faqA}>{f.a}</Text> : null}
            </Pressable>
          ))}
        </ScrollView>
      </BottomSheet>
    </BottomSheet>
  );
}

function Row({
  icon,
  label,
  onPress,
  danger,
  external,
  testID,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  onPress: () => void;
  danger?: boolean;
  external?: boolean;
  testID?: string;
}) {
  return (
    <Pressable testID={testID} accessibilityRole={external ? 'link' : 'button'} accessibilityLabel={label} style={styles.row} onPress={onPress}>
      <Feather name={icon} size={20} color={danger ? colors.danger : colors.ink} />
      <Text style={[styles.rowText, danger && { color: colors.danger }]}>{label}</Text>
      <Feather name="chevron-right" size={20} color={colors.textSubtle} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheetTitle: { fontSize: 22, fontWeight: '600', color: colors.ink, marginVertical: 8 },
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    padding: 14,
    marginTop: 4,
    marginBottom: 8,
  },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  accountLabel: { fontSize: 12, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 },
  accountMain: { fontSize: 16, fontWeight: '600', color: colors.ink, marginTop: 2 },
  accountSub: { fontSize: 13, color: colors.textMuted, marginTop: 1, lineHeight: 18 },
  accountBtn: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 9 },
  accountBtnText: { fontSize: 14, fontWeight: '700', color: colors.onPrimary },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowText: { flex: 1, fontSize: 17, color: colors.ink },
  rowSub: { fontSize: 13, color: colors.textMuted, marginTop: 2, lineHeight: 18 },
  versionText: { fontSize: 16, color: colors.textMuted },
  faq: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  faqHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  faqQ: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.ink, lineHeight: 22 },
  faqA: { fontSize: 15, color: colors.text, lineHeight: 22, marginTop: 8 },
});
