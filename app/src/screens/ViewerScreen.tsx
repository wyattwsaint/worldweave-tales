import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  BackHandler,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { Card, Storyworld } from "@wwt/domain";
import { useNav, type ViewerParams } from "../nav/NavContext";
import { artDownloader, blobFs, store, whenStoreReady } from "../storage/store";
import { arcTitle, persistFinishedWorld } from "../storage/persistence";
import { artImageSource } from "../storage/artSource";
import { useTheme, type Theme } from "../theme/ThemeContext";
import { pressedStyle } from "../theme/pressed";
import StorytimeVignette from "../components/StorytimeVignette";

/**
 * Viewer — the #5 proof screen, built to the locked direction
 * (docs/design/ui-direction.md + prototype-confirmed appendix).
 *
 * One BEAT of the arc per rendered PAGE — "beat" stays internal domain
 * language; every reader-facing string (and accessibility label) says "page".
 * Layout: top bar (‹ Shelf / world label / page count) → storytime bookplate
 * vignette (motif A) → title + spine-stage line → the page card (surface,
 * hairline border, radius 14) holding this page's dealt entity-art tiles and
 * the read-aloud prose → pager (‹ Back, progress dots, Next page on accent;
 * the last page offers New story). Tapping a tile opens a full-screen
 * palette-aware art lightbox (built-in Animated fade/scale-in; reanimated is
 * deferred to #9). All color/type comes from the theme — no hardcoded values.
 *
 * Durably persists the world AND its arc on mount — downloading each card's
 * ephemeral remote art to a local blob first, so a re-read survives the
 * Recraft URL expiring (SPEC §2.22, §5). Library re-opens skip the save.
 */

const PAGE_WORDS = [
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
];

/** Reader-facing page number as a word ("Page four"); digits past twelve. */
function pageWord(n: number): string {
  return PAGE_WORDS[n - 1] ?? String(n);
}

/** Spine ids are internal ("virtue-tested"); readers see words ("virtue tested"). */
function humanizeSpine(spine: string): string {
  return spine.replace(/-/g, " ");
}

export default function ViewerScreen({ params }: { params: ViewerParams }) {
  const { navigate, goHome } = useNav();
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { arc, cards, bible, source } = params;
  const byId = new Map<string, Card>(cards.map((c) => [c.entityId, c]));

  const [page, setPage] = useState(0);
  const beats = arc.beats;
  const total = Math.max(beats.length, 1);
  const beat = beats[Math.min(page, total - 1)];
  const isLast = page >= total - 1;
  const dealt = (beat?.dealtCardIds ?? [])
    .map((id) => byId.get(id))
    .filter((c): c is Card => Boolean(c));

  /** Full-screen entity-art lightbox: the tapped card, or null when closed. */
  const [artCard, setArtCard] = useState<Card | null>(null);
  const artIn = useRef(new Animated.Value(0)).current;

  // Entrance runs here — after the overlay has committed — not in the press
  // handler, so the animation never targets a view that isn't mounted yet.
  useEffect(() => {
    if (!artCard) return;
    artIn.setValue(0);
    Animated.timing(artIn, { toValue: 1, duration: 200, useNativeDriver: true }).start();
  }, [artCard, artIn]);

  // Android hardware Back closes an open lightbox (consumed) instead of
  // backing out of the story; with it closed, Back keeps its default meaning.
  useEffect(() => {
    if (!artCard) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      setArtCard(null);
      return true;
    });
    return () => sub.remove();
  }, [artCard]);

  const [persistError, setPersistError] = useState<string | null>(null);
  /** The in-flight on-mount persist; ‹ Shelf awaits it so the shelf never misses the story. */
  const persistDone = useRef<Promise<void> | null>(null);
  /** Whether that persist ultimately failed — the state above can't be read after an await. */
  const persistFailed = useRef(false);

  useEffect(() => {
    if (source === "library") return; // already shelved — a re-save would clobber the stored world
    let cancelled = false; // guards the setState below if the Viewer unmounts mid-save
    const world: Storyworld = {
      id: arc.worldId,
      name: arcTitle(arc),
      artStyle: { presetId: "pencil-sketch", displayName: "Imaginative Pencil-Sketch" },
      defaultAgeBand: arc.ageBand,
      deck: cards,
      bible,
      arcIds: [arc.id],
      createdAt: arc.createdAt,
    };
    persistDone.current = (async () => {
      await whenStoreReady();
      await persistFinishedWorld(world, arc, { store, downloadArt: artDownloader });
    })().catch(() => {
      persistFailed.current = true;
      if (!cancelled) {
        setPersistError("Couldn't save this tale to your shelf — it may be gone when you return.");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [arc, cards, bible, source]);

  /**
   * Waits out an in-flight save before going home. If that save failed and the
   * tap landed BEFORE the inline error was showing, stay on the Viewer so the
   * failure is actually seen (never a silent hop home) — the next ‹ tap, with
   * the error now on screen, does leave. Happy path: await, then home.
   */
  async function backToShelf() {
    const errorWasVisible = persistError !== null;
    await persistDone.current;
    if (persistFailed.current && !errorWasVisible) return;
    goHome();
  }

  /** "hero · dealt this page" — or the page (in words) that first dealt it. */
  function dealtLine(card: Card): string {
    const firstIdx = beats.findIndex((b) => b.dealtCardIds.includes(card.entityId));
    return firstIdx === page
      ? `${card.role} · dealt this page`
      : `${card.role} · dealt page ${pageWord(firstIdx + 1)}`;
  }

  const pagePosition = `Page ${pageWord(page + 1)} of ${pageWord(total)}`;
  const paragraphs = (beat?.text ?? "").split(/\n{2,}/).filter((p) => p.trim().length > 0);
  const artSource = artCard ? artImageSource(artCard.lockedImageRef, blobFs) : null;

  return (
    <View style={styles.screen}>
      {/* Ambient lamp wash from the top — decorative, the "warm light source". */}
      <View style={styles.lampWash} pointerEvents="none" />

      {/* While the lightbox covers this column, hide it from assistive tech:
          `accessibilityViewIsModal` on the overlay handles VoiceOver focus,
          but TalkBack needs the covered side excluded explicitly. */}
      <View
        style={styles.column}
        importantForAccessibility={artCard ? "no-hide-descendants" : "auto"}
        accessibilityElementsHidden={artCard !== null}
      >
        <View style={styles.topbar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to the Shelf"
            style={pressedStyle(styles.backLink)}
            onPress={() => void backToShelf()}
          >
            <Text style={styles.backLinkText} maxFontSizeMultiplier={1.4}>
              ‹ Shelf
            </Text>
          </Pressable>
          <Text style={styles.worldName} maxFontSizeMultiplier={1.4}>
            Your Tale
          </Text>
          {/* Decorative duplicate of the dots' spoken position — hidden from a11y. */}
          <Text
            style={styles.pageCount}
            maxFontSizeMultiplier={1.4}
            accessibilityElementsHidden
            importantForAccessibility="no"
          >
            {`${page + 1} / ${total}`}
          </Text>
        </View>

        <View style={styles.vignette}>
          <StorytimeVignette />
        </View>

        <View style={styles.titleBlock}>
          <Text accessibilityRole="header" style={styles.arcTitle} maxFontSizeMultiplier={1.4}>
            {arcTitle(arc)}
          </Text>
          <Text style={styles.spineStage} maxFontSizeMultiplier={1.4}>
            {/* No dangling separator when an empty arc leaves no stage to name. */}
            {beat
              ? `Page ${pageWord(page + 1)} · ${humanizeSpine(beat.spineBeat)}`
              : `Page ${pageWord(page + 1)}`}
          </Text>
        </View>

        {persistError ? (
          <Text style={styles.error} maxFontSizeMultiplier={1.4}>
            {persistError}
          </Text>
        ) : null}

        <View style={styles.pageCard}>
          {dealt.length > 0 ? (
            <View style={styles.cardsRow}>
              {dealt.map((card, i) => {
                const source = artImageSource(card.lockedImageRef, blobFs);
                const tilt =
                  i === 0 ? styles.tiltLeft : i === dealt.length - 1 ? styles.tiltRight : null;
                return (
                  <Pressable
                    key={card.entityId}
                    accessibilityRole="button"
                    accessibilityLabel={`Open art for ${card.canonName}`}
                    style={pressedStyle(styles.tile)}
                    onPress={() => setArtCard(card)}
                  >
                    <View style={[styles.tileArt, tilt]}>
                      {source ? (
                        <Image
                          style={styles.tileImage}
                          source={source}
                          resizeMode="cover"
                          accessibilityLabel={card.canonName}
                        />
                      ) : (
                        <Text style={styles.tilePlaceholderText} maxFontSizeMultiplier={1.4}>
                          {card.lockedImageRef || "Art coming soon"}
                        </Text>
                      )}
                    </View>
                    <Text style={styles.tileName} numberOfLines={1} maxFontSizeMultiplier={1.4}>
                      {card.canonName}
                    </Text>
                    <Text style={styles.tileRole} maxFontSizeMultiplier={1.4}>
                      {dealtLine(card)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          <ScrollView style={styles.proseScroll} contentContainerStyle={styles.proseContent}>
            {paragraphs.length === 0 ? (
              // An arc with no pages degrades warmly — never a blank card.
              <Text style={styles.restingPage} maxFontSizeMultiplier={1.6}>
                This tale's pages are still blank — head back to the Shelf and weave a new story.
              </Text>
            ) : null}
            {paragraphs.map((p, i) => (
              <Text
                key={i}
                style={[styles.prose, i > 0 && styles.proseGap]}
                maxFontSizeMultiplier={1.6}
              >
                {i === 0
                  ? [
                      <Text key="cap" style={styles.dropCap} maxFontSizeMultiplier={1.6}>
                        {p.slice(0, 1)}
                      </Text>,
                      p.slice(1),
                    ]
                  : p}
              </Text>
            ))}
            {isLast && arc.closingVerseEnabled ? (
              <Text style={styles.verse} maxFontSizeMultiplier={1.6}>
                A gentle closing verse would appear here.
              </Text>
            ) : null}
          </ScrollView>
        </View>

        <View style={styles.pager}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous page"
            accessibilityState={{ disabled: page === 0 }}
            disabled={page === 0}
            style={pressedStyle(styles.btn, styles.btnGhost, page === 0 && styles.btnDisabled)}
            onPress={() => setPage((p) => Math.max(0, p - 1))}
          >
            <Text style={styles.btnGhostText} maxFontSizeMultiplier={1.4}>
              ‹ Back
            </Text>
          </Pressable>

          <View accessible accessibilityLabel={pagePosition} style={styles.dots}>
            {beats.map((_, i) => (
              <View
                key={i}
                style={[styles.dot, i < page && styles.dotRead, i === page && styles.dotActive]}
              />
            ))}
          </View>

          {isLast ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="New story"
              style={pressedStyle(styles.btn, styles.btnSolid)}
              onPress={() => navigate({ screen: "wizard" })}
            >
              <Text style={styles.btnSolidText} maxFontSizeMultiplier={1.4}>
                New story
              </Text>
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Next page"
              style={pressedStyle(styles.btn, styles.btnSolid)}
              onPress={() => setPage((p) => Math.min(total - 1, p + 1))}
            >
              <Text style={styles.btnSolidText} maxFontSizeMultiplier={1.4}>
                Next page ›
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      {artCard ? (
        <Animated.View
          accessibilityViewIsModal
          style={[
            styles.artOverlay,
            {
              opacity: artIn,
              transform: [
                { scale: artIn.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
              ],
            },
          ]}
        >
          {/* Tap anywhere dismisses; the ✕ is the labelled close affordance.
              The scrim is a surface, not a control — no pressed feedback. */}
          <Pressable accessible={false} style={styles.artScrim} onPress={() => setArtCard(null)}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close entity art"
              style={pressedStyle(styles.artClose)}
              onPress={() => setArtCard(null)}
            >
              <Text style={styles.artCloseGlyph} maxFontSizeMultiplier={1.4}>
                ✕
              </Text>
            </Pressable>
            <View style={styles.artPlate}>
              {artSource ? (
                <Image
                  style={styles.artImage}
                  source={artSource}
                  resizeMode="contain"
                  accessibilityLabel={artCard.canonName}
                />
              ) : (
                <Text style={styles.tilePlaceholderText} maxFontSizeMultiplier={1.4}>
                  {artCard.lockedImageRef || "Art coming soon"}
                </Text>
              )}
            </View>
            <View style={styles.artCaption}>
              <Text style={styles.artName} maxFontSizeMultiplier={1.4}>
                {artCard.canonName}
              </Text>
              <Text style={styles.artRole} maxFontSizeMultiplier={1.4}>
                {artCard.role}
              </Text>
            </View>
          </Pressable>
        </Animated.View>
      ) : null}
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
    // Portrait-first; capped content width keeps tablets bookish.
    column: {
      flex: 1,
      width: "100%",
      maxWidth: 520,
      alignSelf: "center",
      paddingTop: 44,
      paddingBottom: 16,
    },
    topbar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 4,
    },
    backLink: { minHeight: 44, justifyContent: "center", paddingRight: 12 },
    backLinkText: { ...type.backLink, color: colors.ink2 },
    worldName: { ...type.worldName, color: colors.ink2 },
    pageCount: { ...type.pageCount, color: colors.ink2 },
    vignette: { alignItems: "center", paddingTop: 2 },
    titleBlock: { alignItems: "center", paddingHorizontal: 24, paddingTop: 4, paddingBottom: 10 },
    arcTitle: { ...type.display, color: colors.ink, textAlign: "center", textTransform: "capitalize" },
    spineStage: { ...type.spineStage, color: colors.ink2, marginTop: 6, textAlign: "center" },
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
      marginHorizontal: 16,
      marginBottom: 8,
      textAlign: "center",
    },
    // The story card: radius 14, side margins 16, padding 14/20/12, hairline border.
    pageCard: {
      flex: 1,
      marginHorizontal: 16,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 14,
      paddingTop: 14,
      paddingHorizontal: 20,
      paddingBottom: 12,
      shadowColor: colors.ink, // soft ink-tinted shadow
      shadowOpacity: 0.1,
      shadowRadius: 13,
      shadowOffset: { width: 0, height: 8 },
      elevation: 3,
    },
    cardsRow: { flexDirection: "row", gap: 12, marginBottom: 14 },
    tile: { flex: 1, minWidth: 0 },
    // Slight counter-rotations for a hand-placed feel.
    tiltLeft: { transform: [{ rotate: "-0.7deg" }] },
    tiltRight: { transform: [{ rotate: "0.5deg" }] },
    tileArt: {
      aspectRatio: 2,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 8,
      overflow: "hidden",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.bg,
    },
    tileImage: { width: "100%", height: "100%" },
    tilePlaceholderText: { ...type.entityRole, color: colors.ink2, textAlign: "center", padding: 4 },
    tileName: { ...type.entityName, color: colors.ink, textAlign: "center", marginTop: 7 },
    tileRole: { ...type.entityRole, color: colors.ink2, textAlign: "center", marginTop: 1 },
    proseScroll: { flex: 1 },
    proseContent: { paddingBottom: 6 },
    prose: { ...type.body, color: colors.ink },
    proseGap: { marginTop: 12 },
    // Raised cap on accent — the recorded RN deviation from the appendix's
    // floated 3.3em drop cap; size/face live in the token (large-text, 3:1).
    dropCap: { ...type.dropCap, color: colors.accent },
    verse: { ...type.body, color: colors.ink2, fontStyle: "italic", textAlign: "center", marginTop: 16 },
    // The warm empty-pages line: read-aloud voice in the supporting ink.
    restingPage: { ...type.body, color: colors.ink2, fontStyle: "italic", textAlign: "center", marginTop: 8 },
    pager: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      paddingHorizontal: 16,
      paddingTop: 12,
    },
    // Pills, ≥44pt touch targets.
    btn: { minHeight: 44, borderRadius: 999, paddingHorizontal: 18, alignItems: "center", justifyContent: "center" },
    btnGhost: { borderWidth: 1.5, borderColor: colors.accent, backgroundColor: "transparent" },
    btnDisabled: { opacity: 0.4 },
    btnGhostText: { ...type.button, color: colors.ink2 },
    btnSolid: { backgroundColor: colors.accent, borderWidth: 1.5, borderColor: colors.accent },
    btnSolidText: { ...type.button, color: colors.accentInk },
    dots: { flexDirection: "row", alignItems: "center", gap: 5 },
    dot: { width: 6, height: 6, borderRadius: 999, backgroundColor: colors.line },
    dotRead: { backgroundColor: colors.ink2, opacity: 0.55 },
    dotActive: { backgroundColor: colors.accent, width: 18 },
    artOverlay: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: colors.bg,
      zIndex: 10,
    },
    artScrim: {
      flex: 1,
      alignItems: "center",
      gap: 16,
      paddingTop: 64,
      paddingHorizontal: 20,
      paddingBottom: 60,
    },
    artClose: {
      position: "absolute",
      top: 12,
      right: 12,
      width: 44,
      height: 44,
      borderRadius: 999,
      borderWidth: 1.5,
      borderColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
      zIndex: 11,
    },
    artCloseGlyph: { ...type.button, fontSize: 17, color: colors.ink2 },
    artPlate: {
      alignSelf: "stretch",
      flex: 1,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 12,
      backgroundColor: colors.surface,
      overflow: "hidden",
      alignItems: "center",
      justifyContent: "center",
    },
    artImage: { width: "100%", height: "100%" },
    artCaption: { alignItems: "center" },
    artName: { ...type.entityNameArt, color: colors.ink, textAlign: "center" },
    artRole: { ...type.entityRoleArt, color: colors.ink2, marginTop: 3 },
  });
}
