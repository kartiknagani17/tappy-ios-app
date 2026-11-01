import { View } from 'react-native';
import { QuestionLayout, qStyles } from '../../components/QuestionLayout';
import { Button, OptionCard } from '../../components/ui';
import { goNext } from '../../lib/flow';
import { useStore } from '../../lib/store';

const OPTIONS = [
  { days: 7, sub: 'Good' },
  { days: 14, sub: 'Great' },
  { days: 30, sub: 'Amazing' },
  { days: 90, sub: 'Strong start' },
];

export default function Duration() {
  const duration = useStore((s) => s.duration);
  const set = useStore((s) => s.set);
  return (
    <QuestionLayout
      step="duration"
      title="How long do you want to try this diet?"
      subtitle="Select a timeframe so Tappy can support you while you get started."
      footer={
        duration ? (
          <Button testID="continue" title="Continue" onPress={() => goNext('duration')} />
        ) : (
          <Button testID="skip" title="Skip" variant="outline" onPress={() => goNext('duration')} />
        )
      }
    >
      <View style={qStyles.stack}>
        {OPTIONS.map((o) => (
          <OptionCard
            key={o.days}
            testID={`opt-${o.days}`}
            label={`${o.days} days`}
            subtitle={o.sub}
            selected={duration === o.days}
            onPress={() => set({ duration: duration === o.days ? undefined : o.days })}
          />
        ))}
      </View>
    </QuestionLayout>
  );
}
