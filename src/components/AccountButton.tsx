import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet } from 'react-native';
import { haptic } from '../lib/haptics';
import { colors } from '../theme';

/** The round account button at the top right of Lists and Grocery. It opens the account and settings sheet. */
export function AccountButton({ onPress, testID = 'settings' }: { onPress: () => void; testID?: string }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel="Account and settings"
      hitSlop={6}
      style={({ pressed }) => [styles.btn, pressed && { opacity: 0.7 }]}
      onPress={() => {
        haptic.select();
        onPress();
      }}
    >
      <Feather name="user" size={24} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
});
