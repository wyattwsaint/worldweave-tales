import React, { useEffect } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Card, Storyworld } from "@wwt/domain";
import { useNav, type ViewerParams } from "../nav/NavContext";
import { artDownloader, blobFs, store, whenStoreReady } from "../storage/store";
import { persistFinishedWorld } from "../storage/persistence";
import { artImageSource } from "../storage/artSource";

/**
 * Viewer. Renders the finished Arc one section per Beat (spine label + text),
 * with each beat's dealt cards shown as locked art: a blob-backed <Image> when
 * the card has real art (a downloaded blob or a remote URL), else a labeled text
 * placeholder tile (e.g. a `stub-image:*` ref). Durably persists the world AND its arc on
 * mount — downloading each card's ephemeral remote art to a local blob first,
 * so a re-read survives the Recraft URL expiring (SPEC §2.22, §5).
 */
export default function ViewerScreen({ params }: { params: ViewerParams }) {
  const { navigate } = useNav();
  const { arc, cards, bible } = params;
  const byId = new Map<string, Card>(cards.map((c) => [c.entityId, c]));

  useEffect(() => {
    const world: Storyworld = {
      id: arc.worldId,
      name: arc.worldId,
      artStyle: { presetId: "pencil-sketch", displayName: "Imaginative Pencil-Sketch" },
      defaultAgeBand: arc.ageBand,
      deck: cards,
      bible,
      arcIds: [arc.id],
      createdAt: arc.createdAt,
    };
    void (async () => {
      await whenStoreReady();
      await persistFinishedWorld(world, arc, { store, downloadArt: artDownloader });
    })();
  }, [arc, cards, bible]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Your Tale</Text>
      <Text style={styles.meta}>
        {arc.shape} · {arc.ageBand} ·{" "}
        {arc.teachingPoint.kind === "virtue"
          ? arc.teachingPoint.virtue
          : arc.teachingPoint.description}
      </Text>

      {arc.beats.map((beat, i) => (
        <View key={`${beat.spineBeat}-${i}`} style={styles.page}>
          <Text style={styles.spineBeat}>{beat.spineBeat}</Text>
          <Text style={styles.beatText}>{beat.text}</Text>
          <View style={styles.cardRow}>
            {beat.dealtCardIds.map((id) => {
              const card = byId.get(id);
              if (!card) return null;
              const source = artImageSource(card.lockedImageRef, blobFs);
              return (
                <View key={id} style={styles.card}>
                  {source ? (
                    <Image
                      style={styles.swatch}
                      source={source}
                      resizeMode="cover"
                      accessibilityLabel={card.canonName}
                    />
                  ) : (
                    <View style={styles.swatch}>
                      <Text style={styles.swatchLabel}>
                        {card.lockedImageRef || "Art coming soon"}
                      </Text>
                    </View>
                  )}
                  <Text style={styles.cardName}>{card.canonName}</Text>
                  <Text style={styles.cardRole}>{card.role}</Text>
                </View>
              );
            })}
          </View>
        </View>
      ))}

      {arc.closingVerseEnabled ? (
        <Text style={styles.verse}>A gentle closing verse would appear here.</Text>
      ) : null}

      <Pressable style={styles.primary} onPress={() => navigate({ screen: "wizard" })}>
        <Text style={styles.primaryText}>New story</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 64, gap: 18 },
  title: { fontSize: 28, fontWeight: "700", color: "#1a1a2e" },
  meta: { fontSize: 14, color: "#666", textTransform: "capitalize" },
  page: {
    gap: 10,
    padding: 16,
    borderRadius: 14,
    backgroundColor: "#faf9fd",
    borderWidth: 1,
    borderColor: "#eee",
  },
  spineBeat: {
    fontSize: 13,
    fontWeight: "700",
    color: "#4a3f8c",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  beatText: { fontSize: 16, color: "#222", lineHeight: 23 },
  cardRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 4 },
  card: { width: 92, gap: 4, alignItems: "center" },
  swatch: {
    width: 92,
    height: 110,
    borderRadius: 10,
    backgroundColor: "#e8e6f4",
    borderWidth: 1,
    borderColor: "#d5cff0",
    alignItems: "center",
    justifyContent: "center",
    padding: 6,
  },
  swatchLabel: { fontSize: 11, color: "#555", textAlign: "center" },
  cardName: { fontSize: 13, fontWeight: "600", color: "#222" },
  cardRole: { fontSize: 12, color: "#777", textTransform: "capitalize" },
  verse: { fontSize: 15, fontStyle: "italic", color: "#4a3f8c", textAlign: "center" },
  primary: {
    marginTop: 8,
    backgroundColor: "#4a3f8c",
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: "center",
  },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
