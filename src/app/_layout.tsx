import { Stack, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Button, Logo } from '../components/ui';
import { checkSession, startProfileSync } from '../lib/auth';
import { useRouteGuard, useStoreReady } from '../lib/boot';
import { initPurchases } from '../lib/subscription';
import { colors } from '../theme';

// Keep the native splash up until the saved profile has loaded (or the fail-safe timeout passes).
SplashScreen.preventAutoHideAsync().catch(() => {});

/** Last-resort screen if rendering throws anywhere in the app. Never shows a verdict. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    SplashScreen.hide();
    if (__DEV__) console.error(error);
  }, [error]);
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}>
      <Logo size={40} />
      <Text style={{ fontSize: 22, fontWeight: '600', color: colors.ink, textAlign: 'center' }}>Something went wrong</Text>
      <Text style={{ fontSize: 16, lineHeight: 23, color: colors.textMuted, textAlign: 'center' }}>
        Tappy hit an unexpected problem. Your profile is still saved on this device.
      </Text>
      <Button title="Try again" onPress={retry} style={{ alignSelf: 'stretch', marginTop: 12 }} />
    </View>
  );
}

export default function RootLayout() {
  const ready = useStoreReady();
  useRouteGuard(ready);
  useEffect(() => {
    if (ready) SplashScreen.hide();
  }, [ready]);
  useEffect(() => {
    if (!ready) return;
    initPurchases();
    void checkSession();
    return startProfileSync();
  }, [ready]);
  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.surface },
            gestureEnabled: true,
            fullScreenGestureEnabled: true,
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen name="index" options={{ animation: 'fade', gestureEnabled: false }} />
          <Stack.Screen name="welcome" options={{ animation: 'fade', gestureEnabled: false }} />
          <Stack.Screen name="auth" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="onboarding/finishing" options={{ gestureEnabled: false, animation: 'fade' }} />
          <Stack.Screen name="onboarding/scanner-ready" options={{ gestureEnabled: false, animation: 'fade' }} />
          <Stack.Screen name="onboarding/pass" options={{ gestureEnabled: false, animation: 'fade' }} />
          <Stack.Screen name="onboarding/paywall" options={{ gestureEnabled: false, animation: 'fade' }} />
          <Stack.Screen name="onboarding/safety" options={{ gestureEnabled: false }} />
          <Stack.Screen name="(tabs)" options={{ gestureEnabled: false, animation: 'fade' }} />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
