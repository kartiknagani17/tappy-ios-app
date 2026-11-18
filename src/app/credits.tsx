import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BackButton, Screen } from '../components/ui';
import { colors, radius } from '../theme';

const link = (url: string, label = url) => (
  <Text style={styles.link} accessibilityRole="link" onPress={() => Linking.openURL(url).catch(() => {})}>
    {label}
  </Text>
);

export default function Credits() {
  return (
    <Screen>
      <View style={styles.header}>
        <BackButton />
        <Text style={styles.headerTitle}>Data sources & credits</Text>
        <View style={{ width: 32 }} />
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.lead}>
          Tappy’s product database is built from open data. Every product shows which source it came from and when it was last updated.
        </Text>

        <View style={styles.card}>
          <Text style={styles.title}>Open Food Facts</Text>
          <Text style={styles.text}>
            Contains information from Open Food Facts, a free, collaborative database of food products, which is made available here
            under the {link('https://opendatacommons.org/licenses/odbl/1-0/', 'Open Database License (ODbL) v1.0')}. Individual contents
            of the database are under the {link('https://opendatacommons.org/licenses/dbcl/1-0/', 'Database Contents License')}, and
            product images under {link('https://creativecommons.org/licenses/by-sa/3.0/deed.en', 'CC BY-SA 3.0')}.
          </Text>
          <Text style={styles.text}>
            Tappy’s product database includes data derived from Open Food Facts; that derived database is also available under the ODbL.
            Open Food Facts does not endorse Tappy.
          </Text>
          <Text style={styles.text}>{link('https://world.openfoodfacts.org', 'openfoodfacts.org')}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>USDA FoodData Central</Text>
          <Text style={styles.text}>
            Branded Foods data from U.S. Department of Agriculture, Agricultural Research Service. FoodData Central. FoodData Central is in
            the public domain ({link('https://creativecommons.org/publicdomain/zero/1.0/', 'CC0 1.0')}). The USDA does not endorse Tappy.
          </Text>
          <Text style={styles.text}>{link('https://fdc.nal.usda.gov', 'fdc.nal.usda.gov')}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Community photos</Text>
          <Text style={styles.text}>
            When a product is missing, ingredient lists read from users’ photos are labeled “User-submitted, unverified” until they’re
            reviewed.
          </Text>
        </View>

        <Text style={styles.disclaimer}>
          Data can be incomplete or out of date, and manufacturers change recipes. Always read the package yourself, especially if you have
          a serious allergy. Tappy does not provide medical advice.
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 52 },
  headerTitle: { fontSize: 17, fontWeight: '600', color: colors.ink },
  body: { padding: 16, gap: 14, paddingBottom: 40 },
  lead: { fontSize: 16, lineHeight: 23, color: colors.text },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 16, gap: 8 },
  title: { fontSize: 18, fontWeight: '600', color: colors.ink },
  text: { fontSize: 14, lineHeight: 21, color: colors.text },
  link: { color: colors.link, textDecorationLine: 'underline' },
  disclaimer: { fontSize: 13, lineHeight: 19, color: colors.textMuted, marginTop: 6 },
});
