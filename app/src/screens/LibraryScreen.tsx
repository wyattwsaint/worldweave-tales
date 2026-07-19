import React, { useEffect, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Storyworld } from "@wwt/domain";
import { useNav } from "../nav/NavContext";
import { blobFs, store, whenStoreReady } from "../storage/store";
import { artImageSource } from "../storage/artSource";

/**
 * Library — the home bookshelf (SPEC §2.14: the library lives on the device).
 * Lists every saved Storyworld newest-first: title, cover thumb (the deck's
 * first locked ref — the same derivation saveWorld indexes as `cover_ref`),
 * and created date. Tapping a world re-opens its most recent arc in the Viewer
 * with the exact {arc, cards, bible} params the creation path passes, so the
 * Viewer stays single-mode. Reloads on every mount — returning to the shelf is
 * always fresh. A failed open shows an inline error and stays on the shelf.
 */
export default function LibraryScreen() {
  const { navigate } = useNav();
  const [worlds, setWorlds] = useState<Storyworld[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false; // guards the setState below if the shelf unmounts mid-load
    void (async () => {
      try {
        await whenStoreReady();
        const listed = await store.listWorlds();
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
      const world = await store.getWorld(id);
      const [arc] = world ? await store.listArcs(id) : []; // newest first (MVP: 1/world)
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
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Your Bookshelf</Text>
      <Text style={styles.subtitle}>Every tale you've woven, kept safe on this device.</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {worlds?.length === 0 ? (
        <Text style={styles.empty}>No tales on the shelf yet — weave your first bedtime story.</Text>
      ) : null}

      {(worlds ?? []).map((world) => {
        const source = artImageSource(world.deck[0]?.lockedImageRef ?? "", blobFs);
        return (
          <Pressable key={world.id} style={styles.shelfRow} onPress={() => void openWorld(world.id)}>
            {source ? (
              <Image
                style={styles.thumb}
                source={source}
                resizeMode="cover"
                accessibilityLabel={world.name}
              />
            ) : (
              <View style={styles.thumb} />
            )}
            <View style={styles.rowBody}>
              <Text style={styles.worldName}>{world.name}</Text>
              <Text style={styles.worldDate}>{world.createdAt.slice(0, 10)}</Text>
            </View>
          </Pressable>
        );
      })}

      <Pressable style={styles.primary} onPress={() => navigate({ screen: "wizard" })}>
        <Text style={styles.primaryText}>＋ New Story</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 64, gap: 16 },
  title: { fontSize: 28, fontWeight: "700", color: "#1a1a2e" },
  subtitle: { fontSize: 15, color: "#555" },
  error: { fontSize: 14, color: "#a13333" },
  empty: { fontSize: 15, color: "#555", fontStyle: "italic" },
  shelfRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "#faf9fd",
    borderWidth: 1,
    borderColor: "#eee",
  },
  thumb: {
    width: 64,
    height: 78,
    borderRadius: 10,
    backgroundColor: "#e8e6f4",
    borderWidth: 1,
    borderColor: "#d5cff0",
  },
  rowBody: { flex: 1, gap: 4 },
  worldName: { fontSize: 17, fontWeight: "600", color: "#222" },
  worldDate: { fontSize: 13, color: "#777" },
  primary: {
    marginTop: 8,
    backgroundColor: "#4a3f8c",
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: "center",
  },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
