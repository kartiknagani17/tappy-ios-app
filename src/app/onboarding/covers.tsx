import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { BottomSheet } from '../../components/BottomSheet';
import { Button, Footer, OnboardingHeader, Screen, TextLink } from '../../components/ui';
import { goNext, progressFor } from '../../lib/flow';
import { colors } from '../../theme';

export default function Covers() {
  const [revealed, setRevealed] = useState(false);
  const [why, setWhy] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), 1100);
    return () => clearTimeout(t);
  }, []);

  return (
    <Screen>
      <OnboardingHeader progress={progressFor('covers')} />
      <View style={styles.content}>
        <Animated.Text entering={FadeInDown.duration(500)} style={styles.title}>
          Tapi covers over 2,900 dietary needs
        </Animated.Text>
        <Animated.Text entering={FadeInDown.delay(350).duration(500)} style={styles.lead}>
          Next, select your diets, allergies, and avoidances.
        </Animated.Text>
        {revealed ? (
          <Animated.View entering={FadeIn.duration(450)}>
            <Text style={styles.lead}>You'll also set how strictly you follow them.</Text>
            <TextLink title="Why do I need to tell you this?" onPress={() => setWhy(true)} style={{ marginTop: 40, fontSize: 15 }} />
          </Animated.View>
        ) : null}
      </View>
      {revealed ? (
        <Animated.View entering={FadeIn.duration(300)}>
          <Footer>
            <Button testID="continue" title="Continue" onPress={() => goNext('covers')} />
          </Footer>
        </Animated.View>
      ) : null}

      <BottomSheet visible={why} onClose={() => setWhy(false)} handle>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>Why is this important?</Text>
          <Text style={styles.sheetBody}>
            By sharing your dietary restrictions, Tapi can recommend groceries that likely fit your needs.
          </Text>
          <Text style={styles.sheetBody}>
            Please choose your restrictions carefully—selecting too many may significantly limit the options available to you on Tapi.
          </Text>
        </View>
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 28 },
  title: { fontSize: 32, lineHeight: 40, fontWeight: '600', color: colors.ink, letterSpacing: -0.5 },
  lead: { fontSize: 23, lineHeight: 31, color: colors.text, marginTop: 30 },
  sheet: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, gap: 16 },
  sheetTitle: { fontSize: 22, fontWeight: '600', color: colors.ink },
  sheetBody: { fontSize: 16, lineHeight: 24, color: colors.text },
});
