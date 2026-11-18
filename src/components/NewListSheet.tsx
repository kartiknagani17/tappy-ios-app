import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { MAX_LIST_NAME } from '../lib/store';
import { colors, noOutline, radius } from '../theme';
import { BottomSheet } from './BottomSheet';
import { Button } from './ui';

/** Ask for a name, then call onSave(name). Used to create and rename lists. */
export function NewListSheet({
  visible,
  onClose,
  onSave,
  title = 'New list',
  initial = '',
  saveLabel = 'Create list',
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (name: string) => void;
  title?: string;
  initial?: string;
  saveLabel?: string;
}) {
  const [name, setName] = useState(initial);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (visible) setName(initial);
  }, [visible, initial]);
  const ok = name.trim().length > 0;
  return (
    <BottomSheet visible={visible} onClose={onClose} handle>
      <View style={styles.body}>
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        <TextInput
          testID="list-name"
          accessibilityLabel="List name"
          value={name}
          onChangeText={setName}
          placeholder="Name your list"
          placeholderTextColor={colors.textSubtle}
          maxLength={MAX_LIST_NAME}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={() => ok && onSave(name)}
          style={[styles.input, noOutline]}
        />
        <Button title={saveLabel} disabled={!ok} onPress={() => onSave(name)} style={{ marginTop: 16 }} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingBottom: 8 },
  title: { fontSize: 22, fontWeight: '600', color: colors.ink, marginVertical: 8 },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    fontSize: 17,
    color: colors.ink,
    marginTop: 8,
  },
});
