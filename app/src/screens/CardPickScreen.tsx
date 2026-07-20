import React, { useMemo, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Card, CardRole, GeneratedCardChoice } from "@wwt/domain";
import { applyCardPick } from "../flow/applyCardPick";
import { useNav, type CardPickParams } from "../nav/NavContext";
import { artImageSource } from "../storage/artSource";
import { blobFs } from "../storage/store";
import { useTheme, type Theme } from "../theme/ThemeContext";

/**
 * Card-Pick screen — #5 build-order slice 3, styled to the locked direction
 * (docs/design/ui-direction.md + prototype-confirmed appendix).
 *
 * For each pending hero/villain choice the parent taps one look. Each pending
 * role sits on its own surface card (hairline border, radius 14); its looks
 * render as 2:1 art plates (radius 8) with the row's ends counter-rotated for
 * the hand-placed feel; rows wrap (minWidth per look) so extra variants never
 * shrink the touch targets. Real variant art (a remote URL or downloaded blob)
 * renders as an <Image>; a non-renderable ref (e.g. "stub-image:hero#0")
 * degrades to a labeled text placeholder tile. The chosen look carries an
 * accent edge (recolor only — the border width never moves layout) and an
 * accent "Chosen" pill. Confirm is the accent pill button once every role is
 * picked; until then it's a quiet readable pill (surface ground, hairline
 * border, full-opacity ink2 copy — never a dimmed accent). Once every role is
 * picked, we build the Card objects and canonize each via applyCardPick. All
 * color/type comes from the theme — no hardcoded values (one-token-system
 * tripwire enforced).
 */

const LOOK_WORDS = ["one", "two", "three", "four", "five", "six"];

/** Spoken look ordinal for accessibility labels ("look one of three"). */
function lookWord(n: number): string {
  return LOOK_WORDS[n - 1] ?? String(n);
}

export default function CardPickScreen({ params }: { params: CardPickParams }) {
  const { navigate } = useNav();
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { response, answers } = params;
  const choices = response.pendingCardChoices;

  const [picks, setPicks] = useState<Record<string, string>>({});

  const allPicked = choices.every((c) => picks[c.role]);

  function onConfirm() {
    const now = new Date();
    const pickedCards: Card[] = choices.map((choice) => {
      const base = draftCard(choice, answers.choices[choice.role]);
      return applyCardPick(base, picks[choice.role], now);
    });
    const cards: Card[] = [...pickedCards, ...response.newCanonCards];
    navigate({ screen: "viewer", params: { arc: response.arc, cards, bible: response.bible } });
  }

  return (
    <View style={styles.screen}>
      {/* Ambient lamp wash from the top — decorative, the "warm light source". */}
      <View style={styles.lampWash} pointerEvents="none" />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
        <Text accessibilityRole="header" style={styles.title} maxFontSizeMultiplier={1.4}>
          Pick the Art
        </Text>
        <Text style={styles.subtitle} maxFontSizeMultiplier={1.6}>
          Tap one look for each character. Locked in forever once you weave.
        </Text>

        {choices.map((choice) => (
          <View key={choice.role} style={styles.group}>
            <Text style={styles.role} maxFontSizeMultiplier={1.4}>
              {choice.role}
            </Text>
            <View style={styles.lookRow}>
              {choice.variantImageRefs.map((ref, i) => {
                const on = picks[choice.role] === ref;
                const source = artImageSource(ref, blobFs);
                // The row's ends lean into the page — the hand-placed feel.
                const tilt =
                  i === 0
                    ? styles.tiltLeft
                    : i === choice.variantImageRefs.length - 1
                      ? styles.tiltRight
                      : null;
                return (
                  <Pressable
                    key={ref}
                    accessibilityRole="button"
                    accessibilityLabel={`Pick look ${lookWord(i + 1)} of ${lookWord(
                      choice.variantImageRefs.length,
                    )} for the ${choice.role}`}
                    accessibilityState={{ selected: on }}
                    style={styles.look}
                    onPress={() => setPicks((p) => ({ ...p, [choice.role]: ref }))}
                  >
                    <View style={[styles.lookArt, tilt, on && styles.lookArtOn]}>
                      {source ? (
                        <Image style={styles.lookImage} source={source} resizeMode="cover" />
                      ) : (
                        <Text style={styles.lookPlaceholder} maxFontSizeMultiplier={1.4}>
                          {ref}
                        </Text>
                      )}
                    </View>
                    {on ? (
                      <View style={styles.chosen}>
                        <Text style={styles.chosenText} maxFontSizeMultiplier={1.4}>
                          ✓ Chosen
                        </Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !allPicked }}
          disabled={!allPicked}
          style={[styles.primary, !allPicked && styles.primaryDisabled]}
          onPress={onConfirm}
        >
          <Text
            style={[styles.primaryText, !allPicked && styles.primaryTextDisabled]}
            maxFontSizeMultiplier={1.4}
          >
            {allPicked ? "Weave the tale" : "Pick every look to continue"}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

/** Build a not-yet-canonized Card for a pending choice. applyCardPick locks it. */
export function draftCard(choice: GeneratedCardChoice, chosenName?: string): Card {
  const role: CardRole = choice.role;
  const name = chosenName?.trim() || role.charAt(0).toUpperCase() + role.slice(1);
  return {
    // The cast member's real entityId (threaded from the proxy) — the SAME id the
    // pipeline bucketed into beat.dealtCardIds, so the viewer's lookup matches.
    entityId: choice.entityId,
    role,
    canonName: name,
    traits: [],
    // Mirror the note the art was drawn from; fall back for the legacy stub path.
    appearanceNote: choice.appearanceNote || `The chosen ${role}.`,
    lockedImageRef: "", // set by applyCardPick from the tapped variant
    relationships: [],
    canonizedAt: "",
  };
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
      gap: 18,
    },
    title: { ...type.display, color: colors.ink, textAlign: "center" },
    subtitle: { ...type.entityName, color: colors.ink2, textAlign: "center", marginTop: -8 },
    // One surface card per pending role: radius 14, hairline border, ink shadow.
    group: {
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
    role: { ...type.spineStage, color: colors.ink2, textTransform: "capitalize" },
    // Wrap + minWidth: more variants than fit a line wrap to the next one
    // instead of shrinking below a comfortable touch target (140pt-wide 2:1
    // plate = 70pt tall, well past the 44pt floor).
    lookRow: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
    look: { flex: 1, minWidth: 140, minHeight: 44 },
    // Slight counter-rotations for a hand-placed feel.
    tiltLeft: { transform: [{ rotate: "-0.7deg" }] },
    tiltRight: { transform: [{ rotate: "0.5deg" }] },
    // Constant borderWidth in both states — selection recolors, never resizes.
    lookArt: {
      aspectRatio: 2,
      borderWidth: 2,
      borderColor: colors.line,
      borderRadius: 8,
      overflow: "hidden",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.bg,
    },
    // Selection reads as the lamp catching the chosen frame — accent is UI-only here.
    lookArtOn: { borderColor: colors.accent },
    lookImage: { width: "100%", height: "100%" },
    lookPlaceholder: { ...type.entityRole, color: colors.ink2, textAlign: "center", padding: 4 },
    // The "Chosen" pill: accentInk on accent passes AA at any size.
    chosen: {
      alignSelf: "center",
      marginTop: 8,
      backgroundColor: colors.accent,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 3,
    },
    chosenText: { ...type.entityRole, color: colors.accentInk },
    // The one primary action: accent pill, >=44pt target.
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
    // Gated state: a quiet, still-readable pill (ink2 on surface = 5.9/5.7:1),
    // mirroring the Viewer's ghost button — never the accent pill dimmed to
    // ~1.8:1. Border width stays 1.5 so enabling doesn't move layout.
    primaryDisabled: { backgroundColor: colors.surface, borderColor: colors.line },
    primaryText: { ...type.button, color: colors.accentInk },
    primaryTextDisabled: { color: colors.ink2 },
  });
}
