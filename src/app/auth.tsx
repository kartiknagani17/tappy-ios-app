import { AntDesign, Feather, FontAwesome } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Logo, Screen, TextLink, Tappable } from '../components/ui';
import {
  AUTH_ENABLED,
  MIN_PASSWORD,
  isValidEmail,
  requestPasswordReset,
  signIn,
  signInWithProvider,
  signUp,
  socialProviders,
  type AuthResult,
  type SocialProvider,
} from '../lib/auth';
import { haptic } from '../lib/haptics';
import { useStore } from '../lib/store';
import { colors, noOutline, radius } from '../theme';

/**
 * Account screen.
 *
 * Accounts have no backend yet (AUTH_ENABLED = false in src/lib/auth.ts). In that state this screen
 * says so plainly: the profile lives on this device, nobody is "signed in", no profile is restored
 * and no reset email is sent. Once `signIn` / `signUp` / `requestPasswordReset` are implemented and
 * AUTH_ENABLED is true, the form below talks to them; only providers that are really wired up are shown.
 */
export default function Auth() {
  const params = useLocalSearchParams<{ mode?: string; prompt?: string }>();
  const fromPrompt = params.prompt === '1';
  if (!AUTH_ENABLED) return <AccountsUnavailable fromPrompt={fromPrompt} />;
  return <AuthForm initialMode={params.mode === 'login' ? 'login' : 'signup'} fromPrompt={fromPrompt} />;
}

function close() {
  if (router.canGoBack()) router.back();
  else router.replace(useStore.getState().onboarded ? '/(tabs)/scan' : '/welcome');
}

function AccountsUnavailable({ fromPrompt }: { fromPrompt: boolean }) {
  const onboarded = useStore((s) => s.onboarded);
  const dismiss = () => {
    useStore.getState().set({ accountPromptDismissed: true });
    close();
  };
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topBar}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={12} onPress={dismiss}>
            <Feather name="x" size={26} color={colors.ink} />
          </Pressable>
        </View>
        <View style={{ alignItems: 'center' }}>
          <Logo size={40} />
          <Text style={styles.title}>Accounts are coming soon</Text>
          <Text style={[styles.sub, { textAlign: 'center' }]}>
            Tapi doesn’t have accounts yet. Your profile, saved products and settings are stored only on this device, so there’s
            nothing to log in to.
          </Text>
          <Text style={[styles.sub, { textAlign: 'center', fontSize: 15 }]}>
            If you delete the app or switch phones, you’ll need to set up your profile again.
          </Text>
        </View>
        <View style={{ marginTop: 32 }}>
          {onboarded ? (
            <Button testID="ok" title={fromPrompt ? 'Got it' : 'OK'} onPress={dismiss} />
          ) : (
            <Button testID="setup" title="Set up my profile" onPress={dismiss} />
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

function AuthForm({ initialMode, fromPrompt }: { initialMode: 'signup' | 'login'; fromPrompt: boolean }) {
  const [mode, setMode] = useState<'signup' | 'login'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState<null | 'email' | 'reset' | SocialProvider>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Guards against double taps / Return + button firing twice before React re-renders.
  const busy = useRef(false);
  const set = useStore((s) => s.set);
  const providers = socialProviders();

  const emailOk = isValidEmail(email);
  const pwOk = password.length >= MIN_PASSWORD;
  const canSubmit = emailOk && pwOk && !loading;

  const run = async (kind: 'email' | 'reset' | SocialProvider, fn: () => Promise<void>) => {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    setNotice(null);
    setLoading(kind);
    try {
      await fn();
    } catch (e) {
      haptic.warning();
      setError(e instanceof Error && e.message ? e.message : 'Something went wrong. Please try again.');
    } finally {
      busy.current = false;
      setLoading(null);
    }
  };

  const finish = (result: AuthResult) => {
    haptic.success();
    set({ account: { email: result.email, provider: result.provider }, accountPromptDismissed: true });
    if (!useStore.getState().onboarded) {
      // Signing in does not restore a dietary profile yet, so the user still sets one up.
      // Never mark someone onboarded with an empty profile: every scan would read "No conflicts found".
      router.replace('/onboarding/mindset');
      return;
    }
    close();
  };

  const submit = () => {
    if (!emailOk) return setError('Enter a valid email address.');
    if (!pwOk) return setError(`Password must be at least ${MIN_PASSWORD} characters.`);
    void run('email', async () => {
      const addr = email.trim();
      finish(mode === 'signup' ? await signUp(addr, password) : await signIn(addr, password));
    });
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
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              maxLength={254}
              editable={!loading}
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
                autoCorrect={false}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                textContentType={mode === 'signup' ? 'newPassword' : 'password'}
                maxLength={128}
                editable={!loading}
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
            {mode === 'signup' && password.length > 0 && !pwOk ? <Text style={styles.hint}>Use at least {MIN_PASSWORD} characters.</Text> : null}
            {error ? (
              <Text style={styles.error} accessibilityLiveRegion="polite">
                {error}
              </Text>
            ) : null}
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
                title={loading === 'reset' ? 'Sending…' : 'Forgot password?'}
                style={{ textAlign: 'center' }}
                onPress={() => {
                  if (!emailOk) return setError('Enter your email above first.');
                  void run('reset', async () => {
                    const addr = email.trim();
                    await requestPasswordReset(addr);
                    // Only reached once the backend confirms the request.
                    setNotice(`If an account exists for ${addr}, we’ve sent a password reset link.`);
                  });
                }}
              />
            ) : null}
          </View>

          {providers.length ? (
            <>
              <View style={styles.or}>
                <View style={styles.orLine} />
                <Text style={styles.orText}>or</Text>
                <View style={styles.orLine} />
              </View>
              <View style={{ gap: 14 }}>
                {providers.map((p) => (
                  <SocialButton
                    key={p}
                    label={`Continue with ${PROVIDER_LABEL[p]}`}
                    loading={loading === p}
                    disabled={!!loading}
                    icon={PROVIDER_ICON[p]}
                    onPress={() => void run(p, async () => finish(await signInWithProvider(p)))}
                  />
                ))}
              </View>
            </>
          ) : null}

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
                close();
              }}
            />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const PROVIDER_LABEL: Record<SocialProvider, string> = { apple: 'Apple', google: 'Google', facebook: 'Facebook' };
const PROVIDER_ICON: Record<SocialProvider, React.ReactNode> = {
  apple: <AntDesign name="apple" size={24} color="#000" />,
  google: <AntDesign name="google" size={22} color="#4285F4" />,
  facebook: <FontAwesome name="facebook-official" size={24} color="#1877F2" />,
};

function SocialButton({
  label,
  icon,
  onPress,
  loading,
  disabled,
}: {
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <Tappable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} disabled={loading || disabled} style={styles.social}>
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
