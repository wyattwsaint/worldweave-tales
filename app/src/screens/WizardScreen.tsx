import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import {
  assembleRawPicks,
  getVisibleNodes,
  resolveValue,
  type GenerateArcRequest,
  type NodeAnswers,
  type Tier,
  type WizardNode,
} from "@wwt/domain";
import { buildWizardAnswers, type RawWizardPicks } from "../flow/buildWizardAnswers";
import { FakeProxyClient } from "../api/fakeProxyClient";
import { useNav } from "../nav/NavContext";

/**
 * GENERIC, data-driven wizard. Instead of hand-wiring a fixed set of fields, it
 * renders whatever {@link getVisibleNodes} returns for the current tier + the
 * answers gathered so far, one control per node `kind`. Because visibility is
 * recomputed every render, changing the tier (or, once threads exist, picking a
 * thread) reactively reveals/hides nodes.
 *
 * On submit it reduces the answers to {@link RawWizardPicks} via the domain
 * assembler, stamps a fresh worldId (or, for a continued thread, the thread's
 * worldId — no thread surface exists yet, so that branch is inert), then reuses
 * the unchanged buildWizardAnswers -> FakeProxyClient -> Card-Pick pipeline.
 */
export default function WizardScreen() {
  const { navigate } = useNav();

  // A single NodeAnswers bag keyed by node id — NOT one useState per field.
  // Seed the two required nodes so Beginner is completable in a couple of taps,
  // and flag that no saved threads are on offer (keeps thread-pick hidden).
  const [answers, setAnswers] = useState<NodeAnswers>({
    tier: "beginner",
    ageBand: "preschool",
    __hasThreads: false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tier = (answers.tier as Tier | undefined) ?? "beginner";
  const visibleNodes = useMemo(() => getVisibleNodes(tier, answers), [tier, answers]);

  function setAnswer(id: string, value: string | boolean | undefined) {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  }

  // Required nodes must have an effective value before submit is allowed.
  const canSubmit = visibleNodes
    .filter((n) => n.required)
    .every((n) => resolveValue(n, answers) !== undefined && resolveValue(n, answers) !== "");

  async function onSubmit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const raw: RawWizardPicks = assembleRawPicks(answers);
      // A continued thread keeps its world; a brand-new story mints a fresh id
      // so successive stories never clobber one another (B2). No thread surface
      // exists yet, so continueThreadId is always unset -> we always mint.
      raw.worldId = raw.continueThreadId ? threadWorldId(raw.continueThreadId) : newWorldId();

      const wizardAnswers = buildWizardAnswers(raw);
      const req: GenerateArcRequest = {
        attestationToken: "dev-attestation-token",
        deviceId: "dev-device-id",
        answers: wizardAnswers,
      };
      const response = await new FakeProxyClient().generateArc(req);
      navigate({ screen: "cardpick", params: { response, answers: wizardAnswers } });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>New Story</Text>

      {visibleNodes.map((node) => (
        <Field key={node.id} label={labelFor(node.id)}>
          <NodeControl node={node} answers={answers} onChange={setAnswer} />
        </Field>
      ))}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        style={[styles.primary, (busy || !canSubmit) && styles.primaryDisabled]}
        onPress={onSubmit}
        disabled={busy || !canSubmit}
      >
        <Text style={styles.primaryText}>{busy ? "Weaving…" : "Weave the tale"}</Text>
      </Pressable>
    </ScrollView>
  );
}

/** Render a single wizard node by its `kind`. */
function NodeControl({
  node,
  answers,
  onChange,
}: {
  node: WizardNode;
  answers: NodeAnswers;
  onChange: (id: string, value: string | boolean | undefined) => void;
}) {
  switch (node.kind) {
    case "single-select":
    case "dial": {
      // The dial is rendered as a chip row for this slice (no slider yet).
      const options = [...(node.options ?? [])];
      const current = (answers[node.id] as string | undefined) ?? (node.default as string | undefined);
      return (
        <ChipRow
          options={options}
          value={current}
          onSelect={(v) => onChange(node.id, v)}
        />
      );
    }
    case "text": {
      const value = (answers[node.id] as string | undefined) ?? (node.default as string | undefined) ?? "";
      return (
        <TextInput
          testID={node.id}
          style={styles.input}
          value={value}
          onChangeText={(v: string) => onChange(node.id, v)}
          placeholder={placeholderFor(node.id)}
          placeholderTextColor="#999"
        />
      );
    }
    case "toggle": {
      const on = (answers[node.id] as boolean | undefined) ?? (node.default as boolean | undefined) ?? false;
      return (
        <Pressable
          testID={node.id}
          style={[styles.toggle, on && styles.toggleOn]}
          onPress={() => onChange(node.id, !on)}
        >
          <Text style={[styles.toggleText, on && styles.toggleTextOn]}>{on ? "On" : "Off"}</Text>
        </Pressable>
      );
    }
    case "thread-pick": {
      // No saved-thread surface exists yet (app passes __hasThreads: false, so
      // this node stays hidden). Render an inert placeholder ONLY if it ever
      // becomes visible — no Library is built here.
      return (
        <View testID={node.id} style={styles.placeholder}>
          <Text style={styles.placeholderText}>No saved threads yet.</Text>
        </View>
      );
    }
  }
}

/** Mint a fresh unique Storyworld id for a newly started story. */
function newWorldId(): string {
  const g = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (g?.randomUUID) return `world-${g.randomUUID()}`;
  return `world-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * The worldId of a continued thread. There is no saved-thread surface yet, so
 * this branch is unreachable; wired for the eventual continue-a-thread flow.
 */
function threadWorldId(_continueThreadId: string): string {
  return newWorldId();
}

/** A human label derived from the node id ("ageBand" -> "Age band"). */
function labelFor(id: string): string {
  const spaced = id.replace(/([A-Z])/g, " $1").toLowerCase().trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Friendly placeholders for the well-known free-text nodes; blank otherwise. */
function placeholderFor(id: string): string {
  switch (id) {
    case "world":
      return "e.g. Willowmere";
    case "hero":
      return "e.g. a brave little mouse";
    case "villain":
      return "e.g. a grumpy shadow";
    case "situation":
      return "e.g. sharing when it's hard";
    default:
      return "";
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

function ChipRow({
  options,
  value,
  onSelect,
}: {
  options: string[];
  value: string | undefined;
  onSelect: (v: string) => void;
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
  placeholder: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#f2f1f7",
    borderWidth: 1,
    borderColor: "#e2e0ee",
  },
  placeholderText: { fontSize: 14, color: "#777" },
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
