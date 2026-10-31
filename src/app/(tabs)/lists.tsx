import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import Constants from 'expo-constants';
import { Alert, FlatList, Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { DEMO_PRODUCTS, ProductTile, type DemoProduct } from '../../components/art';
import { BottomSheet } from '../../components/BottomSheet';
import { ProductSheet } from '../../components/ProductSheet';
import { Button, Screen } from '../../components/ui';
import { haptic } from '../../lib/haptics';
import { rateNames, worst } from '../../lib/ratings';
import { useStore } from '../../lib/store';
import { PRIVACY_URL, restorePurchases, TERMS_URL } from '../../lib/subscription';
import { colors, radius } from '../../theme';

// TODO: move to src/lib/subscription.ts next to TERMS_URL / PRIVACY_URL and point at a monitored inbox.
const SUPPORT_EMAIL = 'support@tapi.app';
const MANAGE_SUBSCRIPTIONS_URL = 'https://apps.apple.com/account/subscriptions';

export default function Lists() {
  const saved = useStore((s) => s.saved);
  const account = useStore((s) => s.account);
  const contributePhotos = useStore((s) => s.contributePhotos);
  const restrictions = useStore((s) => s.restrictions);
  const overrides = useStore((s) => s.ingredientOverrides);
  const [product, setProduct] = useState<DemoProduct | null>(null);
  const trialActive = useStore((s) => s.trialActive);
  const [settings, setSettings] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const items = DEMO_PRODUCTS.filter((p) => saved.includes(p.id));

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

  const restore = async () => {
    if (restoring) return;
    setRestoring(true);
    try {
      const ok = await restorePurchases();
      if (ok) {
        haptic.success();
        useStore.getState().set({ trialActive: true });
        notify('Purchases restored', 'Your Tapi subscription is active on this device.');
      } else notify('No purchases found', 'We couldn’t find an active Tapi subscription for this Apple ID.');
    } catch {
      notify('Couldn’t restore', 'Could not reach the App Store. Please try again.');
    } finally {
      setRestoring(false);
    }
  };

  const contactSupport = () => {
    const version = Constants.expoConfig?.version ?? '';
    const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`Tapi support (v${version} ${Platform.OS})`)}`;
    Linking.openURL(url).catch(() => notify('Contact support', `Email us at ${SUPPORT_EMAIL}`));
  };

  const deleteAccount = () =>
    confirm(
      'Delete your account?',
      'This permanently deletes your Tapi account, dietary profile and saved lists. This can’t be undone. An App Store subscription is not canceled automatically; manage it in Settings > Apple ID > Subscriptions.',
      () => {
        // TODO: call the backend account-deletion endpoint here once auth is wired up (Guideline 5.1.1(v)).
        haptic.warning();
        setSettings(false);
        useStore.getState().resetAll();
        router.replace('/welcome');
      },
      'Delete account',
    );

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>Lists</Text>
        <Pressable
          testID="settings"
          accessibilityRole="button"
          accessibilityLabel="Settings"
          hitSlop={10}
          onPress={() => setSettings(true)}
        >
          <Feather name="settings" size={24} color={colors.ink} />
        </Pressable>
      </View>

      {!account ? (
        <Pressable
          testID="account-banner"
          accessibilityRole="button"
          accessibilityLabel="Save your lists. Create a free account so your profile and lists sync across devices."
          style={styles.banner}
          onPress={() => router.push({ pathname: '/auth', params: { mode: 'signup' } })}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerTitle}>Save your lists</Text>
            <Text style={styles.bannerBody}>Create a free account so your profile and lists sync across devices.</Text>
          </View>
          <Feather name="arrow-right" size={22} color={colors.purple} />
        </Pressable>
      ) : null}

      <FlatList
        data={items}
        keyExtractor={(p) => p.id}
        numColumns={2}
        columnWrapperStyle={{ gap: 14 }}
        contentContainerStyle={{ padding: 16, gap: 18, flexGrow: 1 }}
        renderItem={({ item }) => (
          <Pressable style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel={item.name} onPress={() => setProduct(item)}>
            <ProductTile p={item} saved rating={worst(rateNames(item.ingredients, restrictions, overrides).map((r) => r.rating))} />
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="bookmark" size={40} color={colors.textSubtle} />
            <Text style={styles.emptyTitle}>No saved products yet</Text>
            <Text style={styles.emptyBody}>Tap the bookmark on any product to save it here.</Text>
            <Button
              title="Browse groceries"
              onPress={() => router.navigate('/(tabs)/grocery')}
              style={{ alignSelf: 'stretch', marginTop: 20 }}
            />
          </View>
        }
      />

      <ProductSheet product={product} onClose={() => setProduct(null)} />

      <BottomSheet visible={settings} onClose={() => setSettings(false)} handle>
        <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ paddingHorizontal: 16 }}>
          <Text style={styles.sheetTitle} accessibilityRole="header">
            Settings
          </Text>
          {account ? <Text style={styles.account}>Signed in as {account.email}</Text> : null}
          <Row
            icon="sliders"
            label="Edit dietary profile"
            onPress={() => {
              setSettings(false);
              router.push({ pathname: '/onboarding/profile', params: { edit: '1' } });
            }}
          />
          <View style={styles.row}>
            <Feather name="image" size={20} color={colors.ink} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowText}>Share product photos</Text>
              <Text style={styles.rowSub}>Keep package photos to improve Tapi’s database. Off: photos are deleted after scanning.</Text>
            </View>
            <Switch
              testID="share-photos"
              accessibilityLabel="Share product photos"
              value={contributePhotos}
              onValueChange={(v) => useStore.getState().set({ contributePhotos: v })}
              trackColor={{ true: colors.purple, false: '#D1D1D6' }}
            />
          </View>
          <Row icon="rotate-ccw" label={restoring ? 'Restoring…' : 'Restore purchases'} onPress={restore} testID="restore" />
          {trialActive && Platform.OS === 'ios' ? (
            <Row icon="credit-card" label="Manage subscription" onPress={() => Linking.openURL(MANAGE_SUBSCRIPTIONS_URL)} external />
          ) : null}
          <Row icon="mail" label="Contact support" onPress={contactSupport} testID="contact" external />
          <Row icon="shield" label="Privacy Policy" onPress={() => Linking.openURL(PRIVACY_URL)} testID="privacy" external />
          <Row icon="file-text" label="Terms of Use" onPress={() => Linking.openURL(TERMS_URL)} testID="terms" external />
          <Row
            icon="info"
            label="Data sources & credits"
            onPress={() => {
              setSettings(false);
              router.push('/credits');
            }}
          />
          {account ? (
            <Row
              icon="log-out"
              label="Log out"
              onPress={() => {
                useStore.getState().set({ account: undefined });
                setSettings(false);
              }}
            />
          ) : (
            <Row
              icon="user-plus"
              label="Create account / Log in"
              onPress={() => {
                setSettings(false);
                router.push({ pathname: '/auth', params: { mode: 'signup' } });
              }}
            />
          )}
          {account ? <Row icon="user-x" label="Delete account" danger onPress={deleteAccount} testID="delete-account" /> : null}
          <Row
            icon="refresh-ccw"
            label="Reset app & restart onboarding"
            testID="reset"
            danger
            onPress={() =>
              confirm('Reset Tapi?', 'This clears your profile and restarts onboarding on this device.', () => {
                setSettings(false);
                useStore.getState().resetAll();
                router.replace('/welcome');
              })
            }
          />
        </ScrollView>
      </BottomSheet>
    </Screen>
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
    <Pressable
      testID={testID}
      accessibilityRole={external ? 'link' : 'button'}
      accessibilityLabel={label}
      style={styles.row}
      onPress={onPress}
    >
      <Feather name={icon} size={20} color={danger ? colors.danger : colors.ink} />
      <Text style={[styles.rowText, danger && { color: colors.danger }]}>{label}</Text>
      <Feather name="chevron-right" size={20} color={colors.textSubtle} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, height: 52 },
  title: { fontSize: 30, fontWeight: '700', color: colors.ink },
  banner: {
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: colors.purpleSoft,
    borderRadius: radius.lg,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bannerTitle: { fontSize: 16, fontWeight: '700', color: colors.purple },
  bannerBody: { fontSize: 14, color: colors.text, marginTop: 2, lineHeight: 20 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: colors.ink, marginTop: 14 },
  emptyBody: { fontSize: 15, color: colors.textMuted, textAlign: 'center', marginTop: 6 },
  sheetTitle: { fontSize: 22, fontWeight: '600', color: colors.ink, marginVertical: 8 },
  account: { fontSize: 14, color: colors.textMuted, marginBottom: 8 },
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
});
