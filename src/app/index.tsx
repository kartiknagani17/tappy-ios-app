import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Logo } from '../components/ui';
import { useStoreReady } from '../lib/boot';
import { useStore } from '../lib/store';
import { colors } from '../theme';

export default function Splash() {
  // Same fail-safe as the root layout: never wait forever on storage.
  const hydrated = useStoreReady();

  useEffect(() => {
    if (!hydrated) return;
    const t = setTimeout(() => {
      router.replace(useStore.getState().onboarded ? '/(tabs)/scan' : '/welcome');
    }, 1300);
    return () => clearTimeout(t);
  }, [hydrated]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' }}>
      <StatusBar style="dark" />
      <Animated.View entering={FadeIn.duration(500)}>
        <Logo size={96} />
      </Animated.View>
    </View>
  );
}
