import React from "react";
import { Image, StyleSheet, View } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import sceneDay from "../../assets/scene-day.png";
import sceneNight from "../../assets/scene-night.png";

/**
 * The storytime motif (ui-direction.md §1 + the 2026-07-20 amendment): the real
 * pencil-sketch plate — a father reading in bed with a child leaning against
 * him, the story rising off the page as a star. Day and night are the SAME
 * drawing lit differently (art-brief.md), so the motif always sits on its own
 * ground.
 *
 * Two footprints from the one plate:
 *
 * - `band` (default) — the Viewer header bookplate at the locked 141×96. The
 *   plate is 3:4 portrait, so the band is a crop, not a squeeze: scaled to the
 *   crop's width and clipped to {@link BAND_CROP}, the reading window with both
 *   faces, the open book and the star.
 * - `plate` — the empty shelf, the full portrait at its own aspect.
 *
 * Decorative in both: no touches, hidden from screen readers (the surrounding
 * copy carries the meaning).
 */

/** Intrinsic size of the shipped plates (pinned by artAssets.contract.test.ts). */
export const PLATE = { width: 768, height: 1024 } as const;

/**
 * The header band's crop rectangle, in plate pixels: both faces, the child
 * leaning in, the star and the top of the open book — the bedding below is left
 * outside, the bedside lamp survives at the left edge as glow. Verified against
 * the shipped plate, not guessed: a band starting lower cuts the father's face
 * at the mouth.
 *
 * 705×480 is EXACTLY the band's 141×96 aspect (both 1.46875). Any other shape
 * would letterbox or distort, and an approximate one clips a hairline.
 */
export const BAND_CROP = { x: 32, y: 230, width: 705, height: 480 } as const;

const BAND = { width: 141, height: 96 } as const;

export type VignetteVariant = "band" | "plate";

export default function StorytimeVignette({
  variant = "band",
}: {
  variant?: VignetteVariant;
} = {}) {
  const { mode } = useTheme();
  const source = mode === "night" ? sceneNight : sceneDay;
  const decorative = {
    pointerEvents: "none",
    accessibilityElementsHidden: true,
    importantForAccessibility: "no-hide-descendants",
  } as const;

  if (variant === "plate") {
    return (
      <View style={styles.plateFrame} {...decorative}>
        <Image source={source} resizeMode="contain" style={styles.plateImage} />
      </View>
    );
  }

  // Width-first scale: the crop's width fills the band, and because the crop
  // carries the band's aspect its height lands on 96 too.
  const scale = BAND.width / BAND_CROP.width;
  return (
    <View style={styles.bandFrame} {...decorative}>
      <Image
        source={source}
        style={{
          position: "absolute",
          width: PLATE.width * scale,
          height: PLATE.height * scale,
          left: -BAND_CROP.x * scale,
          top: -BAND_CROP.y * scale,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bandFrame: {
    width: BAND.width,
    height: BAND.height,
    overflow: "hidden",
  },
  plateFrame: {
    width: "100%",
    alignItems: "center",
  },
  plateImage: {
    width: "100%",
    // Capped: unbounded, a 3:4 plate at tablet width becomes a poster the empty
    // shelf's copy disappears under (portrait-first tablet rule, §"Execution").
    maxWidth: 280,
    aspectRatio: PLATE.width / PLATE.height,
  },
});
