import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AccountButton } from '../../components/AccountButton';
import { LIST_ICONS } from '../../components/ListPicker';
import { NewListSheet } from '../../components/NewListSheet';
import { SettingsSheet } from '../../components/SettingsSheet';
import { Screen } from '../../components/ui';
import { AUTH_ENABLED } from '../../lib/auth';
import { haptic } from '../../lib/haptics';
import { MAX_LISTS, useStore } from '../../lib/store';
import { colors, radius } from '../../theme';

export default function Lists() {
  const saved = useStore((s) => s.saved);
  const lists = useStore((s) => s.lists);
  const account = useStore((s) => s.account);
  const [settings, setSettings] = useState(false);
  const [creating, setCreating] = useState(false);

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          Lists
        </Text>
        <AccountButton onPress={() => setSettings(true)} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
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
            <Feather name="arrow-right" size={22} color={colors.accent} />
          </Pressable>
        ) : null}

        <ListRow
          testID="list-all"
          icon="bookmark"
          name="All Saved"
          sub={<Text style={styles.sub}>{saved.length} saved</Text>}
          onPress={() => router.push('/list/all')}
        />
        <View style={styles.divider} />

        <View style={styles.sectionHead}>
          <Text style={styles.section} accessibilityRole="header">
            My lists
          </Text>
          {lists.length < MAX_LISTS ? (
            <Pressable
              testID="new-list"
              accessibilityRole="button"
              accessibilityLabel="New list"
              style={styles.newBtn}
              onPress={() => {
                haptic.select();
                setCreating(true);
              }}
            >
              <Feather name="plus" size={18} color={colors.onPrimary} />
              <Text style={styles.newText}>New list</Text>
            </Pressable>
          ) : null}
        </View>

        {lists.map((l) => (
          <ListRow
            key={l.id}
            testID={`list-${l.id}`}
            icon={LIST_ICONS[l.icon]}
            name={l.name}
            sub={
              <View style={styles.subRow}>
                <Text style={styles.sub}>
                  {l.ids.length} {l.icon === 'cart' ? 'items' : 'saved'}
                </Text>
                <Text style={styles.sub}>·</Text>
                <Feather name="lock" size={13} color={colors.textMuted} />
                <Text style={styles.sub}>Private</Text>
              </View>
            }
            onPress={() => router.push({ pathname: '/list/[id]', params: { id: l.id } })}
          />
        ))}
      </ScrollView>

      <NewListSheet
        visible={creating}
        onClose={() => setCreating(false)}
        onSave={(name) => {
          const id = useStore.getState().createList(name);
          setCreating(false);
          if (id) router.push({ pathname: '/list/[id]', params: { id } });
        }}
      />
      <SettingsSheet visible={settings} onClose={() => setSettings(false)} />
    </Screen>
  );
}

function ListRow({
  icon,
  name,
  sub,
  onPress,
  testID,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  name: string;
  sub: React.ReactNode;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={name} style={styles.row} onPress={onPress}>
      <View style={styles.rowIcon}>
        <Feather name={icon} size={26} color={colors.ink} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowName} numberOfLines={1}>
          {name}
        </Text>
        {sub}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, height: 64 },
  title: { fontSize: 34, fontWeight: '700', color: colors.ink, letterSpacing: -0.5 },
  banner: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.lg,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bannerTitle: { fontSize: 16, fontWeight: '700', color: colors.accent },
  bannerBody: { fontSize: 14, color: colors.text, marginTop: 2, lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 16, paddingVertical: 10 },
  rowIcon: { width: 54, height: 54, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  rowName: { fontSize: 20, fontWeight: '600', color: colors.ink },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  sub: { fontSize: 16, color: colors.textMuted, marginTop: 2 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginTop: 12 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginTop: 28, marginBottom: 8 },
  section: { fontSize: 26, fontWeight: '700', color: colors.ink, letterSpacing: -0.3 },
  newBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: 16, height: 40 },
  newText: { fontSize: 16, fontWeight: '700', color: colors.onPrimary },
});
