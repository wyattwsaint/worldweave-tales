import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme/ThemeContext";

/**
 * Motif A — the storytime header bookplate (ui-direction.md §1 + appendix:
 * 141×96 vignette above the Viewer title).
 *
 * PLACEHOLDER ART: the final pencil-sketch drawing (father with a child
 * leaning against him, open storybook, warm light source) ships with the #6
 * asset pass. The app deliberately carries no SVG dependency, so until then
 * this composes the scene's essentials from themed primitives at the exact
 * locked footprint: the lamp-glow, the open storybook, and stars drifting up
 * from its pages. Decorative only — hidden from accessibility, no touches.
 */
export default function StorytimeVignette() {
  const { colors } = useTheme();
  return (
    <View
      style={styles.plate}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={[styles.glow, { backgroundColor: colors.accent }]} />
      {/* Positioned art, not reading copy: never scales with a11y font sizes,
          or the stars blow out of the fixed 141×96 plate. */}
      <Text allowFontScaling={false} style={[styles.star, styles.starLow, { color: colors.accent }]}>✦</Text>
      <Text allowFontScaling={false} style={[styles.star, styles.starMid, { color: colors.accent }]}>✦</Text>
      <Text allowFontScaling={false} style={[styles.star, styles.starHigh, { color: colors.accent }]}>✦</Text>
      <View style={styles.book}>
        <View style={[styles.page, styles.pageLeft, { borderColor: colors.ink }]} />
        <View style={[styles.pageSpine, { backgroundColor: colors.ink }]} />
        <View style={[styles.page, styles.pageRight, { borderColor: colors.ink }]} />
      </View>
      <View style={[styles.bedLine, { backgroundColor: colors.line }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  plate: {
    width: 141,
    height: 96,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  glow: {
    position: "absolute",
    top: 6,
    alignSelf: "center",
    width: 78,
    height: 78,
    borderRadius: 999,
    opacity: 0.14,
  },
  star: { position: "absolute" },
  starLow: { right: 34, bottom: 40, fontSize: 15, opacity: 0.95 },
  starMid: { right: 22, bottom: 58, fontSize: 12, opacity: 0.7 },
  starHigh: { right: 40, bottom: 74, fontSize: 9, opacity: 0.5 },
  book: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginBottom: 12,
  },
  page: {
    width: 24,
    height: 13,
    borderBottomWidth: 1.7,
    opacity: 0.85,
  },
  pageLeft: {
    borderLeftWidth: 1.7,
    borderBottomLeftRadius: 3,
    transform: [{ skewY: "8deg" }],
  },
  pageRight: {
    borderRightWidth: 1.7,
    borderBottomRightRadius: 3,
    transform: [{ skewY: "-8deg" }],
  },
  pageSpine: {
    width: 1.7,
    height: 15,
    marginHorizontal: 1,
    opacity: 0.85,
  },
  bedLine: {
    width: 104,
    height: 1,
    marginBottom: 2,
  },
});
