import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { progressFor, type Step } from '../lib/flow';
import { colors } from '../theme';
import { Footer, OnboardingHeader, Screen } from './ui';

export function QuestionLayout({
  step,
  title,
  subtitle,
  children,
  footer,
  scroll = true,
  showProgress = true,
}: {
  step: Step;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  scroll?: boolean;
  showProgress?: boolean;
}) {
  const body = (
    <Animated.View entering={FadeIn.duration(250)}>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      <View style={{ marginTop: 18 }}>{children}</View>
    </Animated.View>
  );
  return (
    <Screen>
      <OnboardingHeader progress={showProgress ? progressFor(step) : undefined} />
      {scroll ? (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {body}
        </ScrollView>
      ) : (
        <View style={[styles.content, { flex: 1 }]}>{body}</View>
      )}
      {footer ? <Footer>{footer}</Footer> : null}
    </Screen>
  );
}

export const qStyles = StyleSheet.create({
  stack: { gap: 12 },
});

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '600', color: colors.ink, letterSpacing: -0.4 },
  subtitle: { fontSize: 15, lineHeight: 22, color: colors.text, marginTop: 10 },
});
