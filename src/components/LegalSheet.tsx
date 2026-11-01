import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
// Same text the server publishes at /terms and /privacy.
import { LEGAL_DOCS } from '../../server/src/legal/content';
import { colors } from '../theme';
import { CloseButton } from './ui';

export type LegalDocId = 'terms' | 'privacy';

/**
 * Full Terms of Use / Privacy Policy in a popup inside the app, closed with the × at the top.
 * Pass `doc={null}` to hide it.
 */
export function LegalSheet({ doc, onClose }: { doc: LegalDocId | null; onClose: () => void }) {
  const content = doc ? LEGAL_DOCS[doc] : null;
  return (
    <Modal visible={!!content} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      {content ? (
        <SafeAreaView style={styles.root} edges={['bottom']}>
          <View style={styles.header}>
            <Text style={styles.headerTitle} accessibilityRole="header" numberOfLines={1}>
              {content.title}
            </Text>
            <View style={styles.close}>
              <CloseButton testID="legal-close" onPress={onClose} size={28} />
            </View>
          </View>
          <ScrollView contentContainerStyle={styles.content} testID={`legal-${content.id}`}>
            <Text style={styles.updated}>Last updated {content.updated}</Text>
            <Text style={styles.p}>{content.intro}</Text>
            {content.sections.map((s) => (
              <View key={s.heading}>
                <Text style={styles.h2} accessibilityRole="header">
                  {s.heading}
                </Text>
                {s.body.map((p, i) => (
                  <Text key={i} style={styles.p}>
                    {p}
                  </Text>
                ))}
              </View>
            ))}
          </ScrollView>
        </SafeAreaView>
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    paddingHorizontal: 56,
  },
  headerTitle: { fontSize: 17, fontWeight: '600', color: colors.ink },
  close: { position: 'absolute', right: 16, top: 0, bottom: 0, justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 48 },
  updated: { fontSize: 14, color: colors.textMuted, marginBottom: 12 },
  h2: { fontSize: 18, fontWeight: '700', color: colors.ink, marginTop: 24, marginBottom: 6 },
  p: { fontSize: 15, lineHeight: 22, color: colors.ink, marginBottom: 10 },
});
