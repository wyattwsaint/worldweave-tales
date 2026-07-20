/**
 * Design tokens — the single source of truth for color + type (#5 UI overhaul).
 *
 * Direction: `docs/design/ui-direction.md` (locked 2026-07-19). Hexes are the
 * AA-verified values from the prototype session; the contract tests
 * (`tokens.contract.test.ts`) pin them exactly AND enforce the invariants
 * (identical key sets across modes, WCAG AA for every text/ground pair) —
 * retuning starts with the ui-direction.md appendix, then the pin.
 *
 * Both palettes are first-class from day one; components never hardcode either
 * (ThemeContext resolves day/night via the system scheme).
 */

// Type-only: erased at compile, so this module stays runnable in plain node
// (the contract tests import it without any react-native runtime).
import type { TextStyle } from "react-native";

export type ThemeMode = "day" | "night";

export interface Palette {
  /** App ground. */
  bg: string;
  /** Raised paper/card ground. */
  surface: string;
  /** Primary text — body prose (AA 4.5:1 on bg AND surface). */
  ink: string;
  /** Supporting text — captions, metadata (AA 4.5:1 on bg AND surface). */
  ink2: string;
  /**
   * Lamplight amber — the brand light, identical in both modes. Large-text and
   * UI elements ONLY (held to AA 3:1 vs grounds, not 4.5:1): never body text.
   * Use `bodyTextColors` for anything prose-sized.
   */
  accent: string;
  /** Text on `accent` (button labels on amber). AA 4.5:1 vs accent. */
  accentInk: string;
  /**
   * Decorative hairline (card borders, dividers). Contrast-exempt by design —
   * it never carries text and no AA assertion covers it.
   */
  line: string;
}

/** Day — "storybook": warm parchment ground, sepia-charcoal ink. */
const day: Palette = {
  bg: "#F3E8D2",
  surface: "#FBF4E4",
  ink: "#3E3325",
  ink2: "#6C5C46",
  accent: "#A16207",
  accentInk: "#FFFBEF",
  line: "#DACBAB",
};

/** Night — "read-aloud": deep indigo ground, cream ink, same amber lamp-glow. */
const night: Palette = {
  bg: "#131A31",
  surface: "#1B2340",
  ink: "#E7DCC3",
  ink2: "#A89D83",
  accent: "#A16207",
  accentInk: "#FFFBEF",
  line: "#2E3A5C",
};

export const palettes: Record<ThemeMode, Palette> = { day, night };

/**
 * The only tokens legal for body/prose text. `accent` is deliberately absent
 * (large-text/UI-only), as is decorative `line` — enforced by contract test.
 */
export const bodyTextColors = ["ink", "ink2"] as const satisfies readonly (keyof Palette)[];

/**
 * Type tokens — the full prototype-confirmed scale (ui-direction.md appendix).
 * Alegreya superfamily only (loaded via `@expo-google-fonts` + `expo-font`;
 * family names follow that package's convention). RN conventions: `fontSize`/
 * `lineHeight` in absolute units (body: 1.6 × 19 = 30.4; display: 1.15 × 27 =
 * 31.05) and `letterSpacing` in units, so em tracking is `em × fontSize`.
 */
export const typography = {
  /** Read-aloud body prose. */
  body: {
    fontFamily: "Alegreya_400Regular",
    fontSize: 19,
    lineHeight: 30.4,
  },
  /** Display — arc titles, headers. */
  display: {
    fontFamily: "Alegreya_800ExtraBold",
    fontSize: 27,
    lineHeight: 31.05,
  },
  /**
   * Raised cap opening the first prose paragraph. The appendix's floated 3.3em
   * drop cap is not expressible in RN Text, so the recorded RN deviation ships
   * instead: the display face at 30px/34, colored `accent` at the call site
   * (30px ≥ the 24px large-text threshold, so the 3:1 exemption holds).
   */
  dropCap: {
    fontFamily: "Alegreya_800ExtraBold",
    fontSize: 30,
    lineHeight: 34,
  },
  /** Spine/stage line under the title ("Page four · virtue tested"). */
  spineStage: {
    fontFamily: "AlegreyaSC_500Medium",
    fontSize: 13.5,
    letterSpacing: 0.81, // .06em
  },
  /** Chrome — button labels (small caps). */
  button: {
    fontFamily: "AlegreyaSC_700Bold",
    fontSize: 15,
    letterSpacing: 0.6, // .04em
  },
  /** Chrome — the ‹ back link. */
  backLink: {
    fontFamily: "AlegreyaSC_500Medium",
    fontSize: 15,
  },
  /** Chrome — the top-bar world name (small caps, wide-tracked). */
  worldName: {
    fontFamily: "AlegreyaSC_700Bold",
    fontSize: 14,
    letterSpacing: 1.12, // .08em
  },
  /** Chrome numerals — the page count ("4 / 8"), tabular figures. */
  pageCount: {
    fontFamily: "AlegreyaSans_500Medium",
    fontSize: 14,
    fontVariant: ["tabular-nums"],
  },
  /** Entity name on a tile caption. */
  entityName: {
    fontFamily: "Alegreya_500Medium",
    fontSize: 14.5,
  },
  /** Entity name in the full-screen art caption. */
  entityNameArt: {
    fontFamily: "Alegreya_500Medium",
    fontSize: 24,
  },
  /** Entity role on a tile caption (small caps). */
  entityRole: {
    fontFamily: "AlegreyaSC_500Medium",
    fontSize: 11.5,
    letterSpacing: 0.575, // .05em
  },
  /** Entity role in the full-screen art caption. */
  entityRoleArt: {
    fontFamily: "AlegreyaSC_500Medium",
    fontSize: 14,
  },
} satisfies Record<string, TextStyle>;
