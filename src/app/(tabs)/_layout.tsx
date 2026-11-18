import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { haptic } from '../../lib/haptics';
import { colors } from '../../theme';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

function TabIcon({ name, color, badge }: { name: IconName; color: string; badge?: string }) {
  return (
    <View>
      <MaterialCommunityIcons name={name} size={25} color={color} />
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
    </View>
  );
}

export const unstable_settings = { initialRouteName: 'scan' };

export default function TabsLayout() {
  return (
    <Tabs
      screenListeners={{ tabPress: () => haptic.select() }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.inactive,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
        tabBarStyle: { borderTopColor: colors.border, backgroundColor: '#fff' },
      }}
    >
      <Tabs.Screen
        name="grocery"
        options={{ title: 'Grocery', tabBarIcon: ({ color }) => <TabIcon name="cart-outline" color={color as string} /> }}
      />
      <Tabs.Screen
        name="scan"
        options={{ title: 'Scan', tabBarIcon: ({ color }) => <TabIcon name="line-scan" color={color as string} /> }}
      />
      <Tabs.Screen
        name="lists"
        options={{ title: 'Lists', tabBarIcon: ({ color }) => <TabIcon name="format-list-bulleted" color={color as string} /> }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -6,
    right: -26,
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  badgeText: { fontSize: 10, fontWeight: '600', color: colors.onPrimary },
});
