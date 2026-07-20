/**
 * Design tokens — the single source of truth for color + type (#5 UI overhaul).
 *
 * Direction: `docs/design/ui-direction.md` (locked 2026-07-19). Hexes are the
 * AA-verified values from the prototype session; the contract tests
 * (`tokens.contract.test.ts`) enforce the invariants (identical key sets across
 * modes, WCAG AA for every text/ground pair) rather than pinning each hex —
 * tune values only if the contract still holds.
 *
 * Both palettes are first-class from day one; components never hardcode either
 * (a ThemeContext resolves day/night via the system scheme in a later slice).
 */

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
 * Type tokens. Alegreya superfamily only (loaded via `@expo-google-fonts` +
 * `expo-font` in the screen slice; family names follow that package's
 * convention). RN convention: `fontSize`/`lineHeight` in absolute units —
 * body line height is 1.6 × 19 = 30.4.
 */
export const typography = {
  /** Read-aloud body prose. */
  body: {
    fontFamily: "Alegreya_400Regular",
    fontSize: 19,
    lineHeight: 30.4,
  },
} as const;
