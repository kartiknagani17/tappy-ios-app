import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { DEMO_PRODUCTS, ProductTile, type DemoProduct } from '../../components/art';
import { BottomSheet } from '../../components/BottomSheet';
import { ProductSheet } from '../../components/ProductSheet';
import { Button, Screen } from '../../components/ui';
import { rateNames, worst } from '../../lib/ratings';
import { useStore } from '../../lib/store';
import { colors, radius } from '../../theme';

export default function Lists() {
  const saved = useStore((s) => s.saved);
  const account = useStore((s) => s.account);
  const restrictions = useStore((s) => s.restrictions);
  const overrides = useStore((s) => s.ingredientOverrides);
  const [product, setProduct] = useState<DemoProduct | null>(null);
  const [settings, setSettings] = useState(false);
  const items = DEMO_PRODUCTS.filter((p) => saved.includes(p.id));

  const confirm = (title: string, msg: string, onOk: () => void) => {
    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n\n${msg}`)) onOk();
      return;
    }
    Alert.alert(title, msg, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Continue', style: 'destructive', onPress: onOk },
    ]);
  };

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
        <Pressable style={styles.banner} onPress={() => router.push({ pathname: '/auth', params: { mode: 'signup' } })}>
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
          <Pressable style={{ flex: 1 }} onPress={() => setProduct(item)}>
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
        <View style={{ paddingHorizontal: 16 }}>
          <Text style={styles.sheetTitle}>Settings</Text>
          {account ? <Text style={styles.account}>Signed in as {account.email}</Text> : null}
          <Row
            icon="sliders"
            label="Edit dietary profile"
            onPress={() => {
              setSettings(false);
              router.push({ pathname: '/onboarding/profile', params: { edit: '1' } });
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
          <Row
            icon="refresh-ccw"
            label="Reset app & restart onboarding"
            danger
            onPress={() =>
              confirm('Reset Tapi?', 'This clears your profile and restarts onboarding on this device.', () => {
                setSettings(false);
                useStore.getState().resetAll();
                router.replace('/welcome');
              })
            }
          />
        </View>
      </BottomSheet>
    </Screen>
  );
}

function Row({
  icon,
  label,
  onPress,
  danger,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" style={styles.row} onPress={onPress}>
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
});
