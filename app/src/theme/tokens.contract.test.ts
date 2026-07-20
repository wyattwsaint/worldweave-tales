import { describe, it, expect } from "vitest";
import {
  palettes,
  bodyTextColors,
  typography,
  type Palette,
  type ThemeMode,
} from "./tokens.js";

/**
 * Tokens contract tests (ui-direction.md §8.1, red-first, pure TS).
 *
 * The palettes' hexes were locked in the 2026-07-19 prototype session; these
 * tests don't pin every hex — they enforce the *invariants* those hexes must
 * keep satisfying if anyone tunes them:
 *
 * - both modes expose an identical token key set;
 * - WCAG AA computed programmatically for every text/ground pair in both modes;
 * - `accent` is large-text/UI-only (AA 3:1 vs grounds) and is deliberately
 *   NOT a body-text color — encoded by its exclusion from `bodyTextColors`;
 * - `line` is decorative (hairlines/dividers, never text) and is therefore
 *   contrast-exempt: no contrast assertion covers it, and it must not appear
 *   in `bodyTextColors` either.
 */

const MODES: ThemeMode[] = ["day", "night"];
const TOKEN_KEYS: (keyof Palette)[] = [
  "bg",
  "surface",
  "ink",
  "ink2",
  "accent",
  "accentInk",
  "line",
];

// ---- WCAG 2.x contrast math (https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio)

function srgbChannel(hexPair: string): number {
  const c = parseInt(hexPair, 16) / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const h = hex.replace("#", "");
  return (
    0.2126 * srgbChannel(h.slice(0, 2)) +
    0.7152 * srgbChannel(h.slice(2, 4)) +
    0.0722 * srgbChannel(h.slice(4, 6))
  );
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("palette shape", () => {
  it("exposes exactly the contract's token keys, identically in both modes", () => {
    for (const mode of MODES) {
      expect(Object.keys(palettes[mode]).sort()).toEqual([...TOKEN_KEYS].sort());
    }
  });

  it("every token is a #RRGGBB hex", () => {
    for (const mode of MODES) {
      for (const key of TOKEN_KEYS) {
        expect(palettes[mode][key]).toMatch(/^#[0-9A-F]{6}$/i);
      }
    }
  });

  it("the amber accent is the same light in both modes (brand = the lamplight)", () => {
    expect(palettes.day.accent).toBe(palettes.night.accent);
    expect(palettes.day.accentInk).toBe(palettes.night.accentInk);
  });
});

describe("WCAG AA — text/ground pairs (both modes)", () => {
  for (const mode of MODES) {
    describe(mode, () => {
      const p = palettes[mode];

      it("every body-text color reads on bg AND surface at >= 4.5:1", () => {
        for (const token of bodyTextColors) {
          expect(contrast(p[token], p.bg)).toBeGreaterThanOrEqual(4.5);
          expect(contrast(p[token], p.surface)).toBeGreaterThanOrEqual(4.5);
        }
      });

      it("accentInk on accent (button text on amber) >= 4.5:1", () => {
        expect(contrast(p.accentInk, p.accent)).toBeGreaterThanOrEqual(4.5);
      });

      it("accent on bg AND surface >= 3:1 (large-text/UI threshold)", () => {
        expect(contrast(p.accent, p.bg)).toBeGreaterThanOrEqual(3);
        expect(contrast(p.accent, p.surface)).toBeGreaterThanOrEqual(3);
      });
    });
  }
});

describe("token roles", () => {
  it("accent is NOT a body-text color (large-text/UI-only — 3:1, not 4.5:1)", () => {
    expect(bodyTextColors).not.toContain("accent");
    expect(bodyTextColors).not.toContain("accentInk");
  });

  it("line is decorative (contrast-exempt) — never offered as a text color", () => {
    expect(bodyTextColors).not.toContain("line");
  });

  it("body text colors are exactly the inks", () => {
    expect([...bodyTextColors].sort()).toEqual(["ink", "ink2"]);
  });
});

describe("body prose type (read-aloud)", () => {
  it("is Alegreya at 19px", () => {
    expect(typography.body.fontFamily).toMatch(/^Alegreya/);
    expect(typography.body.fontSize).toBe(19);
  });

  it("line height is 1.6x the font size (RN convention: absolute units)", () => {
    expect(typography.body.lineHeight).toBeCloseTo(typography.body.fontSize! * 1.6, 5);
  });
});

describe("type scale (ui-direction.md appendix, prototype-confirmed)", () => {
  it("display (arc title): Alegreya ExtraBold 27px, 1.15 line-height", () => {
    expect(typography.display.fontFamily).toBe("Alegreya_800ExtraBold");
    expect(typography.display.fontSize).toBe(27);
    expect(typography.display.lineHeight).toBeCloseTo(27 * 1.15, 5);
  });

  it("spine/stage line: Alegreya SC 500 at 13.5px, .06em tracking", () => {
    expect(typography.spineStage.fontFamily).toBe("AlegreyaSC_500Medium");
    expect(typography.spineStage.fontSize).toBe(13.5);
    expect(typography.spineStage.letterSpacing).toBeCloseTo(13.5 * 0.06, 5);
  });

  it("chrome — buttons: Alegreya SC 700 at 15px, .04em tracking", () => {
    expect(typography.button.fontFamily).toBe("AlegreyaSC_700Bold");
    expect(typography.button.fontSize).toBe(15);
    expect(typography.button.letterSpacing).toBeCloseTo(15 * 0.04, 5);
  });

  it("chrome — back link: Alegreya SC 500 at 15px", () => {
    expect(typography.backLink.fontFamily).toBe("AlegreyaSC_500Medium");
    expect(typography.backLink.fontSize).toBe(15);
  });

  it("chrome — world name: Alegreya SC 700 at 14px, .08em tracking", () => {
    expect(typography.worldName.fontFamily).toBe("AlegreyaSC_700Bold");
    expect(typography.worldName.fontSize).toBe(14);
    expect(typography.worldName.letterSpacing).toBeCloseTo(14 * 0.08, 5);
  });

  it("chrome — page-count numerals: Alegreya Sans 500 at 14px, tabular figures", () => {
    expect(typography.pageCount.fontFamily).toBe("AlegreyaSans_500Medium");
    expect(typography.pageCount.fontSize).toBe(14);
    expect(typography.pageCount.fontVariant).toContain("tabular-nums");
  });

  it("entity name: Alegreya Medium 14.5px tile / 24px art caption", () => {
    expect(typography.entityName.fontFamily).toBe("Alegreya_500Medium");
    expect(typography.entityName.fontSize).toBe(14.5);
    expect(typography.entityNameArt.fontFamily).toBe("Alegreya_500Medium");
    expect(typography.entityNameArt.fontSize).toBe(24);
  });

  it("entity role: Alegreya SC 500 11.5px/.05em tile / 14px art caption", () => {
    expect(typography.entityRole.fontFamily).toBe("AlegreyaSC_500Medium");
    expect(typography.entityRole.fontSize).toBe(11.5);
    expect(typography.entityRole.letterSpacing).toBeCloseTo(11.5 * 0.05, 5);
    expect(typography.entityRoleArt.fontFamily).toBe("AlegreyaSC_500Medium");
    expect(typography.entityRoleArt.fontSize).toBe(14);
  });
});
