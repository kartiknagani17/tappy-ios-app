import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { haptic } from '../lib/haptics';
import { colors } from '../theme';
import { Button, Screen } from './ui';

export function ComingSoon({ emoji, title, body }: { emoji: string; title: string; body: string }) {
  const [notify, setNotify] = useState(false);
  return (
    <Screen>
      <View style={styles.center}>
        <Text style={{ fontSize: 64 }}>{emoji}</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
        <Button
          title={notify ? "You're on the list ✓" : 'Notify me when it’s ready'}
          variant={notify ? 'outline' : 'primary'}
          onPress={() => {
            haptic.success();
            setNotify(true);
          }}
          style={{ alignSelf: 'stretch', marginTop: 28 }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  title: { fontSize: 26, fontWeight: '600', color: colors.ink, marginTop: 16, textAlign: 'center' },
  body: { fontSize: 16, lineHeight: 23, color: colors.textMuted, marginTop: 10, textAlign: 'center' },
});
