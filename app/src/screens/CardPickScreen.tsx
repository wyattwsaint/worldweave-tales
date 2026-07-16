import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Card, CardRole, GeneratedCardChoice } from "@wwt/domain";
import { applyCardPick } from "../flow/applyCardPick";
import { useNav, type CardPickParams } from "../nav/NavContext";

/**
 * Card-Pick screen. For each pending hero/villain choice the parent taps one
 * variant swatch. The refs (e.g. "stub-image:hero#0") are NOT image URLs, so
 * they render as labeled placeholder tiles — never <Image>. Once every role is
 * picked, we build the Card objects and canonize each via applyCardPick.
 */
export default function CardPickScreen({ params }: { params: CardPickParams }) {
  const { navigate } = useNav();
  const { response } = params;
  const choices = response.pendingCardChoices;

  const [picks, setPicks] = useState<Record<string, string>>({});

  const allPicked = choices.every((c) => picks[c.role]);

  function onConfirm() {
    const now = new Date();
    const pickedCards: Card[] = choices.map((choice) => {
      const base = draftCard(choice);
      return applyCardPick(base, picks[choice.role], now);
    });
    const cards: Card[] = [...pickedCards, ...response.newCanonCards];
    navigate({ screen: "viewer", params: { arc: response.arc, cards } });
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Pick the Art</Text>
      <Text style={styles.subtitle}>
        Tap one look for each character. Locked in forever once you weave.
      </Text>

      {choices.map((choice) => (
        <View key={choice.role} style={styles.group}>
          <Text style={styles.role}>{choice.role}</Text>
          <View style={styles.swatchRow}>
            {choice.variantImageRefs.map((ref) => {
              const on = picks[choice.role] === ref;
              return (
                <Pressable
                  key={ref}
                  style={[styles.swatch, on && styles.swatchOn]}
                  onPress={() => setPicks((p) => ({ ...p, [choice.role]: ref }))}
                >
                  <Text style={[styles.swatchLabel, on && styles.swatchLabelOn]}>{ref}</Text>
                  {on ? <Text style={styles.check}>✓ chosen</Text> : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}

      <Pressable
        style={[styles.primary, !allPicked && styles.primaryDisabled]}
        onPress={onConfirm}
        disabled={!allPicked}
      >
        <Text style={styles.primaryText}>
          {allPicked ? "Weave the tale" : "Pick every look to continue"}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

/** Build a not-yet-canonized Card for a pending choice. applyCardPick locks it. */
function draftCard(choice: GeneratedCardChoice): Card {
  const role: CardRole = choice.role;
  return {
    entityId: role, // matches the beat dealtCardIds ("hero"/"villain")
    role,
    canonName: role.charAt(0).toUpperCase() + role.slice(1),
    traits: [],
    appearanceNote: `The chosen ${role}.`,
    lockedImageRef: "", // set by applyCardPick from the tapped variant
    relationships: [],
    canonizedAt: "",
  };
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 64, gap: 20 },
  title: { fontSize: 28, fontWeight: "700", color: "#1a1a2e" },
  subtitle: { fontSize: 15, color: "#555" },
  group: { gap: 10 },
  role: { fontSize: 18, fontWeight: "600", color: "#333", textTransform: "capitalize" },
  swatchRow: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  swatch: {
    width: 100,
    height: 120,
    borderRadius: 12,
    backgroundColor: "#e8e6f4",
    borderWidth: 2,
    borderColor: "#ddd",
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
    gap: 6,
  },
  swatchOn: { borderColor: "#4a3f8c", backgroundColor: "#d5cff0" },
  swatchLabel: { fontSize: 12, color: "#555", textAlign: "center" },
  swatchLabelOn: { color: "#2c2560", fontWeight: "600" },
  check: { fontSize: 12, color: "#4a3f8c", fontWeight: "700" },
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
