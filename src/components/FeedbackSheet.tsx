import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { haptic } from '../lib/haptics';
import { colors, radius, noOutline } from '../theme';
import { BottomSheet } from './BottomSheet';
import { Button } from './ui';

type Props = {
  visible: boolean;
  onClose: () => void;
  header: string;
  title: string;
  body: string;
  placeholder?: string;
};

/**
 * Full-height sheet with Cancel / Next in the header, used for
 * "Don't see an ingredient?" and "Feedback on this restriction?".
 */
export function FeedbackSheet(props: Props) {
  return (
    <BottomSheet visible={props.visible} onClose={props.onClose} full>
      {/* Remount on open so the form starts empty each time. */}
      <FeedbackBody key={String(props.visible)} {...props} />
    </BottomSheet>
  );
}

function FeedbackBody({ onClose, header, title, body, placeholder = 'Let us know here!' }: Props) {
  const [text, setText] = useState('');
  const [sent, setSent] = useState(false);
  const canSend = text.trim().length > 0;

  return (
    <>
      <View style={styles.bar}>
        <Pressable accessibilityRole="button" hitSlop={10} onPress={onClose}>
          <Text style={styles.barBtn}>Cancel</Text>
        </Pressable>
        <Text style={styles.barTitle} numberOfLines={1}>
          {header}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSend || sent }}
          hitSlop={10}
          disabled={!canSend || sent}
          onPress={() => {
            haptic.success();
            setSent(true);
          }}
        >
          <Text style={[styles.barBtn, (!canSend || sent) && { opacity: 0.35 }]}>Next</Text>
        </Pressable>
      </View>
      <View style={styles.body}>
        {sent ? (
          <>
            <Text style={styles.title}>Thank you! 💜</Text>
            <Text style={styles.lead}>We read every message. Your feedback helps us make Tapi better for everyone.</Text>
            <Button title="Done" onPress={onClose} style={{ marginTop: 24 }} />
          </>
        ) : (
          <>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.lead}>{body}</Text>
            <TextInput
              testID="feedback-input"
              value={text}
              onChangeText={setText}
              placeholder={placeholder}
              placeholderTextColor={colors.textSubtle}
              multiline
              autoFocus
              style={[styles.input, noOutline]}
              textAlignVertical="top"
            />
          </>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 64, gap: 12 },
  barBtn: { color: colors.purple, fontSize: 17, fontWeight: '500' },
  barTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600', color: colors.ink },
  body: { paddingHorizontal: 16, paddingTop: 20 },
  title: { fontSize: 24, fontWeight: '600', color: colors.ink },
  lead: { fontSize: 16, lineHeight: 23, color: colors.textMuted, marginTop: 10 },
  input: {
    marginTop: 24,
    minHeight: 96,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
    fontSize: 16,
    color: colors.ink,
  },
});
