import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Logo } from '../components/ui';
import { useStore } from '../lib/store';
import { colors } from '../theme';

export default function Splash() {
  const [hydrated, setHydrated] = useState(useStore.persist.hasHydrated());

  useEffect(() => {
    const unsub = useStore.persist.onFinishHydration(() => setHydrated(true));
    return unsub;
  }, []);

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
