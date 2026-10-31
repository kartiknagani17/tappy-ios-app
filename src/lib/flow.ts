import { router } from 'expo-router';
import { useStore } from './store';

export type Step =
  | 'mindset'
  | 'hear'
  | 'goal'
  | 'europe'
  | 'avoid'
  | 'detective'
  | 'duration'
  | 'commit'
  | 'committed'
  | 'other'
  | 'covers'
  | 'restrictions'
  | 'profile';

/**
 * Onboarding is branching. The step list is derived from the answers so far,
 * which keeps the progress bar honest and "Continue" always goes to the right place.
 */
export function flowSteps(): Step[] {
  const { mindset, goal, restrictionsWanted, duration } = useStore.getState();
  const steps: Step[] = ['mindset', 'hear'];
  const healthier = mindset === 'healthier';
  // Skipping the duration question skips the commitment screens too.
  const durationSteps: Step[] = duration ? ['duration', 'commit', 'committed'] : ['duration'];
  if (healthier && goal !== 'none') {
    steps.push('goal');
    if (goal === 'avoid') steps.push('europe', 'avoid');
    steps.push('detective', ...durationSteps, 'other');
    if (restrictionsWanted !== false) steps.push('covers', 'restrictions');
  } else {
    if (healthier) steps.push('goal');
    steps.push('covers', 'restrictions');
    if (mindset === 'new-diet') steps.push(...durationSteps);
  }
  steps.push('profile');
  return steps;
}

export function progressFor(step: Step): number {
  const steps = flowSteps();
  const i = steps.indexOf(step);
  if (i < 0) return 0;
  // Start near 0 and finish around 90% on the profile review screen.
  return 0.02 + (i / (steps.length - 1)) * 0.88;
}

export function goNext(from: Step) {
  const steps = flowSteps();
  const i = steps.indexOf(from);
  const next = steps[i + 1];
  if (!next) return;
  router.push(`/onboarding/${next}`);
}
