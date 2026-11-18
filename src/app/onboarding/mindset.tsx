import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { BottomSheet } from '../../components/BottomSheet';
import { QuestionLayout, qStyles } from '../../components/QuestionLayout';
import { Button, OptionCard, TextLink } from '../../components/ui';
import { api } from '../../lib/api';
import { goNext } from '../../lib/flow';
import { useStore } from '../../lib/store';
import { colors, radius, noOutline } from '../../theme';

const OPTIONS = [
  { id: 'new-diet', emoji: '📝', label: "I'm starting a new, specific diet" },
  { id: 'following', emoji: '🕰️', label: "I've been following my diet for a while" },
  { id: 'medical', emoji: '🩺', label: 'I follow a diet for a medical condition' },
  { id: 'healthier', emoji: '🌱', label: 'I want to eat healthier' },
];

export default function Mindset() {
  const mindset = useStore((s) => s.mindset);
  const set = useStore((s) => s.set);
  const [clinician, setClinician] = useState(false);

  return (
    <>
      <QuestionLayout
        step="mindset"
        title="How do you think about food right now?"
        footer={
          <>
            {mindset ? (
              <Button testID="continue" title="Continue" onPress={() => goNext('mindset')} />
            ) : (
              <Button
                testID="skip"
                title="Skip"
                variant="outline"
                onPress={() => {
                  set({ mindset: undefined });
                  goNext('mindset');
                }}
              />
            )}
            <TextLink title="I'm a clinician" onPress={() => setClinician(true)} style={{ textAlign: 'center', fontSize: 14 }} />
          </>
        }
      >
        <View style={qStyles.stack}>
          {OPTIONS.map((o) => (
            <OptionCard
              key={o.id}
              testID={`opt-${o.id}`}
              emoji={o.emoji}
              label={o.label}
              selected={mindset === o.id}
              onPress={() => set({ mindset: mindset === o.id ? undefined : o.id, goal: undefined })}
            />
          ))}
        </View>
      </QuestionLayout>
      <ClinicianSheet visible={clinician} onClose={() => setClinician(false)} />
    </>
  );
}

function ClinicianSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = /^\S+@\S+\.\S+$/.test(email.trim());
  const submit = async () => {
    if (!valid || sending) return;
    setSending(true);
    setError(null);
    try {
      await api.feedback('Clinician access', `Clinician access request from ${email.trim()}`);
      setSent(true);
    } catch {
      setError('Couldn’t send that. Check your connection and try again.');
    } finally {
      setSending(false);
    }
  };
  return (
    <BottomSheet visible={visible} onClose={onClose} handle>
      <View style={styles.sheet}>
        <Text style={styles.title}>{sent ? 'Thanks! 🙌' : 'Tappy for clinicians'}</Text>
        <Text style={styles.body}>
          {sent
            ? "We'll reach out soon with tools to share dietary profiles with your patients."
            : 'Dietitians and doctors can build dietary profiles for patients and share them in one tap. Leave your work email and we’ll be in touch.'}
        </Text>
        {sent ? (
          <Button title="Done" onPress={onClose} />
        ) : (
          <>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="Work email"
              placeholderTextColor={colors.textSubtle}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              style={[styles.input, noOutline]}
            />
            {error ? <Text style={[styles.body, { color: colors.danger }]}>{error}</Text> : null}
            <Button title="Request access" disabled={!valid} loading={sending} onPress={submit} />
          </>
        )}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: { paddingHorizontal: 16, paddingTop: 12, gap: 14 },
  title: { fontSize: 22, fontWeight: '600', color: colors.ink },
  body: { fontSize: 15, lineHeight: 22, color: colors.text },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    height: 52,
    paddingHorizontal: 16,
    fontSize: 16,
    color: colors.ink,
  },
});
