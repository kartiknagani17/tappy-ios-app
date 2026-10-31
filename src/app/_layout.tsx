import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '../theme';

export default function RootLayout() {
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
