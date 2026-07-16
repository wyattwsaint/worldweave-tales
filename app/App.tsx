import { StatusBar } from "expo-status-bar";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { TIERS, AGE_BANDS, ARC_SHAPES, CURATED_VIRTUES, GUARDRAILS } from "@wwt/domain";

/**
 * Scaffold home screen. Proves the shared domain model imports and renders.
 * Real screens (Library -> Storyworld -> Wizard -> Card viewer -> PDF export)
 * come next; this just shows the design is wired end-to-end.
 */
export default function App() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Worldweave Tales</Text>
      <Text style={styles.subtitle}>
        Parent-led, explicitly-Christian bedtime stories with consistent, canonical card art.
      </Text>

      <Section title="Tiers (scale story depth)">
        {Object.entries(TIERS).map(([name, cfg]) => (
          <Text key={name} style={styles.item}>
            • {name}: {cfg.newEntityCap} new cards/arc, {cfg.wizardDepth} questions
          </Text>
        ))}
      </Section>

      <Section title="Age bands (flex length + peril ceiling)">
        {Object.entries(AGE_BANDS).map(([name, cfg]) => (
          <Text key={name} style={styles.item}>
            • {name} ({cfg.approxAges}): ~{cfg.targetMinutes} min, {cfg.beatCount} cards
          </Text>
        ))}
      </Section>

      <Section title="Arc shapes">
        <Text style={styles.item}>{ARC_SHAPES.join(" · ")}</Text>
      </Section>

      <Section title="Teaching virtues">
        <Text style={styles.item}>{CURATED_VIRTUES.join(" · ")}</Text>
      </Section>

      <Section title="Guardrail identity">
        <Text style={styles.item}>{GUARDRAILS.identity}</Text>
      </Section>

      <StatusBar style="auto" />
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 72, gap: 8 },
  title: { fontSize: 28, fontWeight: "700" },
  subtitle: { fontSize: 15, color: "#444", marginBottom: 12 },
  section: { marginTop: 16, gap: 4 },
  sectionTitle: { fontSize: 16, fontWeight: "600", color: "#222" },
  item: { fontSize: 14, color: "#333", lineHeight: 20 },
});
