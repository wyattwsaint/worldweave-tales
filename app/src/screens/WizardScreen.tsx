import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import {
  assembleRawPicks,
  getVisibleNodes,
  resolveValue,
  type GenerateArcRequest,
  type NodeAnswers,
  type OpenThread,
  type Storyworld,
  type Tier,
  type WizardNode,
} from "@wwt/domain";
import { buildWizardAnswers, type RawWizardPicks } from "../flow/buildWizardAnswers";
import { ProxyClient, type ProxyClientLike } from "../api/proxyClient";
import { PROXY_URL } from "../api/config";
import { useNav, type WizardParams } from "../nav/NavContext";
import { useTheme, type Theme } from "../theme/ThemeContext";
import { pressedStyle } from "../theme/pressed";

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
 * assembler, stamps a fresh worldId (or, when continuing, the world's own id),
 * then reuses the unchanged buildWizardAnswers -> ProxyClient -> Card-Pick
 * pipeline.
 *
 * CONTINUE MODE (#10): given a `world` param the screen becomes "the next tale
 * in this world" — the canon questions (world/hero/villain) disappear because
 * locked art already answers them, the world's unresolved hooks are OFFERED as
 * optional springboards (never mandated, SPEC #24), one "what happens this time"
 * lever takes their place, and the world itself rides along on the request so the
 * proxy reuses its deck and honors its bible.
 *
 * The proxy client is injected (defaulting to the real {@link ProxyClient}) so
 * tests can supply a network-free fake.
 */
// Module-level singleton so re-renders don't each allocate a fresh client.
const defaultClient = new ProxyClient(PROXY_URL);

export default function WizardScreen({
  client = defaultClient,
  params,
}: {
  client?: ProxyClientLike;
  params?: WizardParams;
} = {}) {
  const { navigate, goHome } = useNav();
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  // The world being continued, if any — the one thing that makes this run a
  // continuation rather than a fresh Storyworld (#10).
  const continuedWorld = params?.world;
  // Only UNRESOLVED hooks are springboards: a thread a prior arc already picked
  // up would be offered as a fresh idea forever.
  const openThreads = useMemo(
    () => (continuedWorld?.bible.openThreads ?? []).filter((t) => !t.resolved),
    [continuedWorld],
  );

  // A single NodeAnswers bag keyed by node id — NOT one useState per field.
  // Seed the two required nodes so Beginner is completable in a couple of taps.
  // `__continuing` gates the canon questions (a continued world already answered
  // them in locked art); `__hasThreads` reveals the springboard pick.
  const [answers, setAnswers] = useState<NodeAnswers>({
    tier: "beginner",
    ageBand: continuedWorld?.defaultAgeBand ?? "preschool",
    __continuing: Boolean(continuedWorld),
    __hasThreads: openThreads.length > 0,
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
      // A continued arc belongs to the world it came from; a brand-new story
      // mints a fresh id so successive stories never clobber one another (B2).
      raw.worldId = continuedWorld ? continuedWorld.id : newWorldId();

      const wizardAnswers = buildWizardAnswers(raw);
      const req: GenerateArcRequest = {
        attestationToken: "dev-attestation-token",
        deviceId: "dev-device-id",
        answers: wizardAnswers,
        // Prior canon + bible travel with the request so the proxy reuses locked
        // cards and honors continuity (#10).
        ...(continuedWorld ? { world: forRequest(continuedWorld) } : {}),
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
          {continuedWorld ? "Next Tale" : "New Story"}
        </Text>
        <Text style={styles.subtitle} maxFontSizeMultiplier={1.6}>
          {continuedWorld
            ? `A new tale in ${continuedWorld.name} — everyone you know comes along.`
            : "A few gentle choices, then we weave the pages."}
        </Text>

        {busy ? (
          // Weaving: the form steps aside for a fading wait card. Built-in
          // Animated only (fade); the motif loading animation belongs to #9.
          // A polite live region, so screen readers voice the weaving too.
          <Animated.View accessibilityLiveRegion="polite" style={[styles.waitCard, { opacity: waitIn }]}>
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
                <NodeControl
                  node={node}
                  label={labelFor(node.id)}
                  answers={answers}
                  threads={openThreads}
                  onChange={setAnswer}
                  theme={theme}
                  styles={styles}
                />
              </Field>
            ))}

            {error ? (
              // §7 failure escape — the ERROR state only. Warm copy on a
              // surface, the answers held safe in state for Try again, and the
              // one quiet way back to the Shelf. Elsewhere the flow is no-back.
              <>
                <Text
                  accessibilityRole="alert"
                  accessibilityLiveRegion="polite"
                  style={styles.error}
                  maxFontSizeMultiplier={1.6}
                >
                  The tale slipped away before it could be woven. Your choices are safe — let's try
                  again.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  style={pressedStyle(styles.primary)}
                  onPress={onSubmit}
                >
                  <Text style={styles.primaryText} maxFontSizeMultiplier={1.4}>
                    Try again
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Back to the Shelf"
                  style={pressedStyle(styles.escape)}
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
                style={pressedStyle(styles.primary, !canSubmit && styles.primaryQuiet)}
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
  label,
  answers,
  threads,
  onChange,
  theme,
  styles,
}: {
  node: WizardNode;
  /** The question's human label — names the control for screen readers. */
  label: string;
  answers: NodeAnswers;
  /** The continued world's unresolved hooks — the thread-pick node's options. */
  threads: OpenThread[];
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
          accessibilityLabel={label}
          accessibilityState={{ checked: on }}
          style={pressedStyle(styles.chip, styles.toggle, on && styles.chipOn)}
          onPress={() => onChange(node.id, !on)}
        >
          <Text style={[styles.chipText, on && styles.chipTextOn]} maxFontSizeMultiplier={1.4}>
            {on ? "On" : "Off"}
          </Text>
        </Pressable>
      );
    }
    case "thread-pick": {
      // The springboard offer (#10 / SPEC #24): prior hooks are OFFERED, never
      // mandated — "Not this time" is a first-class choice, and declining leaves
      // the tale free to go anywhere within the world's canon.
      const chosen = answers[node.id] as string | undefined;
      if (threads.length === 0) {
        return (
          <View testID={node.id} style={styles.placeholder}>
            <Text style={styles.placeholderText} maxFontSizeMultiplier={1.4}>
              No saved threads yet.
            </Text>
          </View>
        );
      }
      return (
        <View testID={node.id} style={styles.threadList}>
          {threads.map((thread) => {
            const on = chosen === thread.id;
            return (
              <Pressable
                key={thread.id}
                accessibilityRole="button"
                accessibilityLabel={`Continue this thread: ${thread.teaser}`}
                accessibilityState={{ selected: on }}
                style={pressedStyle(styles.thread, on && styles.threadOn)}
                // Tapping the chosen thread again clears it — the offer is never sticky.
                onPress={() => onChange(node.id, on ? undefined : thread.id)}
              >
                <Text style={[styles.threadText, on && styles.threadTextOn]} maxFontSizeMultiplier={1.6}>
                  {thread.teaser}
                </Text>
              </Pressable>
            );
          })}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Not this time"
            accessibilityState={{ selected: !chosen }}
            style={pressedStyle(styles.chip, !chosen && styles.chipOn)}
            onPress={() => onChange(node.id, undefined)}
          >
            <Text style={[styles.chipText, !chosen && styles.chipTextOn]} maxFontSizeMultiplier={1.4}>
              Not this time
            </Text>
          </Pressable>
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
 * The world as the PROXY should see it. Locked art lives on this device: a
 * `lockedImageRef` is a local blob path, useless server-side, so it is blanked
 * before the world leaves the device. Everything the proxy actually needs —
 * entityIds, appearance notes, the bible, and the locked artStyle handle —
 * travels intact.
 */
function forRequest(world: Storyworld): Storyworld {
  return {
    ...world,
    deck: world.deck.map((card) => ({ ...card, lockedImageRef: "" })),
  };
}

/**
 * A human label derived from a graph id — node ids ("ageBand" -> "Age band")
 * and option ids ("early-reader" -> "Early reader") alike. Display/spoken copy
 * only: the raw id always remains the stored answer value.
 */
function labelFor(id: string): string {
  // A couple of nodes read better as questions than as de-camelCased ids.
  const spoken = SPOKEN_LABELS[id];
  if (spoken) return spoken;
  const spaced = id
    .replace(/-/g, " ")
    .replace(/([A-Z])/g, " $1")
    .toLowerCase()
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Copy overrides for nodes whose id would read as jargon on the card. */
const SPOKEN_LABELS: Record<string, string> = {
  continueThread: "Pick up where you left off?",
  newTwist: "What happens this time?",
};

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
    case "newTwist":
      return "e.g. a storm traps them in the mill";
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
            style={pressedStyle(styles.chip, on && styles.chipOn)}
            onPress={() => onSelect(opt)}
          >
            {/* Humanized copy for eyes and ears; the raw id is what's stored. */}
            <Text style={[styles.chipText, on && styles.chipTextOn]} maxFontSizeMultiplier={1.4}>
              {labelFor(opt)}
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
    // The springboard offer: full-width teaser rows, since a hook is a sentence
    // rather than a chip-sized word. Selection recolors the edge only.
    threadList: { gap: 8 },
    thread: {
      minHeight: 44,
      justifyContent: "center",
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 12,
      backgroundColor: colors.bg,
      borderWidth: 1.5,
      borderColor: colors.line,
    },
    threadOn: { borderColor: colors.accent },
    threadText: { ...type.entityName, color: colors.ink2 },
    threadTextOn: { color: colors.ink },
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
