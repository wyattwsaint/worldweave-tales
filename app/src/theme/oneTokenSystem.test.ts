import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * One-token-system tripwire (ui-direction.md §8.3): a static scan of the
 * screen/component sources that fails on raw hex color literals or
 * `fontFamily:` strings outside `theme/`. Colors come from the ThemeContext
 * palette and type from `typography` — nothing else.
 *
 * `LEGACY` lists the screens the #5 rebuild has not reached yet (build order
 * §6: Viewer → CardPick → Library → Wizard). Each rebuild slice MUST remove
 * its screen from this list — the list only ever shrinks.
 */

const LEGACY = new Set(["LibraryScreen.tsx", "WizardScreen.tsx"]);

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCANNED_DIRS = ["screens", "components"];

/**
 * #RGB / #RGBA / #RRGGBB / #RRGGBBAA hex literals (not e.g. `stub-image:hero#0`)
 * plus rgb()/rgba()/hsl()/hsla() function syntax.
 */
const RAW_COLOR = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b|\b(?:rgba?|hsla?)\s*\(/;
/**
 * Named colors, cheaply: any color-valued style prop fed a string literal
 * (`color: "tomato"`, `shadowColor: 'grey'`). `"transparent"` is the one legal
 * literal — it names the absence of a color, not a color.
 */
const NAMED_COLOR = /(?:\bcolor|Color)\s*:\s*["'](?!transparent["'])/;
const FONT_FAMILY = /fontFamily\s*:/;

/** Recursive: subdirectories added under a scanned dir can never escape. */
function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const files = SCANNED_DIRS.flatMap((d) => sourceFiles(join(SRC, d))).filter(
  (f) => !LEGACY.has(f.split(/[\\/]/).pop()!),
);

describe("one token system (screens/components carry no raw styles)", () => {
  it("scans the rebuilt Viewer (the tripwire must never be vacuous)", () => {
    expect(files.map((f) => f.split(/[\\/]/).pop())).toContain("ViewerScreen.tsx");
  });

  for (const file of files) {
    const name = file.split(/[\\/]/).pop();

    it(`${name}: no raw color literals (hex, rgb()/hsl(), or named)`, () => {
      const offending = readFileSync(file, "utf8")
        .split("\n")
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(({ line }) => RAW_COLOR.test(line) || NAMED_COLOR.test(line));
      expect(offending).toEqual([]);
    });

    it(`${name}: no fontFamily outside theme/`, () => {
      const offending = readFileSync(file, "utf8")
        .split("\n")
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(({ line }) => FONT_FAMILY.test(line));
      expect(offending).toEqual([]);
    });
  }
});
