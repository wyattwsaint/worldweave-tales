/**
 * One-shot art-thesis validation: generate 3 pencil-sketch hero-card variants
 * against the REAL Recraft API and save the images to disk for eyeballing.
 * (Recraft returns WebP, so each file is named by its magic-byte format.)
 *
 * Run from the proxy/ dir:  npx tsx scripts/generate-hero-card.mts
 * Requires proxy/.env with RECRAFT_API_KEY set (billed, ~a few cents).
 */
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Recraft returns WebP (RIFF/WEBP), not PNG — pick the file extension from the
 * bytes' magic number so saved samples aren't mislabeled. Falls back to ".img".
 */
function extFromBytes(b: Buffer): string {
  if (b.length >= 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") return ".webp";
  if (b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return ".png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return ".jpeg";
  if (b.length >= 4 && b.toString("ascii", 0, 3) === "GIF") return ".gif";
  return ".img";
}

// Load proxy/.env BEFORE importing config (which reads process.env at module eval).
try {
  process.loadEnvFile(new URL("../.env", import.meta.url));
} catch {
  console.error("No proxy/.env found. Create it with RECRAFT_API_KEY=… first.");
  process.exit(1);
}

const { RecraftImageProvider } = await import("../src/providers/imageProvider.js");
const { config } = await import("../src/config.js");

if (!config.recraft.apiKey) {
  console.error("No RECRAFT_API_KEY in proxy/.env — aborting before any billed call.");
  process.exit(1);
}

// Hardcoded hero appearanceNote — a David-the-shepherd-boy figure fits the
// explicitly-Christian identity. Written as a single-entity card portrait (how a
// card ships: ONE subject, plain background, no scenery to become ambiguous blobs).
const HERO_APPEARANCE =
  "Full-body character portrait of a brave young shepherd boy, about ten years " +
  "old, with tousled dark hair, a simple woolen tunic and a shepherd's sling at " +
  "his belt, holding a wooden staff, calm and resolute expression. Centered " +
  "figure on a plain soft neutral background, no scenery.";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "art-samples");
await mkdir(outDir, { recursive: true });

const provider = new RecraftImageProvider();

// Optional CLI args: [providerStyleRef] [count]. Style ref e.g.
// "sub:digital_illustration/crosshatch"; falls back to the world's locked
// default. A short label (slug) keeps sample files from clobbering.
const styleArg = process.argv[2];
const providerStyleRef =
  styleArg ??
  (await provider.ensureStyle({ presetId: "pencil-mvp", displayName: "Imaginative Pencil Sketch" }))
    .providerStyleRef;
const label = (styleArg ?? "default").replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 30);
console.log(`Locking style: ${providerStyleRef}  (label: ${label})`);

const count = Number(process.argv[3] ?? 3);
if (!Number.isInteger(count) || count < 1 || count > 6) {
  console.error(`Invalid count "${process.argv[3]}" — Recraft allows n = 1..6.`);
  process.exit(1);
}
console.log(`Generating ${count} hero-card variant(s) via Recraft (billed)…`);
const { imageRefs } = await provider.generateCardVariants({
  providerStyleRef,
  prompt: HERO_APPEARANCE,
  count,
});

console.log(`Got ${imageRefs.length} image URL(s). Downloading…`);
const saved: string[] = [];
for (let i = 0; i < imageRefs.length; i++) {
  const url = imageRefs[i];
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Download failed for variant ${i}: ${resp.status}`);
  const bytes = Buffer.from(await resp.arrayBuffer());
  const file = join(outDir, `hero-${label}-${i + 1}${extFromBytes(bytes)}`);
  await writeFile(file, bytes);
  saved.push(file);
  console.log(`  saved ${file} (${bytes.length} bytes)`);
}

console.log("\nDone. Open these to judge the pencil-sketch look:");
for (const f of saved) console.log(`  ${f}`);
