import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { api, ApiError } from '../lib/api';
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
 * "Don't see an ingredient?" and "Feedback on this restriction?". Messages go to the server
 * (POST /api/feedback), which stores them and emails the support address.
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
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSend = text.trim().length > 0 && !sending;

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      await api.feedback(header, text.trim());
      haptic.success();
      setSent(true);
    } catch (e) {
      haptic.warning();
      setError(e instanceof ApiError ? e.message : 'Couldn’t send your feedback. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <View style={styles.bar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Cancel" hitSlop={12} onPress={onClose}>
          <Text style={styles.barBtn}>Cancel</Text>
        </Pressable>
        <Text style={styles.barTitle} numberOfLines={1}>
          {header}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send feedback"
          accessibilityState={{ disabled: !canSend || sent }}
          testID="feedback-send"
          hitSlop={12}
          disabled={!canSend || sent}
          onPress={send}
        >
          {sending ? (
            <ActivityIndicator color={colors.purple} />
          ) : (
            <Text style={[styles.barBtn, (!canSend || sent) && { opacity: 0.35 }]}>Send</Text>
          )}
        </Pressable>
      </View>
      <View style={styles.body}>
        {sent ? (
          <>
            <Text style={styles.title}>Thank you! 💜</Text>
            <Text style={styles.lead}>We read every message. Your feedback helps us make Tappy better for everyone.</Text>
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
              maxLength={2000}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
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
  error: { fontSize: 15, lineHeight: 21, color: colors.danger, marginTop: 12 },
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
