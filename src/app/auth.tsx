import { AntDesign, Feather, FontAwesome } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Logo, Screen, TextLink, Tappable } from '../components/ui';
import { haptic } from '../lib/haptics';
import { useStore } from '../lib/store';
import { colors, noOutline, radius } from '../theme';

type Provider = 'google' | 'apple' | 'facebook';

/**
 * Auth UI. Network calls are stubbed: wire `signIn` / `signUp` to your backend
 * (e.g. Supabase, Firebase, or Clerk) and the social buttons to their SDKs.
 */
export default function Auth() {
  const params = useLocalSearchParams<{ mode?: string; prompt?: string }>();
  const [mode, setMode] = useState<'signup' | 'login'>(params.mode === 'login' ? 'login' : 'signup');
  const fromPrompt = params.prompt === '1';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState<null | 'email' | Provider>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const set = useStore((s) => s.set);

  const emailOk = /^\S+@\S+\.\S+$/.test(email.trim());
  const pwOk = password.length >= 8;
  const canSubmit = emailOk && pwOk;

  const finish = (provider: 'email' | Provider, addr: string) => {
    haptic.success();
    set({ account: { email: addr, provider }, accountPromptDismissed: true });
    if (!useStore.getState().onboarded) {
      // Logging in from the welcome screen: restore the user's profile and go to the app.
      set({ onboarded: true, agreedToTerms: true });
      router.dismissAll();
      router.replace('/(tabs)/scan');
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/scan');
  };

  const submit = async () => {
    setError(null);
    if (!canSubmit) {
      setError(!emailOk ? 'Enter a valid email address.' : 'Password must be at least 8 characters.');
      return;
    }
    setLoading('email');
    await new Promise((r) => setTimeout(r, 800));
    setLoading(null);
    finish('email', email.trim());
  };

  const social = async (p: Provider) => {
    setError(null);
    setLoading(p);
    await new Promise((r) => setTimeout(r, 800));
    setLoading(null);
    finish(p, `${p}@user`);
  };

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.topBar}>
            {router.canGoBack() && !fromPrompt ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={12} onPress={() => router.back()}>
                <Feather name="x" size={26} color={colors.ink} />
              </Pressable>
            ) : (
              <View />
            )}
          </View>
          <View style={{ alignItems: 'center' }}>
            <Logo size={40} />
            <Text style={styles.title}>{mode === 'signup' ? 'Create an account' : 'Welcome back'}</Text>
            <Text style={styles.sub}>{mode === 'signup' ? "Don't lose your progress" : 'Log in to sync your Tapi'}</Text>
          </View>

          <View style={{ gap: 16, marginTop: 28 }}>
            <TextInput
              testID="email"
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                setError(null);
              }}
              placeholder="Your Email"
              placeholderTextColor={colors.textSubtle}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              style={[styles.input, noOutline]}
              returnKeyType="next"
            />
            <View style={styles.inputWrap}>
              <TextInput
                testID="password"
                value={password}
                onChangeText={(t) => {
                  setPassword(t);
                  setError(null);
                }}
                placeholder="Your Password"
                placeholderTextColor={colors.textSubtle}
                secureTextEntry={!show}
                autoCapitalize="none"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                textContentType={mode === 'signup' ? 'newPassword' : 'password'}
                style={[styles.input, { flex: 1, borderWidth: 0 }, noOutline]}
                returnKeyType="go"
                onSubmitEditing={submit}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={show ? 'Hide password' : 'Show password'}
                hitSlop={10}
                onPress={() => setShow((v) => !v)}
                style={{ paddingHorizontal: 16 }}
              >
                <Feather name={show ? 'eye-off' : 'eye'} size={24} color="#555" />
              </Pressable>
            </View>
            {mode === 'signup' && password.length > 0 && !pwOk ? <Text style={styles.hint}>Use at least 8 characters.</Text> : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {notice ? <Text style={styles.notice}>{notice}</Text> : null}
            <Button
              testID="submit"
              title={mode === 'signup' ? 'Create account' : 'Log in'}
              disabled={!canSubmit}
              loading={loading === 'email'}
              onPress={submit}
              textStyle={{ fontWeight: '500' }}
            />
            {mode === 'login' ? (
              <TextLink
                title="Forgot password?"
                style={{ textAlign: 'center' }}
                onPress={() => {
                  if (!emailOk) setError('Enter your email above and we’ll send a reset link.');
                  else {
                    setError(null);
                    setNotice(`We sent a password reset link to ${email.trim()}.`);
                  }
                }}
              />
            ) : null}
          </View>

          <View style={styles.or}>
            <View style={styles.orLine} />
            <Text style={styles.orText}>or</Text>
            <View style={styles.orLine} />
          </View>

          <View style={{ gap: 14 }}>
            <SocialButton
              label="Continue with Google"
              loading={loading === 'google'}
              icon={<AntDesign name="google" size={22} color="#4285F4" />}
              onPress={() => social('google')}
            />
            <SocialButton
              label="Continue with Apple"
              loading={loading === 'apple'}
              icon={<AntDesign name="apple" size={24} color="#000" />}
              onPress={() => social('apple')}
            />
            <SocialButton
              label="Continue with Facebook"
              loading={loading === 'facebook'}
              icon={<FontAwesome name="facebook-official" size={24} color="#1877F2" />}
              onPress={() => social('facebook')}
            />
          </View>

          <Text style={styles.switch}>
            {mode === 'signup' ? 'Already have an account? ' : 'New to Tapi? '}
            <TextLink
              title={mode === 'signup' ? 'Log in' : 'Create account'}
              onPress={() => {
                setMode(mode === 'signup' ? 'login' : 'signup');
                setError(null);
                setNotice(null);
              }}
            />
          </Text>
          {fromPrompt ? (
            <TextLink
              title="Skip for now"
              muted
              style={{ textAlign: 'center', marginTop: 18 }}
              onPress={() => {
                set({ accountPromptDismissed: true });
                router.back();
              }}
            />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function SocialButton({ label, icon, onPress, loading }: { label: string; icon: React.ReactNode; onPress: () => void; loading?: boolean }) {
  return (
    <Tappable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} disabled={loading} style={styles.social}>
      <View style={styles.socialIcon}>{icon}</View>
      <Text style={styles.socialText}>{loading ? 'Connecting…' : label}</Text>
    </Tappable>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingBottom: 40 },
  topBar: { height: 44, justifyContent: 'center' },
  title: { fontSize: 30, fontWeight: '600', color: colors.ink, marginTop: 24, letterSpacing: -0.4 },
  sub: { fontSize: 17, color: colors.textMuted, marginTop: 6 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    height: 58,
    paddingHorizontal: 18,
    fontSize: 17,
    color: colors.ink,
  },
  inputWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  hint: { fontSize: 13, color: colors.textMuted, marginTop: -8 },
  error: { fontSize: 14, color: colors.danger },
  notice: { fontSize: 14, color: colors.greenDark },
  or: { flexDirection: 'row', alignItems: 'center', gap: 16, marginVertical: 28 },
  orLine: { flex: 1, height: 1, backgroundColor: colors.borderLight },
  orText: { color: colors.textMuted, fontSize: 15 },
  social: {
    height: 56,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.ink,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  socialIcon: { position: 'absolute', left: 24 },
  socialText: { fontSize: 18, fontWeight: '500', color: colors.ink },
  switch: { textAlign: 'center', marginTop: 28, fontSize: 15, color: colors.ink },
});
