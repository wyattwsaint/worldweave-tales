import React, { useEffect, useMemo, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Arc, Storyworld } from "@wwt/domain";
import { formatKeptSince } from "../flow/keptSince";
import { useNav, type WorldParams } from "../nav/NavContext";
import { arcTitle } from "../storage/persistence";
import { artImageSource } from "../storage/artSource";
import { blobFs, store, whenStoreReady } from "../storage/store";
import { useTheme, type Theme } from "../theme/ThemeContext";
import { pressedStyle } from "../theme/pressed";

/**
 * World screen — one Storyworld's own shelf (#10), styled to the locked
 * direction (docs/design/ui-direction.md + prototype-confirmed appendix).
 *
 * A Storyworld is the unit of canon and owns MANY arcs (SPEC #21), so this is
 * where a world's life is visible: every tale woven in it (re-read any of them,
 * newest first), the canon deck whose art is locked forever, and the one action
 * that makes it a franchise — ＋ Weave a new tale, which re-enters the wizard in
 * continue mode with this world in hand.
 *
 * Layout: ‹ Shelf ghost link → cover plate + world name + kept-since → the tales
 * list (one surface card each) → the canon strip → the accent primary. Loads the
 * world and its arcs concurrently on mount; a failed load degrades to warm
 * parent-facing copy with the way back to the shelf still available (§7). All
 * color/type comes from the theme — no hardcoded values (the one-token-system
 * tripwire enforces it).
 */
export default function WorldScreen({ params }: { params: WorldParams }) {
  const { navigate, goHome } = useNav();
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [world, setWorld] = useState<Storyworld | null>(null);
  const [arcs, setArcs] = useState<Arc[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false; // guards the setStates below if the screen unmounts mid-load
    void (async () => {
      try {
        await whenStoreReady();
        // Independent reads — the world payload and its arc list run concurrently.
        const [loaded, listed] = await Promise.all([
          store.getWorld(params.worldId),
          store.listArcs(params.worldId),
        ]);
        if (cancelled) return;
        if (!loaded) throw new Error(`world ${params.worldId} is not on the shelf`);
        setWorld(loaded);
        setArcs(listed);
      } catch {
        if (!cancelled) setError("Couldn't open that world. Head back to the shelf and try again.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.worldId]);

  const cover = artImageSource(world?.deck[0]?.lockedImageRef ?? "", blobFs);

  return (
    <View style={styles.screen}>
      {/* Ambient lamp wash from the top — decorative, the "warm light source". */}
      <View style={styles.lampWash} pointerEvents="none" />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to the Shelf"
          style={pressedStyle(styles.escape)}
          onPress={goHome}
        >
          <Text style={styles.escapeText} maxFontSizeMultiplier={1.4}>
            ‹ Shelf
          </Text>
        </Pressable>

        {error ? (
          <Text accessibilityRole="alert" style={styles.error} maxFontSizeMultiplier={1.6}>
            {error}
          </Text>
        ) : null}

        {!world && !error ? (
          <View accessible accessibilityLabel="Opening this world" style={styles.loadingCard}>
            <View style={styles.skeletonPlate} />
            <View style={styles.skeletonLine} />
            <View style={[styles.skeletonLine, styles.skeletonLineShort]} />
          </View>
        ) : null}

        {world ? (
          <>
            <View style={styles.coverArt}>
              {cover ? <Image style={styles.coverImage} source={cover} resizeMode="cover" /> : null}
            </View>
            <Text accessibilityRole="header" style={styles.title} maxFontSizeMultiplier={1.4}>
              {world.name}
            </Text>
            <Text style={styles.subtitle} maxFontSizeMultiplier={1.6}>
              {`Kept since ${formatKeptSince(world.createdAt)}`}
            </Text>

            <Text style={styles.sectionLabel} maxFontSizeMultiplier={1.4}>
              {(arcs?.length ?? 0) === 1 ? "One tale so far" : `${arcs?.length ?? 0} tales so far`}
            </Text>
            {(arcs ?? []).map((arc) => {
              const title = arcTitle(arc);
              const when = formatKeptSince(arc.createdAt);
              return (
                <Pressable
                  key={arc.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Re-read ${title}, woven ${when}`}
                  style={pressedStyle(styles.taleCard)}
                  onPress={() =>
                    navigate({
                      screen: "viewer",
                      params: {
                        arc,
                        cards: world.deck,
                        bible: world.bible,
                        artStyle: world.artStyle,
                        // Already on the shelf — the Viewer must not re-save it.
                        source: "library",
                      },
                    })
                  }
                >
                  <Text style={styles.taleName} numberOfLines={1} maxFontSizeMultiplier={1.4}>
                    {title}
                  </Text>
                  <Text style={styles.taleDate} maxFontSizeMultiplier={1.4}>
                    {`Woven ${when}`}
                  </Text>
                </Pressable>
              );
            })}

            {/* The canon: drawn once, locked forever, and free to reuse in every
                new arc — so the parent can see what a new tale already owns. */}
            {world.deck.length > 0 ? (
              <View style={styles.canonCard}>
                <Text style={styles.sectionLabel} maxFontSizeMultiplier={1.4}>
                  The canon
                </Text>
                <View style={styles.canonRow}>
                  {world.deck.map((card) => {
                    const source = artImageSource(card.lockedImageRef, blobFs);
                    return (
                      <View key={card.entityId} style={styles.canonTile}>
                        <View style={styles.canonArt}>
                          {source ? (
                            <Image style={styles.canonImage} source={source} resizeMode="cover" />
                          ) : null}
                        </View>
                        <Text style={styles.canonName} numberOfLines={1} maxFontSizeMultiplier={1.4}>
                          {card.canonName}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Weave a new tale"
              style={pressedStyle(styles.primary)}
              onPress={() => navigate({ screen: "wizard", params: { world } })}
            >
              <Text style={styles.primaryText} maxFontSizeMultiplier={1.4}>
                ＋ Weave a new tale
              </Text>
            </Pressable>
          </>
        ) : null}
      </ScrollView>
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
      paddingTop: 44,
      paddingBottom: 24,
      gap: 14,
    },
    // A quiet ghost link home — never competing with the one accent action.
    escape: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start" },
    escapeText: { ...type.backLink, color: colors.ink2 },
    title: { ...type.display, color: colors.ink, textAlign: "center" },
    subtitle: { ...type.entityName, color: colors.ink2, textAlign: "center", marginTop: -6 },
    sectionLabel: { ...type.spineStage, color: colors.ink2 },
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
    loadingCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 14,
      paddingTop: 14,
      paddingHorizontal: 20,
      paddingBottom: 16,
      gap: 10,
    },
    skeletonPlate: {
      aspectRatio: 2,
      borderRadius: 8,
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.line,
    },
    skeletonLine: { height: 12, borderRadius: 6, backgroundColor: colors.line, opacity: 0.7 },
    skeletonLineShort: { width: "62%" },
    coverArt: {
      aspectRatio: 2,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 8,
      overflow: "hidden",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.bg,
      transform: [{ rotate: "-0.7deg" }], // the hand-placed feel
    },
    coverImage: { width: "100%", height: "100%" },
    // One surface card per tale: radius 14, hairline border, soft ink shadow.
    taleCard: {
      minHeight: 44,
      justifyContent: "center",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 14,
      paddingTop: 12,
      paddingHorizontal: 20,
      paddingBottom: 12,
      shadowColor: colors.ink,
      shadowOpacity: 0.1,
      shadowRadius: 13,
      shadowOffset: { width: 0, height: 8 },
      elevation: 3,
    },
    taleName: { ...type.entityNameArt, color: colors.ink },
    taleDate: { ...type.pageCount, color: colors.ink2, marginTop: 2 },
    canonCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 14,
      paddingTop: 14,
      paddingHorizontal: 20,
      paddingBottom: 16,
      gap: 10,
    },
    canonRow: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
    canonTile: { width: 84, gap: 6 },
    canonArt: {
      aspectRatio: 1,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 8,
      overflow: "hidden",
      backgroundColor: colors.bg,
    },
    canonImage: { width: "100%", height: "100%" },
    canonName: { ...type.pageCount, color: colors.ink2, textAlign: "center" },
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
    primaryText: { ...type.button, color: colors.accentInk },
  });
}
