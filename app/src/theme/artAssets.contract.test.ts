/**
 * Art asset contract (#6) — the shipped icon/splash PNGs and the `app.json` that
 * points at them, pinned against the design tokens.
 *
 * The assets are *derived*: `npm run art:build` (root) regenerates them from the
 * masters in `app/assets/masters/`. Both sides are committed so EAS builds never
 * need `sharp`, which means the two can silently drift — these tests are the
 * tripwire for that. If one fails after an art change, re-run the pipeline
 * rather than editing the expectation.
 *
 * The two assertions that earn their keep:
 *
 * 1. **Safe-zone occupancy.** Android masks adaptive icons to a circle 66.7% of
 *    the canvas. On a raw full-bleed foreground this severs the star's top
 *    point — the whole reason `adaptive-icon.png` insets the plate.
 * 2. **Ground agreement.** Every plate's ground has to sit convincingly beside
 *    the token it will be composited against, or the splash shows a seam where
 *    `contain` letterboxes the art.
 *
 * Visual quality itself stays a named TDD carve-out (`ui-direction.md` §8) —
 * verified by design review, not here.
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { palettes } from "./tokens";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const asset = (name: string) => join(APP, "assets", name);

/** Mean colour of a frame `inset` px wide around the edge — the ground reference. */
async function borderMean(path: string, inset: number): Promise<[number, number, number]> {
  const { data, info } = await sharp(path)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  const at = (x: number, y: number) => {
    const i = (y * info.width + x) * 3;
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    n++;
  };
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < inset; x++) {
      at(x, y);
      at(info.width - 1 - x, y);
    }
  for (let x = 0; x < info.width; x++)
    for (let y = 0; y < inset; y++) {
      at(x, y);
      at(x, info.height - 1 - y);
    }
  return [r / n, g / n, b / n];
}

const hexToRgb = (h: string): [number, number, number] =>
  [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];

const channelDelta = (a: [number, number, number], b: [number, number, number]) =>
  Math.max(...a.map((v, i) => Math.abs(v - b[i])));

const appJson = JSON.parse(await readFile(join(APP, "app.json"), "utf8")).expo;

/** Resolve an `app.json` asset path ("./assets/x.png") to disk. */
const resolveAsset = (p: string) => join(APP, p.replace(/^\.\//, ""));

describe("art assets", () => {
  it.each([
    ["icon.png", 1024, 1024],
    ["adaptive-icon.png", 1024, 1024],
    ["scene-day.png", 768, 1024],
    ["scene-night.png", 768, 1024],
  ])("%s exists at %i×%i", async (name, width, height) => {
    expect(existsSync(asset(name)), `${name} missing — run \`npm run art:build\``).toBe(true);
    const meta = await sharp(asset(name)).metadata();
    expect([meta.width, meta.height]).toEqual([width, height]);
  });

  // The masters live outside `app/` so they can never be swept into the bundle,
  // but they still have to exist for `npm run art:build` to be re-runnable.
  it.each([
    ["icon-master.png", 1024, 1024],
    ["scene-diptych.png", 1536, 1024],
  ])("master %s exists at %i×%i", async (name, width, height) => {
    const path = join(APP, "..", "art", name);
    expect(existsSync(path), `art/${name} missing`).toBe(true);
    const meta = await sharp(path).metadata();
    expect([meta.width, meta.height]).toEqual([width, height]);
  });

  // Android applies this same circular mask twice: to the launcher icon, and to
  // the splash image (a 288dp canvas with only the inner ~192dp visible). That
  // is why `adaptive-icon.png` is BOTH the launcher foreground and the splash
  // image — one mask-safe plate, verified once.
  it("keeps every art pixel of the adaptive foreground inside Android's 66.7% mask", async () => {
    const { data, info } = await sharp(asset("adaptive-icon.png"))
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const ground = hexToRgb(palettes.night.bg);
    const cx = info.width / 2;
    const cy = info.height / 2;
    const radius = (info.width * (2 / 3)) / 2;
    let art = 0;
    let outside = 0;
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const i = (y * info.width + x) * 3;
        const d = Math.hypot(
          data[i] - ground[0],
          data[i + 1] - ground[1],
          data[i + 2] - ground[2],
        );
        if (d < 30) continue;
        art++;
        if (Math.hypot(x - cx, y - cy) > radius) outside++;
      }
    }
    expect(art).toBeGreaterThan(0);
    expect(outside / art).toBe(0);
  });

  // Tolerances differ because the corrections differ: the icon ground is a flat
  // field that can be recoloured outright, while the scene grounds are lit
  // gradients that are deliberately under-corrected to keep the art warm
  // (see `regradeGround` in scripts/build-art.mjs).
  it.each([
    ["icon.png", "night", 6, 3],
    ["adaptive-icon.png", "night", 6, 1],
    ["scene-night.png", "night", 12, 8],
    ["scene-day.png", "day", 12, 20],
  ] as const)("%s ground sits within %i of the %s token", async (name, mode, inset, tol) => {
    const got = await borderMean(asset(name), inset);
    expect(channelDelta(got, hexToRgb(palettes[mode].bg))).toBeLessThanOrEqual(tol);
  });
});

describe("app.json wiring", () => {
  it("points every icon/splash key at a file that exists", () => {
    const splash = appJson.plugins.find(
      (p: unknown) => Array.isArray(p) && p[0] === "expo-splash-screen",
    )?.[1];
    const paths = [appJson.icon, appJson.android.adaptiveIcon.foregroundImage, splash?.image];
    for (const p of paths) {
      expect(typeof p, `expected an asset path, got ${p}`).toBe("string");
      expect(existsSync(resolveAsset(p)), `${p} missing`).toBe(true);
    }
  });

  // The regression guard for the defect `expo prebuild` caught: pointing the
  // splash at a scene plate looks fine everywhere except Android 12+, which
  // circle-crops it. Only the medallion is safe, and only below the 288dp canvas.
  it("uses the mask-safe medallion as the splash image, sized within the canvas", () => {
    const splash = appJson.plugins.find(
      (p: unknown) => Array.isArray(p) && p[0] === "expo-splash-screen",
    )?.[1];
    expect(splash.image).toBe("./assets/adaptive-icon.png");
    expect(splash.imageWidth).toBeLessThanOrEqual(288);
  });

  it("declares every ground colour as the exact token hex", () => {
    const splash = appJson.plugins.find(
      (p: unknown) => Array.isArray(p) && p[0] === "expo-splash-screen",
    )?.[1];
    expect(appJson.android.adaptiveIcon.backgroundColor).toBe(palettes.night.bg);
    expect(splash?.backgroundColor).toBe(palettes.day.bg);
    expect(splash?.dark?.backgroundColor).toBe(palettes.night.bg);
  });
});
