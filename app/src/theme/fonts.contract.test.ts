import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { appFonts } from "./fonts";
import { typography } from "./tokens";

/**
 * Font wiring contract (#5 follow-up) — the token scale names families
 * (`Alegreya_400Regular`, …) that mean nothing until `expo-font` has actually
 * loaded a file under that exact name. Three ways that silently breaks, one
 * assertion each:
 *
 * 1. A token cites a family the app never loads → RN falls back to the system
 *    face and the whole "premium storybook" direction quietly evaporates.
 * 2. The app loads a family nothing uses → dead weight in the bundle.
 * 3. A family name is a typo — or the vitest stub of `@expo-google-fonts/*`
 *    drifts from the real packages. Checked against the INSTALLED packages'
 *    type declarations, so this test still bites under the stub.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** Distinct `fontFamily` values across the whole token scale. */
const tokenFamilies = [
  ...new Set(
    Object.values(typography)
      .map((t) => (t as { fontFamily?: string }).fontFamily)
      .filter((f): f is string => typeof f === "string"),
  ),
].sort();

/** `@expo-google-fonts/<pkg>` for a family name (the packages split by family). */
function packageFor(family: string): string {
  if (family.startsWith("AlegreyaSC_")) return "alegreya-sc";
  if (family.startsWith("AlegreyaSans_")) return "alegreya-sans";
  return "alegreya";
}

describe("font wiring contract", () => {
  it("loads a font for every family the token scale names", () => {
    expect(tokenFamilies.length).toBeGreaterThan(0);
    for (const family of tokenFamilies) {
      expect(Object.keys(appFonts)).toContain(family);
    }
  });

  it("loads nothing the token scale does not name", () => {
    expect(Object.keys(appFonts).sort()).toEqual(tokenFamilies);
  });

  it("maps every family to its OWN asset — no weight pointing at another's file", () => {
    const handles = Object.values(appFonts);
    for (const handle of handles) expect(handle).toBeDefined();
    // A copy-paste that loads Regular twice is invisible on screen until a bold
    // heading renders in book weight; distinct handles catch it here.
    expect(new Set(handles).size).toBe(handles.length);
  });

  it("names only families the installed @expo-google-fonts packages export", () => {
    for (const family of tokenFamilies) {
      const decl = readFileSync(
        join(ROOT, "node_modules", "@expo-google-fonts", packageFor(family), "index.d.ts"),
        "utf8",
      );
      expect(decl).toContain(`export const ${family}:`);
    }
  });
});
