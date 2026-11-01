import { View } from 'react-native';
import { QuestionLayout, qStyles } from '../../components/QuestionLayout';
import { Button, OptionCard } from '../../components/ui';
import { goNext } from '../../lib/flow';
import { useStore } from '../../lib/store';

export default function Other() {
  const wanted = useStore((s) => s.restrictionsWanted);
  const set = useStore((s) => s.set);
  return (
    <QuestionLayout
      step="other"
      title="Do you have other dietary restrictions?"
      subtitle="Tell us about any other dietary needs so Tappy can personalize your recommendations."
      footer={<Button testID="continue" title="Continue" disabled={wanted === undefined} onPress={() => goNext('other')} />}
    >
      <View style={qStyles.stack}>
        <OptionCard
          testID="opt-no"
          label="No, I'm all set"
          selected={wanted === false}
          onPress={() => set({ restrictionsWanted: false })}
        />
        <OptionCard
          testID="opt-yes"
          label="Yes, let me add them"
          selected={wanted === true}
          onPress={() => set({ restrictionsWanted: true })}
        />
      </View>
    </QuestionLayout>
  );
}
