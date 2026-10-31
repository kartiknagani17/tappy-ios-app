import { View } from 'react-native';
import { QuestionLayout, qStyles } from '../../components/QuestionLayout';
import { Button, OptionCard } from '../../components/ui';
import { goNext } from '../../lib/flow';
import { useStore } from '../../lib/store';

const OPTIONS = [
  { id: 'lose-weight', label: 'Lose weight sustainably' },
  { id: 'wellness', label: 'Follow a wellness diet (e.g., anti-inflammatory)' },
  { id: 'avoid', label: 'Avoid controversial and unhealthy ingredients' },
  { id: 'none', label: 'None of these—let me choose my own needs' },
];

export default function Goal() {
  const goal = useStore((s) => s.goal);
  const set = useStore((s) => s.set);
  const setRestriction = useStore((s) => s.setRestriction);

  const onContinue = () => {
    // Seed a sensible starting profile for the chosen goal (user can edit everything later).
    setRestriction('obesity', goal === 'lose-weight' ? { level: 'preference' } : null);
    setRestriction('anti-inflammatory', goal === 'wellness' ? { level: 'preference' } : null);
    goNext('goal');
  };

  return (
    <QuestionLayout
      step="goal"
      title="What does eating healthier mean to you?"
      subtitle="Select a primary goal so we can recommend the best starting profile."
      footer={<Button testID="continue" title="Continue" disabled={!goal} onPress={onContinue} />}
    >
      <View style={qStyles.stack}>
        {OPTIONS.map((o) => (
          <OptionCard key={o.id} testID={`opt-${o.id}`} label={o.label} selected={goal === o.id} onPress={() => set({ goal: o.id })} />
        ))}
      </View>
    </QuestionLayout>
  );
}
