import React, { useEffect, useMemo, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { WorldSummary } from "../storage/localStore";
import { useNav } from "../nav/NavContext";
import { blobFs, store, whenStoreReady } from "../storage/store";
import { artImageSource } from "../storage/artSource";
import { useTheme, type Theme } from "../theme/ThemeContext";
import { pressedStyle } from "../theme/pressed";
import StorytimeVignette from "../components/StorytimeVignette";

/**
 * Library — the home bookshelf (SPEC §2.14: the library lives on the device),
 * #5 build-order slice 4, styled to the locked direction
 * (docs/design/ui-direction.md + prototype-confirmed appendix).
 *
 * Lists every saved Storyworld newest-first from the store's summary
 * projection (title, `coverRef` thumb, created date) — no full payloads on the
 * shelf. Each story sits on its own surface card (hairline border, radius 14):
 * cover art on a 2:1 plate (radius 8) with alternating counter-rotations down
 * the shelf for the hand-placed feel, then the title and kept-since date.
 * Tapping a card fetches the full Storyworld and re-opens its most recent arc
 * in the Viewer with the exact {arc, cards, bible} params the creation path
 * passes, so the Viewer stays single-mode. Reloads on every mount — returning
 * to the shelf is always fresh. A failed open shows a warm inline error and
 * stays on the shelf. The EMPTY shelf is a composition (§1/§5): the
 * StorytimeVignette motif over a warm invitation to weave the first story.
 * ＋ New Story is the single accent pill — accent grounds the primary action
 * only. All color/type comes from the theme — no hardcoded values (the
 * one-token-system tripwire enforces it).
 */
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * "2026-07-15T…" → "July 15, 2026" — warm parent-facing copy, never raw ISO
 * (§7). Slices the ISO fields directly: no date lib, and no Date.parse
 * timezone drift shifting the kept-since day.
 */
function formatKeptSince(createdAt: string): string {
  const year = createdAt.slice(0, 4);
  const month = Number(createdAt.slice(5, 7));
  const day = Number(createdAt.slice(8, 10));
  return `${MONTH_NAMES[month - 1]} ${day}, ${year}`;
}

export default function LibraryScreen() {
  const { navigate } = useNav();
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [worlds, setWorlds] = useState<WorldSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false; // guards the setState below if the shelf unmounts mid-load
    void (async () => {
      try {
        await whenStoreReady();
        const listed = await store.listWorldSummaries();
        if (!cancelled) setWorlds(listed);
      } catch {
        if (!cancelled) setError("Couldn't load your bookshelf. Close and reopen the app to try again.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function openWorld(id: string) {
    setError(null);
    try {
      // Independent reads — fetch the full world and its arcs concurrently.
      const [world, [arc]] = await Promise.all([store.getWorld(id), store.listArcs(id)]); // arcs newest first (MVP: 1/world)
      if (!world || !arc) throw new Error(`world ${id} has nothing to open`);
      navigate({
        screen: "viewer",
        params: { arc, cards: world.deck, bible: world.bible, source: "library" },
      });
    } catch {
      setError("Couldn't open that story. Try another, or weave a new one.");
    }
  }

  return (
    <View style={styles.screen}>
      {/* Ambient lamp wash from the top — decorative, the "warm light source". */}
      <View style={styles.lampWash} pointerEvents="none" />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
        <Text accessibilityRole="header" style={styles.title} maxFontSizeMultiplier={1.4}>
          Your Bookshelf
        </Text>
        <Text style={styles.subtitle} maxFontSizeMultiplier={1.6}>
          Every tale you've woven, kept safe on this device.
        </Text>

        {error ? (
          <Text style={styles.error} maxFontSizeMultiplier={1.4}>
            {error}
          </Text>
        ) : null}

        {worlds === null && !error ? (
          // Loading: a quiet skeleton story card holds the shelf's shape —
          // static lines only (the #9 pass owns any shimmer loop).
          <View accessible accessibilityLabel="Loading your bookshelf" style={styles.loadingCard}>
            <View style={styles.skeletonPlate} />
            <View style={styles.skeletonLine} />
            <View style={[styles.skeletonLine, styles.skeletonLineShort]} />
          </View>
        ) : null}

        {worlds?.length === 0 ? (
          // Empty state per §1/§5: a composition of motif art + warm copy, not a component.
          <View style={styles.emptyState}>
            <StorytimeVignette variant="plate" />
            <Text style={styles.emptyText} maxFontSizeMultiplier={1.6}>
              No tales on the shelf yet — weave your first bedtime story.
            </Text>
          </View>
        ) : null}

        {(worlds ?? []).map((world, i) => {
          const source = artImageSource(world.coverRef ?? "", blobFs);
          // Alternating counter-rotations down the shelf — the hand-placed feel.
          const tilt = i % 2 === 0 ? styles.tiltLeft : styles.tiltRight;
          const keptSince = formatKeptSince(world.createdAt);
          return (
            <Pressable
              key={world.id}
              accessibilityRole="button"
              // Voices everything the card shows: the name AND the kept-since date.
              accessibilityLabel={`Open ${world.name}, kept since ${keptSince}`}
              style={pressedStyle(styles.storyCard)}
              onPress={() => void openWorld(world.id)}
            >
              <View style={[styles.coverArt, tilt]}>
                {/* The card's label is the one voiced — the art stays quiet. */}
                {source ? (
                  <Image style={styles.coverImage} source={source} resizeMode="cover" />
                ) : null}
              </View>
              <Text style={styles.storyName} numberOfLines={1} maxFontSizeMultiplier={1.4}>
                {world.name}
              </Text>
              <Text style={styles.storyDate} maxFontSizeMultiplier={1.4}>
                {`Kept since ${keptSince}`}
              </Text>
            </Pressable>
          );
        })}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="New Story"
          style={pressedStyle(styles.primary)}
          onPress={() => navigate({ screen: "wizard" })}
        >
          <Text style={styles.primaryText} maxFontSizeMultiplier={1.4}>
            ＋ New Story
          </Text>
        </Pressable>
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
      paddingTop: 64,
      paddingBottom: 24,
      gap: 16,
    },
    title: { ...type.display, color: colors.ink, textAlign: "center" },
    subtitle: { ...type.entityName, color: colors.ink2, textAlign: "center", marginTop: -6 },
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
    emptyState: { alignItems: "center", gap: 14, paddingTop: 18 },
    // Loading skeleton: the story-card chrome holding quiet page lines.
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
    emptyText: { ...type.body, color: colors.ink, textAlign: "center", paddingHorizontal: 24 },
    // One surface card per story: radius 14, hairline border, soft ink shadow.
    storyCard: {
      minHeight: 44,
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
    // Slight counter-rotations for a hand-placed feel.
    tiltLeft: { transform: [{ rotate: "-0.7deg" }] },
    tiltRight: { transform: [{ rotate: "0.5deg" }] },
    coverArt: {
      aspectRatio: 2,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 8,
      overflow: "hidden",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.bg,
    },
    coverImage: { width: "100%", height: "100%" },
    storyName: { ...type.entityNameArt, color: colors.ink, marginTop: 10 },
    storyDate: { ...type.pageCount, color: colors.ink2, marginTop: 2 },
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
