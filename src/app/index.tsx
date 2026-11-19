import { Redirect } from 'expo-router';
import { useStore } from '../lib/store';

/**
 * Entry route. The native splash (app.json → expo-splash-screen) stays up until the saved profile
 * has loaded (see the root layout), so this goes straight on with no second, JS-drawn splash.
 */
export default function Index() {
  const onboarded = useStore((s) => s.onboarded);
  return <Redirect href={onboarded ? '/(tabs)/scan' : '/welcome'} />;
}
