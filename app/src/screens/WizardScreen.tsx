import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import {
  AGE_BANDS,
  ARC_SHAPES,
  CURATED_VIRTUES,
  TIERS,
  type AgeBand,
  type ArcShape,
  type GenerateArcRequest,
  type Tier,
} from "@wwt/domain";
import { buildWizardAnswers, type RawWizardPicks } from "../flow/buildWizardAnswers";
import { FakeProxyClient } from "../api/fakeProxyClient";
import { useNav } from "../nav/NavContext";

const TIER_NAMES = Object.keys(TIERS) as Tier[];
const AGE_NAMES = Object.keys(AGE_BANDS) as AgeBand[];

/**
 * MINIMAL fixed-question wizard (not the tier-scaled tree — that's a later
 * slice). Collects a fixed set of picks, normalizes via buildWizardAnswers,
 * generates an arc with the fake client, then routes to card-pick.
 */
export default function WizardScreen() {
  const { navigate } = useNav();

  const [tier, setTier] = useState<Tier>("beginner");
  const [ageBand, setAgeBand] = useState<AgeBand>("preschool");
  const [shape, setShape] = useState<ArcShape>("quest");
  const [virtue, setVirtue] = useState<string>(CURATED_VIRTUES[0]);
  const [closingVerseEnabled, setClosingVerseEnabled] = useState(false);
  const [world, setWorld] = useState("");
  const [hero, setHero] = useState("");
  const [villain, setVillain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    setBusy(true);
    setError(null);
    try {
      const raw: RawWizardPicks = {
        tier,
        ageBand,
        shape,
        virtue,
        closingVerseEnabled,
        choices: { world, hero, villain },
      };
      const answers = buildWizardAnswers(raw);
      const req: GenerateArcRequest = {
        attestationToken: "dev-attestation-token",
        deviceId: "dev-device-id",
        answers,
      };
      const response = await new FakeProxyClient().generateArc(req);
      navigate({ screen: "cardpick", params: { response, answers } });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>New Story</Text>

      <Field label="Tier">
        <ChipRow options={TIER_NAMES} value={tier} onSelect={setTier} />
      </Field>

      <Field label="Age band">
        <ChipRow options={AGE_NAMES} value={ageBand} onSelect={setAgeBand} />
      </Field>

      <Field label="Arc shape">
        <ChipRow options={ARC_SHAPES} value={shape} onSelect={setShape} />
      </Field>

      <Field label="Teaching virtue">
        <ChipRow options={[...CURATED_VIRTUES]} value={virtue} onSelect={setVirtue} />
      </Field>

      <Field label="Closing verse">
        <Pressable
          style={[styles.toggle, closingVerseEnabled && styles.toggleOn]}
          onPress={() => setClosingVerseEnabled((v) => !v)}
        >
          <Text style={[styles.toggleText, closingVerseEnabled && styles.toggleTextOn]}>
            {closingVerseEnabled ? "On" : "Off"}
          </Text>
        </Pressable>
      </Field>

      <Field label="World">
        <TextInput
          style={styles.input}
          value={world}
          onChangeText={setWorld}
          placeholder="e.g. Willowmere"
          placeholderTextColor="#999"
        />
      </Field>

      <Field label="Hero">
        <TextInput
          style={styles.input}
          value={hero}
          onChangeText={setHero}
          placeholder="e.g. a brave little mouse"
          placeholderTextColor="#999"
        />
      </Field>

      <Field label="Villain">
        <TextInput
          style={styles.input}
          value={villain}
          onChangeText={setVillain}
          placeholder="e.g. a grumpy shadow"
          placeholderTextColor="#999"
        />
      </Field>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        style={[styles.primary, busy && styles.primaryDisabled]}
        onPress={onSubmit}
        disabled={busy}
      >
        <Text style={styles.primaryText}>{busy ? "Weaving…" : "Weave the tale"}</Text>
      </Pressable>
    </ScrollView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

function ChipRow<T extends string>({
  options,
  value,
  onSelect,
}: {
  options: T[];
  value: T;
  onSelect: (v: T) => void;
}) {
  return (
    <View style={styles.chipRow}>
      {options.map((opt) => {
        const on = opt === value;
        return (
          <Pressable
            key={opt}
            style={[styles.chip, on && styles.chipOn]}
            onPress={() => onSelect(opt)}
          >
            <Text style={[styles.chipText, on && styles.chipTextOn]}>{opt}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 64, gap: 18 },
  title: { fontSize: 28, fontWeight: "700", color: "#1a1a2e" },
  field: { gap: 8 },
  label: { fontSize: 15, fontWeight: "600", color: "#333" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: "#eee",
    borderWidth: 1,
    borderColor: "#ddd",
  },
  chipOn: { backgroundColor: "#4a3f8c", borderColor: "#4a3f8c" },
  chipText: { fontSize: 14, color: "#444" },
  chipTextOn: { color: "#fff", fontWeight: "600" },
  toggle: {
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 999,
    backgroundColor: "#eee",
    borderWidth: 1,
    borderColor: "#ddd",
  },
  toggleOn: { backgroundColor: "#4a3f8c", borderColor: "#4a3f8c" },
  toggleText: { fontSize: 14, color: "#444" },
  toggleTextOn: { color: "#fff", fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    color: "#222",
    backgroundColor: "#fafafa",
  },
  error: { color: "#c0392b", fontSize: 14 },
  primary: {
    marginTop: 8,
    backgroundColor: "#4a3f8c",
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: "center",
  },
  primaryDisabled: { opacity: 0.6 },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
