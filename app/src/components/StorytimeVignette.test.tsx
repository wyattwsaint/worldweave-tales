import React from "react";
import TestRenderer, { act, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it } from "vitest";
import { ThemeProvider } from "../theme/ThemeContext";
import StorytimeVignette, { BAND_CROP, PLATE } from "./StorytimeVignette";

/**
 * The storytime motif, now the REAL pencil-sketch plate (art-brief.md; the
 * ui-direction.md amendment of 2026-07-20). One drawing, two footprints:
 *
 * - `band` — the Viewer header bookplate, locked at 141×96. A 3:4 portrait
 *   cannot be squeezed into a 1.47:1 band without either letterboxing it or
 *   crushing the faces, so the band is a CROP: the plate is scaled to the
 *   band's width and clipped to the reading window (faces + book + star).
 * - `plate` — the empty shelf, the full 768×1024 portrait.
 *
 * Both follow the theme: the day and night plates are the same drawing lit
 * differently, so the motif never sits on the wrong ground. Decorative in both
 * footprints — hidden from screen readers, never touchable.
 */

type Node = TestRenderer.ReactTestInstance;

function flat(style: unknown): Record<string, unknown> {
  if (!style) return {};
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flat));
  return style as Record<string, unknown>;
}

async function mount(node: React.ReactElement): Promise<ReactTestRenderer> {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = TestRenderer.create(node);
  });
  return root;
}

function image(root: ReactTestRenderer): Node {
  const images = root.root.findAll((n) => (n.type as unknown) === "rn-image");
  expect(images).toHaveLength(1);
  return images[0];
}

const inTheme = (mode: "day" | "night", node: React.ReactElement) => (
  <ThemeProvider mode={mode}>{node}</ThemeProvider>
);

describe("StorytimeVignette — the real plate", () => {
  // Metro hands the component a numeric asset handle; under vitest the same
  // import resolves to the asset's URL — either way the assertion is "this
  // rendered the plate that file actually is".
  const plateName = (node: Node) => String(node.props.source).split("/").pop();

  it("day renders the day plate; night renders the night plate", async () => {
    const day = await mount(inTheme("day", <StorytimeVignette />));
    expect(plateName(image(day))).toBe("scene-day.png");

    const night = await mount(inTheme("night", <StorytimeVignette />));
    expect(plateName(image(night))).toBe("scene-night.png");
  });

  it("is decorative: hidden from screen readers in both footprints", async () => {
    for (const variant of ["band", "plate"] as const) {
      const root = await mount(inTheme("day", <StorytimeVignette variant={variant} />));
      const frame = root.root.findAll(
        (n) => (n.type as unknown) === "rn-view" && n.props.accessibilityElementsHidden === true,
      );
      expect(frame.length).toBeGreaterThanOrEqual(1);
      expect(frame[0].props.importantForAccessibility).toBe("no-hide-descendants");
      expect(frame[0].props.pointerEvents).toBe("none");
    }
  });
});

describe("StorytimeVignette — band (Viewer header)", () => {
  it("keeps the locked 141×96 footprint and clips to it", async () => {
    const root = await mount(inTheme("day", <StorytimeVignette />));
    const frame = flat(
      root.root.findAll((n) => (n.type as unknown) === "rn-view")[0].props.style,
    );
    expect(frame.width).toBe(141);
    expect(frame.height).toBe(96);
    expect(frame.overflow).toBe("hidden");
  });

  it("scales and offsets the plate so the band shows exactly the locked crop", async () => {
    const root = await mount(inTheme("day", <StorytimeVignette />));
    const s = flat(image(root).props.style);
    // The crop rectangle is expressed in source pixels; the rendered image is
    // whatever size makes that rectangle fill 141×96, shifted so it lands there.
    const scale = 141 / BAND_CROP.width;
    expect(s.width).toBeCloseTo(PLATE.width * scale, 2);
    expect(s.height).toBeCloseTo(PLATE.height * scale, 2);
    expect(s.left).toBeCloseTo(-BAND_CROP.x * scale, 2);
    expect(s.top).toBeCloseTo(-BAND_CROP.y * scale, 2);
    // …and the crop is EXACTLY the band's aspect — approximately-right clips a
    // hairline off the bottom of the band, which shows as a seam.
    expect(BAND_CROP.width / BAND_CROP.height).toBe(141 / 96);
    expect(BAND_CROP.height * scale).toBe(96);
  });

  it("crops within the plate — no empty edge dragged into the band", async () => {
    expect(BAND_CROP.x).toBeGreaterThanOrEqual(0);
    expect(BAND_CROP.y).toBeGreaterThanOrEqual(0);
    expect(BAND_CROP.x + BAND_CROP.width).toBeLessThanOrEqual(PLATE.width);
    expect(BAND_CROP.y + BAND_CROP.height).toBeLessThanOrEqual(PLATE.height);
  });
});

describe("StorytimeVignette — plate (empty shelf)", () => {
  it("renders the whole portrait at the plate's own aspect, uncropped", async () => {
    const root = await mount(inTheme("night", <StorytimeVignette variant="plate" />));
    const s = flat(image(root).props.style);
    expect(s.aspectRatio).toBeCloseTo(PLATE.width / PLATE.height, 3);
    expect(s.width).toBe("100%");
    expect(image(root).props.resizeMode).toBe("contain");
  });

  it("is capped so a tablet's empty shelf shows a plate, not a poster", async () => {
    const root = await mount(inTheme("day", <StorytimeVignette variant="plate" />));
    const cap = flat(image(root).props.style).maxWidth as number;
    expect(cap).toBeLessThanOrEqual(320);
    // …and still large enough on a phone to read as the scene it is.
    expect(cap).toBeGreaterThanOrEqual(220);
  });
});
