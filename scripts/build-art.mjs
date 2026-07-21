/**
 * Art pipeline — derives every shipped PNG from the committed masters.
 *
 * Run: `npm run art:build` (root). Masters live in `art/` — deliberately outside
 * `app/`, so a full-resolution source can never be swept into the app bundle.
 * The derived outputs land in `app/assets/` and are ALSO committed, so EAS/CI
 * builds never need `sharp`. Re-run after touching a master, commit both sides.
 *
 * Direction + decisions: `docs/design/art-brief.md`, `docs/design/ui-direction.md`.
 *
 * The one non-obvious step is ground normalization. The masters were generated
 * in ChatGPT and their grounds drift from the design tokens (the day plate is
 * visibly golden against `#F3E8D2`). Re-prompting was rejected — the day/night
 * pair must stay the *same drawing* — so the correction happens here, in code:
 *
 * - `replaceFlatGround` (icon): the icon ground is a single flat field, so
 *   pixels near it are recoloured directly with a feathered edge. The line art,
 *   the cream hands and the amber star are never touched.
 * - `regradeGround` (scenes): the scene grounds are lit gradients, so a flat
 *   replace would band. Instead the whole panel is regraded in HSV by the
 *   hue/sat/value delta that maps its border mean onto the token hex, masked by
 *   saturation so the amber lamp and star keep their chroma.
 */
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MASTERS = join(ROOT, "art");
const OUT = join(ROOT, "app", "assets");

/** Token grounds every derived asset is normalized onto (`app/src/theme/tokens.ts`). */
const GROUND = { day: "#F3E8D2", night: "#131A31" };

/** Android masks adaptive icons to a circle 66.7% of the canvas. */
const SAFE_FRACTION = 2 / 3;
/**
 * Scale of the full icon plate inside the adaptive foreground. Measured, not
 * guessed: art first crosses the safe circle at 0.76, so 0.72 keeps the star's
 * top point clear with margin while staying as large as the mask allows.
 */
const ADAPTIVE_SCALE = 0.72;

// ---------------------------------------------------------------- colour utils

const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgbToHex = (r, g, b) =>
  "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0").toUpperCase()).join("");
const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max === 0 ? 0 : d / max, max];
}

function hsvToRgb(h, s, v) {
  h = ((h % 360) + 360) % 360;
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [clamp255((r + m) * 255), clamp255((g + m) * 255), clamp255((b + m) * 255)];
}

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------- pixel access

async function readRaw(path) {
  const { data, info } = await sharp(path).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/**
 * Shipped assets are palette-quantized: these are pencil textures and flat line
 * art, so 256 dithered colours are visually indistinguishable from truecolour
 * here and roughly halve what lands in the app bundle. The masters in `art/`
 * stay lossless — they're the source, and they never ship.
 */
const toPng = ({ data, width, height }) =>
  sharp(data, { raw: { width, height, channels: 3 } }).png({
    palette: true,
    colours: 256,
    effort: 10,
    compressionLevel: 9,
  });

/** Mean colour of an `inset`-wide frame around the edge — the ground reference. */
export function borderMean({ data, width, height }, inset = 12) {
  let r = 0, g = 0, b = 0, n = 0;
  const sample = (x, y) => {
    const i = (y * width + x) * 3;
    r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
  };
  for (let y = 0; y < height; y++)
    for (let x = 0; x < inset; x++) { sample(x, y); sample(width - 1 - x, y); }
  for (let x = 0; x < width; x++)
    for (let y = 0; y < inset; y++) { sample(x, y); sample(x, height - 1 - y); }
  return [r / n, g / n, b / n];
}

// ------------------------------------------------------------- normalizations

/**
 * Recolour a flat ground onto `targetHex`, feathering so anti-aliased art edges
 * don't get a halo. Only pixels within `hard`/`soft` RGB distance of the sampled
 * ground move; everything else is copied through untouched.
 */
function replaceFlatGround(img, targetHex, { hard = 26, soft = 58 } = {}) {
  const { data, width, height } = img;
  const src = borderMean(img, 6);
  const tgt = hexToRgb(targetHex);
  const delta = [tgt[0] - src[0], tgt[1] - src[1], tgt[2] - src[2]];
  const out = Buffer.from(data);
  for (let i = 0; i < out.length; i += 3) {
    const d = Math.hypot(out[i] - src[0], out[i + 1] - src[1], out[i + 2] - src[2]);
    const w = 1 - smoothstep(hard, soft, d);
    if (w <= 0) continue;
    out[i] = clamp255(out[i] + delta[0] * w);
    out[i + 1] = clamp255(out[i + 1] + delta[1] * w);
    out[i + 2] = clamp255(out[i + 2] + delta[2] * w);
  }
  return { data: out, width, height };
}

/** Shortest angular distance between two hues, in degrees. */
const hueGap = (a, b) => {
  const d = Math.abs(((a - b) % 360) + 360) % 360;
  return d > 180 ? 360 - d : d;
};

/**
 * Weight functions deciding how much of the regrade each pixel receives. Both
 * exist to spare the amber lamp and star, but they key off different things
 * because the two panels differ:
 *
 * - The night ground is a saturated navy, ~180° of hue away from the amber, so
 *   hue alone separates them cleanly.
 * - The day ground shares the amber's hue (~39°). Saturation separates paper
 *   (~0.39) from amber (~0.7) — but it does NOT separate paper from the pencil
 *   drawing, which is rendered in that same warm family. Correcting on
 *   saturation alone therefore greys out the whole panel. Value is the missing
 *   axis: the paper is the brightest thing in the frame, so gating on value too
 *   lifts the paper toward parchment and leaves the drawing warm.
 */
const protectByHue = ({ centre, inner, outer }) => (h) =>
  1 - smoothstep(inner, outer, hueGap(h, centre));
const protectByPaper = ({ satLo, satHi, valLo, valHi }) => (h, s, v) =>
  (1 - smoothstep(satLo, satHi, s)) * smoothstep(valLo, valHi, v);

/**
 * Regrade a lit ground onto `targetHex` in HSV. The hue/saturation/value delta
 * that maps the border mean onto the target is applied to every pixel, scaled by
 * `protect` so the brand amber keeps its chroma.
 *
 * `strength` below 1 deliberately under-corrects. Landing the ground exactly on
 * the token hex costs more warmth than the residual drift does — the day panel
 * is graded to sit *beside* `#F3E8D2` convincingly, not to measure as it.
 */
function regradeGround(img, targetHex, { protect, strength = 1 }) {
  const { data, width, height } = img;
  const src = rgbToHsv(...borderMean(img, 12));
  const tgt = rgbToHsv(...hexToRgb(targetHex));
  const hueShift = (tgt[0] - src[0]) * strength;
  const satGain = src[1] === 0 ? 1 : 1 + (tgt[1] / src[1] - 1) * strength;
  const valGain = src[2] === 0 ? 1 : 1 + (tgt[2] / src[2] - 1) * strength;
  const out = Buffer.from(data);
  for (let i = 0; i < out.length; i += 3) {
    const [h, s, v] = rgbToHsv(out[i], out[i + 1], out[i + 2]);
    const w = protect(h, s, v);
    if (w <= 0) continue;
    const [r, g, b] = hsvToRgb(
      h + hueShift * w,
      Math.min(1, s * (1 + (satGain - 1) * w)),
      Math.min(1, v * (1 + (valGain - 1) * w)),
    );
    out[i] = r; out[i + 1] = g; out[i + 2] = b;
  }
  return { data: out, width, height };
}

// ------------------------------------------------------------------ safe zone

/**
 * Share of art pixels (anything not within `tol` of the ground) that fall
 * outside Android's circular mask. The adaptive foreground must score 0.
 */
export function safeCircleOverflow(img, { tol = 30 } = {}) {
  const { data, width, height } = img;
  const g = borderMean(img, 6);
  const cx = width / 2, cy = height / 2, r = (width * SAFE_FRACTION) / 2;
  let art = 0, outside = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      if (Math.hypot(data[i] - g[0], data[i + 1] - g[1], data[i + 2] - g[2]) < tol) continue;
      art++;
      if (Math.hypot(x - cx, y - cy) > r) outside++;
    }
  }
  return art === 0 ? 0 : outside / art;
}

// ---------------------------------------------------------------------- build

async function buildIcon() {
  const master = join(MASTERS, "icon-master.png");
  const icon = replaceFlatGround(await readRaw(master), GROUND.night);
  await toPng(icon).toFile(join(OUT, "icon.png"));

  // Adaptive foreground: the whole normalized plate, shrunk onto a flat field of
  // the same hex. Because the plate's own ground is already that hex the inset
  // is invisible, and the star's top point clears the circular mask.
  const size = icon.width;
  const inner = Math.round(size * ADAPTIVE_SCALE);
  const plate = await toPng(icon).resize(inner, inner).toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 3, background: GROUND.night },
  })
    .composite([{ input: plate, top: Math.round((size - inner) / 2), left: Math.round((size - inner) / 2) }])
    .png({ palette: true, colours: 256, effort: 10, compressionLevel: 9 })
    .toFile(join(OUT, "adaptive-icon.png"));

  return icon;
}

/**
 * The day/night reading plates. These are NOT the splash — Android 12+ masks the
 * splash image to a ~192dp circle, which a 3:4 scene cannot survive, so the
 * splash uses the mask-safe medallion instead (`adaptive-icon.png`). The plates
 * are the in-app vignette art: the Viewer header band and the empty Library.
 */
async function buildScenes() {
  const master = join(MASTERS, "scene-diptych.png");
  // The diptych's panels butt at exactly x=768, with x=767 a blended seam pixel.
  // Crop clear of it on both sides, then square each panel back up to 3:4.
  const panel = async (left) =>
    readRaw(
      await sharp(master)
        .extract({ left, top: 0, width: 767, height: 1024 })
        .resize(768, 1024)
        .png()
        .toBuffer(),
    );

  const night = regradeGround(await panel(0), GROUND.night, {
    protect: protectByHue({
      centre: rgbToHsv(...hexToRgb(GROUND.night))[0],
      inner: 55,
      outer: 85,
    }),
  });
  const day = regradeGround(await panel(769), GROUND.day, {
    protect: protectByPaper({ satLo: 0.46, satHi: 0.66, valLo: 0.55, valHi: 0.85 }),
    strength: 0.8,
  });
  await toPng(night).toFile(join(OUT, "scene-night.png"));
  await toPng(day).toFile(join(OUT, "scene-day.png"));
  return { night, day };
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const icon = await buildIcon();
  const { night, day } = await buildScenes();

  const adaptive = await readRaw(join(OUT, "adaptive-icon.png"));
  // Tolerances mirror `app/src/theme/artAssets.contract.test.ts` — the scenes are
  // deliberately under-corrected, so "on target" means within tolerance, not equal.
  const report = [
    ["icon.png", borderMean(icon, 6), GROUND.night, 3],
    ["adaptive-icon.png", borderMean(adaptive, 6), GROUND.night, 1],
    ["scene-night.png", borderMean(night, 12), GROUND.night, 8],
    ["scene-day.png", borderMean(day, 12), GROUND.day, 20],
  ];
  for (const [name, got, want, tol] of report) {
    const wantRgb = hexToRgb(want);
    const delta = Math.max(...got.map((v, i) => Math.abs(v - wantRgb[i])));
    console.log(
      `${name.padEnd(20)} ground ${rgbToHex(...got)}  target ${want}` +
        `  Δ${delta.toFixed(1)}/${tol}  ${delta <= tol ? "ok" : "OUT OF TOLERANCE"}`,
    );
  }
  console.log(
    `adaptive-icon.png    art outside safe circle: ${(safeCircleOverflow(adaptive) * 100).toFixed(2)}%`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
