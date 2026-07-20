import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
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
import { ProxyClient, type ProxyClientLike } from "../api/proxyClient";
import { PROXY_URL } from "../api/config";
import { useNav } from "../nav/NavContext";
import { useTheme, type Theme } from "../theme/ThemeContext";

/**
 * GENERIC, data-driven wizard — #5 build-order slice 5 (the final screen),
 * styled to the locked direction (docs/design/ui-direction.md +
 * prototype-confirmed appendix). Instead of hand-wiring a fixed set of fields,
 * it renders whatever {@link getVisibleNodes} returns for the current tier +
 * the answers gathered so far, one control per node `kind`. Because visibility
 * is recomputed every render, changing the tier (or, once threads exist,
 * picking a thread) reactively reveals/hides nodes.
 *
 * Direction: every visible question sits on its own surface card (hairline
 * border, radius 14) under the lamp wash; chips/toggles are >=44pt pills whose
 * current pick carries the accent EDGE (accent fills ground the one primary
 * action only — "Weave the tale"). While weaving, the form yields to a fading
 * wait card (built-in Animated, #9 owns anything heavier) with skeleton page
 * lines. The §7 failure escape lives on the ERROR state ONLY: warm
 * parent-facing copy (ink on surface — never the raw exception), a "Try again"
 * accent pill resubmitting the answers preserved in state, and a quiet
 * "‹ Back to the Shelf" ghost link riding the nav's existing goHome. The
 * normal flow remains no-back. All color/type comes from the theme — no
 * hardcoded values (one-token-system tripwire enforced).
 *
 * On submit it reduces the answers to {@link RawWizardPicks} via the domain
 * assembler, stamps a fresh worldId (or, for a continued thread, the thread's
 * worldId — no thread surface exists yet, so that branch is inert), then reuses
 * the unchanged buildWizardAnswers -> ProxyClient -> Card-Pick pipeline.
 *
 * The proxy client is injected (defaulting to the real {@link ProxyClient}) so
 * tests can supply a network-free fake.
 */
// Module-level singleton so re-renders don't each allocate a fresh client.
const defaultClient = new ProxyClient(PROXY_URL);

export default function WizardScreen({
  client = defaultClient,
}: {
  client?: ProxyClientLike;
} = {}) {
  const { navigate, goHome } = useNav();
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

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

  // The wait card's entrance — a gentle fade each time a weave begins.
  const waitIn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!busy) return;
    waitIn.setValue(0);
    Animated.timing(waitIn, { toValue: 1, duration: 200, useNativeDriver: true }).start();
  }, [busy, waitIn]);

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
    if (!canSubmit || busy) return;
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
      const response = await client.generateArc(req);
      navigate({ screen: "cardpick", params: { response, answers: wizardAnswers } });
    } catch (e) {
      // Kept for state/debugging only — the copy on the page stays warm and
      // parent-facing (§7); the raw message never reaches the reader's eyes.
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.screen}>
      {/* Ambient lamp wash from the top — decorative, the "warm light source". */}
      <View style={styles.lampWash} pointerEvents="none" />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
        <Text accessibilityRole="header" style={styles.title} maxFontSizeMultiplier={1.4}>
          New Story
        </Text>
        <Text style={styles.subtitle} maxFontSizeMultiplier={1.6}>
          A few gentle choices, then we weave the pages.
        </Text>

        {busy ? (
          // Weaving: the form steps aside for a fading wait card. Built-in
          // Animated only (fade); the motif loading animation belongs to #9.
          <Animated.View style={[styles.waitCard, { opacity: waitIn }]}>
            <Text style={styles.waitTitle} maxFontSizeMultiplier={1.4}>
              Weaving your tale…
            </Text>
            <Text style={styles.waitText} maxFontSizeMultiplier={1.6}>
              Gathering the pages and drawing the pictures — just a moment.
            </Text>
            <View style={styles.skeletonLine} />
            <View style={styles.skeletonLine} />
            <View style={[styles.skeletonLine, styles.skeletonLineShort]} />
          </Animated.View>
        ) : (
          <>
            {visibleNodes.map((node) => (
              <Field key={node.id} label={labelFor(node.id)} styles={styles}>
                <NodeControl node={node} answers={answers} onChange={setAnswer} theme={theme} styles={styles} />
              </Field>
            ))}

            {error ? (
              // §7 failure escape — the ERROR state only. Warm copy on a
              // surface, the answers held safe in state for Try again, and the
              // one quiet way back to the Shelf. Elsewhere the flow is no-back.
              <>
                <Text style={styles.error} maxFontSizeMultiplier={1.6}>
                  The tale slipped away before it could be woven. Your choices are safe — let's try
                  again.
                </Text>
                <Pressable accessibilityRole="button" style={styles.primary} onPress={onSubmit}>
                  <Text style={styles.primaryText} maxFontSizeMultiplier={1.4}>
                    Try again
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Back to the Shelf"
                  style={styles.escape}
                  onPress={goHome}
                >
                  <Text style={styles.escapeText} maxFontSizeMultiplier={1.4}>
                    ‹ Back to the Shelf
                  </Text>
                </Pressable>
              </>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: !canSubmit }}
                disabled={!canSubmit}
                style={[styles.primary, !canSubmit && styles.primaryQuiet]}
                onPress={onSubmit}
              >
                <Text
                  style={[styles.primaryText, !canSubmit && styles.primaryTextQuiet]}
                  maxFontSizeMultiplier={1.4}
                >
                  Weave the tale
                </Text>
              </Pressable>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

type Styles = ReturnType<typeof makeStyles>;

/** Render a single wizard node by its `kind`. */
function NodeControl({
  node,
  answers,
  onChange,
  theme,
  styles,
}: {
  node: WizardNode;
  answers: NodeAnswers;
  onChange: (id: string, value: string | boolean | undefined) => void;
  theme: Theme;
  styles: Styles;
}) {
  switch (node.kind) {
    case "single-select":
    case "dial": {
      // The dial is rendered as a chip row for this slice (no slider yet).
      const options = [...(node.options ?? [])];
      const current = (answers[node.id] as string | undefined) ?? (node.default as string | undefined);
      return (
        <ChipRow options={options} value={current} onSelect={(v) => onChange(node.id, v)} styles={styles} />
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
          placeholderTextColor={theme.colors.ink2}
          maxFontSizeMultiplier={1.6}
        />
      );
    }
    case "toggle": {
      const on = (answers[node.id] as boolean | undefined) ?? (node.default as boolean | undefined) ?? false;
      return (
        <Pressable
          testID={node.id}
          accessibilityRole="switch"
          accessibilityState={{ checked: on }}
          style={[styles.chip, styles.toggle, on && styles.chipOn]}
          onPress={() => onChange(node.id, !on)}
        >
          <Text style={[styles.chipText, on && styles.chipTextOn]} maxFontSizeMultiplier={1.4}>
            {on ? "On" : "Off"}
          </Text>
        </Pressable>
      );
    }
    case "thread-pick": {
      // No saved-thread surface exists yet (app passes __hasThreads: false, so
      // this node stays hidden). Render an inert placeholder ONLY if it ever
      // becomes visible — no Library is built here.
      return (
        <View testID={node.id} style={styles.placeholder}>
          <Text style={styles.placeholderText} maxFontSizeMultiplier={1.4}>
            No saved threads yet.
          </Text>
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

/** One question: a surface card with a spine-stage label over its control. */
function Field({
  label,
  children,
  styles,
}: {
  label: string;
  children: React.ReactNode;
  styles: Styles;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel} maxFontSizeMultiplier={1.4}>
        {label}
      </Text>
      {children}
    </View>
  );
}

function ChipRow({
  options,
  value,
  onSelect,
  styles,
}: {
  options: string[];
  value: string | undefined;
  onSelect: (v: string) => void;
  styles: Styles;
}) {
  return (
    <View style={styles.chipRow}>
      {options.map((opt) => {
        const on = opt === value;
        return (
          <Pressable
            key={opt}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={[styles.chip, on && styles.chipOn]}
            onPress={() => onSelect(opt)}
          >
            <Text style={[styles.chipText, on && styles.chipTextOn]} maxFontSizeMultiplier={1.4}>
              {opt}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** All values from the theme (palette + type scale) — the tripwire test keeps it so. */
function makeStyles({ colors, type }: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    lampWash: {
      position: "absolute",
      top: -180,
      alignSelf: "center",
      width: 440,
      height: 340,
      borderRadius: 999,
      backgroundColor: colors.accent,
      opacity: 0.08,
    },
    scroll: { flex: 1 },
    // Portrait-first; capped content width keeps tablets bookish.
    container: {
      width: "100%",
      maxWidth: 520,
      alignSelf: "center",
      paddingHorizontal: 16,
      paddingTop: 64,
      paddingBottom: 24,
      gap: 16,
    },
    title: { ...type.display, color: colors.ink, textAlign: "center" },
    subtitle: { ...type.entityName, color: colors.ink2, textAlign: "center", marginTop: -6 },
    // One surface card per question: radius 14, hairline border, ink shadow.
    card: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 14,
      paddingTop: 14,
      paddingHorizontal: 20,
      paddingBottom: 16,
      gap: 10,
      shadowColor: colors.ink, // soft ink-tinted shadow
      shadowOpacity: 0.1,
      shadowRadius: 13,
      shadowOffset: { width: 0, height: 8 },
      elevation: 3,
    },
    cardLabel: { ...type.spineStage, color: colors.ink2 },
    chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    // Constant borderWidth in both states — selection recolors, never resizes.
    chip: {
      minHeight: 44,
      justifyContent: "center",
      paddingHorizontal: 14,
      borderRadius: 999,
      backgroundColor: colors.bg,
      borderWidth: 1.5,
      borderColor: colors.line,
    },
    // The pick reads as the lamp catching the chosen chip — accent is UI-only here.
    chipOn: { borderColor: colors.accent },
    chipText: { ...type.entityName, color: colors.ink2 },
    chipTextOn: { color: colors.ink },
    toggle: { alignSelf: "flex-start" },
    input: {
      ...type.entityName,
      minHeight: 44,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 8,
      paddingVertical: 10,
      paddingHorizontal: 12,
      color: colors.ink,
      backgroundColor: colors.bg,
    },
    placeholder: {
      padding: 12,
      borderRadius: 8,
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.line,
    },
    placeholderText: { ...type.entityName, color: colors.ink2 },
    // Warm, parent-facing — no dev-speak, no harsh red (§7): ink on surface.
    error: {
      ...type.entityName,
      color: colors.ink,
      backgroundColor: colors.surface,
      borderColor: colors.line,
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      textAlign: "center",
    },
    // The one primary action per state: accent pill, >=44pt target.
    primary: {
      marginTop: 4,
      minHeight: 44,
      borderRadius: 999,
      paddingHorizontal: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.accent,
      borderWidth: 1.5,
      borderColor: colors.accent,
    },
    // Gated state: a quiet, still-readable pill (ink2 on surface), mirroring
    // the CardPick gate — never the accent pill dimmed below AA.
    primaryQuiet: { backgroundColor: colors.surface, borderColor: colors.line },
    primaryText: { ...type.button, color: colors.accentInk },
    primaryTextQuiet: { color: colors.ink2 },
    // §7 escape: a quiet ghost link, never competing with Try again.
    escape: { minHeight: 44, alignItems: "center", justifyContent: "center" },
    escapeText: { ...type.backLink, color: colors.ink2 },
    // The weaving wait card: surface + fade-in, skeleton page lines below.
    waitCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 14,
      paddingTop: 18,
      paddingHorizontal: 20,
      paddingBottom: 22,
      gap: 12,
      alignItems: "stretch",
      shadowColor: colors.ink,
      shadowOpacity: 0.1,
      shadowRadius: 13,
      shadowOffset: { width: 0, height: 8 },
      elevation: 3,
    },
    waitTitle: { ...type.entityNameArt, color: colors.ink, textAlign: "center" },
    waitText: { ...type.entityName, color: colors.ink2, textAlign: "center", marginBottom: 4 },
    skeletonLine: { height: 12, borderRadius: 6, backgroundColor: colors.line, opacity: 0.7 },
    skeletonLineShort: { width: "62%", alignSelf: "center" },
  });
}
