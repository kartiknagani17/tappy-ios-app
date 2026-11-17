import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import Constants from 'expo-constants';
import { Alert, FlatList, Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { BottomSheet } from '../../components/BottomSheet';
import { LegalSheet, type LegalDocId } from '../../components/LegalSheet';
import { ProductCard } from '../../components/ProductCard';
import { Button, Screen } from '../../components/ui';
import { VerdictSheet } from '../../components/VerdictSheet';
import { api, type ApiProduct } from '../../lib/api';
import { AUTH_ENABLED, deleteAccount as deleteServerAccount, signOut } from '../../lib/auth';
import { haptic } from '../../lib/haptics';
import { useStore } from '../../lib/store';
import { computeVerdict, verdictRating } from '../../lib/verdict';
import { LEGAL_CONTACT } from '../../../server/src/legal/content';
import { PurchasesUnavailableError, restorePurchases } from '../../lib/subscription';
import { colors, radius } from '../../theme';

const SUPPORT_EMAIL = LEGAL_CONTACT;
const MANAGE_SUBSCRIPTIONS_URL = 'https://apps.apple.com/account/subscriptions';

export default function Lists() {
  const saved = useStore((s) => s.saved);
  const account = useStore((s) => s.account);
  const contributePhotos = useStore((s) => s.contributePhotos);
  const restrictions = useStore((s) => s.restrictions);
  const overrides = useStore((s) => s.ingredientOverrides);
  const [open, setOpen] = useState<ApiProduct | null>(null);
  const fresh = useFreshProducts(saved.map((p) => p.id));
  const trialActive = useStore((s) => s.trialActive);
  const [settings, setSettings] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [legal, setLegal] = useState<LegalDocId | null>(null);
  const items = useMemo(
    () =>
      saved.map((s) => {
        const p = fresh.products.get(s.id);
        return {
          saved: p ? { ...s, name: p.name, brand: p.brand, image_url: p.image_url } : s,
          product: p ?? null,
          // undefined = still checking; null = not enough data (or couldn't refresh)
          rating: p ? verdictRating(computeVerdict(p, restrictions, overrides)) : fresh.state === 'loading' ? undefined : null,
        };
      }),
    [saved, fresh, restrictions, overrides],
  );

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
        notify('Purchases restored', 'Your Tappy subscription is active on this device.');
      } else notify('No purchases found', 'We couldn’t find an active Tappy subscription for this Apple ID.');
    } catch (e) {
      notify(
        'Couldn’t restore',
        e instanceof PurchasesUnavailableError
          ? 'Purchases aren’t available in this build.'
          : 'Could not reach the App Store. Please try again.',
      );
    } finally {
      setRestoring(false);
    }
  };

  const contactSupport = () => {
    const version = Constants.expoConfig?.version ?? '';
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
        } catch {
          notify('Couldn’t delete your account', 'We couldn’t reach Tappy. Check your connection and try again.');
          return;
        }
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

      {AUTH_ENABLED && !account ? (
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

      {fresh.state === 'error' && saved.length ? (
        <Text style={styles.offline}>Couldn’t check your saved products right now. Pull down or reopen Lists to try again.</Text>
      ) : null}

      <FlatList
        data={items}
        keyExtractor={(i) => String(i.saved.id)}
        numColumns={2}
        columnWrapperStyle={{ gap: 14 }}
        contentContainerStyle={{ padding: 16, gap: 20, flexGrow: 1 }}
        refreshing={false}
        onRefresh={fresh.reload}
        renderItem={({ item }) => (
          <ProductCard product={item.saved} rating={item.rating} onPress={() => (item.product ? setOpen(item.product) : fresh.reload())} />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="bookmark" size={40} color={colors.textSubtle} />
            <Text style={styles.emptyTitle}>No saved products yet</Text>
            <Text style={styles.emptyBody}>
              Tap the bookmark on a scanned product, or in Grocery, to keep the ones that work for you here.
            </Text>
            <Button
              title="Browse groceries"
              onPress={() => router.navigate('/(tabs)/grocery')}
              style={{ alignSelf: 'stretch', marginTop: 20 }}
            />
          </View>
        }
      />

      <VerdictSheet product={open} onClose={() => setOpen(null)} onOpenProduct={(p) => setOpen(p)} />

      <BottomSheet visible={settings} onClose={() => setSettings(false)} handle>
        <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ paddingHorizontal: 16 }}>
          <Text style={styles.sheetTitle} accessibilityRole="header">
            Settings
          </Text>
          {account ? <Text style={styles.account}>Signed in as {account.email || 'your Apple ID'}</Text> : null}
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
              <Text style={styles.rowSub}>Keep package photos to improve Tappy’s database. Off: photos are deleted after scanning.</Text>
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
          <Row icon="shield" label="Privacy Policy" onPress={() => setLegal('privacy')} testID="privacy" />
          <Row icon="file-text" label="Terms of Use" onPress={() => setLegal('terms')} testID="terms" />
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
                setSettings(false);
                void signOut();
              }}
            />
          ) : AUTH_ENABLED ? (
            <Row
              icon="user-plus"
              label="Create account / Log in"
              onPress={() => {
                setSettings(false);
                router.push({ pathname: '/auth', params: { mode: 'signup' } });
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
                setSettings(false);
                useStore.getState().resetAll();
                router.replace('/welcome');
              })
            }
          />
        </ScrollView>
        <LegalSheet doc={legal} onClose={() => setLegal(null)} />
      </BottomSheet>
    </Screen>
  );
}

/**
 * Current data for the saved products, fetched whenever Lists comes into view (ingredients and
 * ratings can change; only names and photos are stored on the phone).
 */
function useFreshProducts(ids: number[]) {
  const [state, setState] = useState<{ products: Map<number, ApiProduct>; state: 'loading' | 'done' | 'error' }>({
    products: new Map(),
    state: 'loading',
  });
  const idsKey = ids.join(',');
  const run = useRef(0);
  const reload = useCallback(() => {
    const list = idsKey ? idsKey.split(',').map(Number) : [];
    const mine = ++run.current;
    if (!list.length) {
      setState({ products: new Map(), state: 'done' });
      return;
    }
    setState((s) => ({ ...s, state: 'loading' }));
    const chunks: number[][] = [];
    for (let i = 0; i < list.length; i += 50) chunks.push(list.slice(i, i + 50));
    Promise.all(chunks.map((c) => api.lookup(c)))
      .then((res) => {
        if (mine !== run.current) return;
        const products = new Map<number, ApiProduct>();
        for (const r of res) for (const p of r.products) if (p.id !== null) products.set(p.id, p);
        setState({ products, state: 'done' });
      })
      .catch(() => mine === run.current && setState((s) => ({ ...s, state: 'error' })));
  }, [idsKey]);
  useFocusEffect(reload);
  return { ...state, reload };
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
  offline: { fontSize: 14, color: colors.textMuted, paddingHorizontal: 16, paddingTop: 8 },
  rowSub: { fontSize: 13, color: colors.textMuted, marginTop: 2, lineHeight: 18 },
});
