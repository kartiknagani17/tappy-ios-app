import { View } from 'react-native';
import { QuestionLayout, qStyles } from '../../components/QuestionLayout';
import { Button, OptionCard } from '../../components/ui';
import { goNext } from '../../lib/flow';
import { useStore } from '../../lib/store';

const OPTIONS = ['TikTok', 'Search on App Store', 'Google Search', 'From a friend', 'Facebook', 'Instagram', 'Medical provider', 'Other'];

export default function Hear() {
  const heardFrom = useStore((s) => s.heardFrom);
  const set = useStore((s) => s.set);
  return (
    <QuestionLayout
      step="hear"
      title="How did you hear about Tapi?"
      footer={<Button testID="continue" title="Continue" disabled={!heardFrom} onPress={() => goNext('hear')} />}
    >
      <View style={qStyles.stack}>
        {OPTIONS.map((o) => (
          <OptionCard key={o} testID={`opt-${o}`} label={o} selected={heardFrom === o} onPress={() => set({ heardFrom: o })} />
        ))}
      </View>
    </QuestionLayout>
  );
}
