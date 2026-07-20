import React from "react";
import TestRenderer, { act, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NavProvider, useNav, type NavState } from "../nav/NavContext";
import { ThemeProvider } from "../theme/ThemeContext";
import { palettes, typography, type ThemeMode } from "../theme/tokens";
import LibraryScreen from "./LibraryScreen";
import StorytimeVignette from "../components/StorytimeVignette";
import { setBlobFs, store } from "../storage/store";
import type { BlobFs } from "../storage/blobStore";
import { sampleWorld } from "../storage/testFixtures";

/**
 * Library — #5 build-order slice 4, restyled to the locked direction
 * (docs/design/ui-direction.md + prototype-confirmed appendix), preserving the
 * existing bookshelf behavior:
 *
 * - "Your Bookshelf" header in display type on the bg ground + lamp wash;
 * - one surface card per saved story (hairline `line` border, radius 14),
 *   a labelled >=44pt button that re-opens the story;
 * - cover art on a 2:1 plate (radius 8) with the hand-placed alternating
 *   counter-rotations down the shelf;
 * - the EMPTY shelf is a composition (§1/§5): StorytimeVignette motif plus a
 *   warm parent-facing invitation — the motif steps aside once stories exist;
 * - ＋ New Story is the single accent pill (accent = primary action only);
 * - errors read warm on a surface — never dev-speak red;
 * - reader-facing copy never says "beat" (accessibility labels included);
 * - both palettes via ThemeContext — zero hardcoded color/font in the screen;
 * - dynamic type stays bounded (maxFontSizeMultiplier) on every text.
 */

type Node = TestRenderer.ReactTestInstance;

const fakeFs: BlobFs = {
  documentDirectory: "file:///doc/",
  async ensureDir() {},
  async writeBytes() {},
  async readBytes() {
    return new Uint8Array();
  },
  async exists() {
    return true;
  },
};

function isHost(type: unknown, tag: string) {
  return type === tag;
}

/** Every host-text string rendered anywhere under the tree, concatenated. */
function allText(node: Node): string {
  const parts: string[] = [];
  for (const t of node.findAll((n) => isHost(n.type, "rn-text"))) {
    const collect = (c: unknown) => {
      if (typeof c === "string" || typeof c === "number") parts.push(String(c));
      else if (Array.isArray(c)) c.forEach(collect);
    };
    collect(t.props.children);
  }
  return parts.join(" ");
}

/** A tappable Pressable whose visible label contains `label` (most specific). */
function pressableByLabel(root: ReactTestRenderer, label: string): Node | undefined {
  const hits = root.root.findAll(
    (n) => isHost(n.type, "rn-pressable") && allText(n).includes(label),
  );
  return hits.sort((a, b) => a.findAll(() => true).length - b.findAll(() => true).length)[0];
}

function byA11yLabel(root: ReactTestRenderer, label: string): Node[] {
  return root.root.findAll((n) => n.props?.accessibilityLabel === label);
}

/** All accessibilityLabel strings anywhere in the tree. */
function allLabels(root: ReactTestRenderer): string[] {
  return root.root
    .findAll((n) => typeof n.props?.accessibilityLabel === "string")
    .map((n) => n.props.accessibilityLabel as string);
}

/** Flattened RN style (arrays merged left-to-right, falsy entries dropped). */
function flat(style: unknown): Record<string, unknown> {
  if (!style) return {};
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flat));
  return style as Record<string, unknown>;
}

/** The 2:1 cover plates — the visual body of every shelved story card. */
function coverPlates(root: ReactTestRenderer): Node[] {
  return root.root.findAll((n) => isHost(n.type, "rn-view") && flat(n.props.style).aspectRatio === 2);
}

let navState: NavState | undefined;
function NavProbe() {
  navState = useNav().state;
  return null;
}

/** Two shelved stories, newest first: Brackenford (new) above Willowmere (old). */
async function seedShelf() {
  await store.saveWorld(
    sampleWorld({ id: "w-old", name: "Willowmere", createdAt: "2026-07-01T00:00:00.000Z" }),
  );
  await store.saveWorld(
    sampleWorld({ id: "w-new", name: "Brackenford", createdAt: "2026-07-15T00:00:00.000Z" }),
  );
}

async function mountShelf(mode: ThemeMode = "day"): Promise<ReactTestRenderer> {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = TestRenderer.create(
      <ThemeProvider mode={mode}>
        <NavProvider>
          <NavProbe />
          <LibraryScreen />
        </NavProvider>
      </ThemeProvider>,
    );
  });
  return root;
}

// Reset the module-singleton InMemoryStore between tests so each run is isolated.
const bag = store as unknown as { worlds: Map<string, unknown>; arcs: Map<string, unknown> };

beforeEach(() => {
  bag.worlds.clear();
  bag.arcs.clear();
  navState = undefined;
  setBlobFs(fakeFs);
});
afterEach(() => {
  setBlobFs(undefined);
  vi.restoreAllMocks();
});

describe("Library header", () => {
  it("'Your Bookshelf' is a display-type header in ink", async () => {
    const root = await mountShelf();
    const title = root.root
      .findAll((n) => isHost(n.type, "rn-text") && allText(n).includes("Your Bookshelf"))
      .find((n) => n.props.accessibilityRole === "header");
    expect(title).toBeTruthy();
    const s = flat(title!.props.style);
    expect(s.fontFamily).toBe(typography.display.fontFamily);
    expect(s.fontSize).toBe(typography.display.fontSize);
    expect(s.color).toBe(palettes.day.ink);
  });

  it("keeps the keeper line, set in the supporting ink", async () => {
    const root = await mountShelf();
    const sub = root.root.find(
      (n) => isHost(n.type, "rn-text") && allText(n).includes("kept safe on this device"),
    );
    expect(flat(sub.props.style).color).toBe(palettes.day.ink2);
  });
});

describe("Library ground + lamp wash", () => {
  it("day: the screen ground is the day bg", async () => {
    await seedShelf();
    const root = await mountShelf("day");
    const grounds = root.root.findAll(
      (n) => isHost(n.type, "rn-view") && flat(n.props.style).backgroundColor === palettes.day.bg,
    );
    expect(grounds.length).toBeGreaterThanOrEqual(1);
  });

  it("a decorative accent lamp wash glows from the top (no touches, whisper opacity)", async () => {
    await seedShelf();
    const root = await mountShelf();
    const wash = root.root.findAll((n) => {
      if (!isHost(n.type, "rn-view")) return false;
      const s = flat(n.props.style);
      return s.backgroundColor === palettes.day.accent && (s.opacity as number) <= 0.1;
    });
    expect(wash).toHaveLength(1);
    expect(wash[0].props.pointerEvents).toBe("none");
  });
});

describe("Library shelf cards", () => {
  it("each saved story sits on a surface card with a hairline border and radius 14", async () => {
    await seedShelf();
    const root = await mountShelf();
    const cards = root.root.findAll((n) => {
      if (!isHost(n.type, "rn-pressable")) return false;
      const s = flat(n.props.style);
      return s.backgroundColor === palettes.day.surface && s.borderRadius === 14;
    });
    expect(cards).toHaveLength(2);
    for (const card of cards) {
      const s = flat(card.props.style);
      expect(s.borderColor).toBe(palettes.day.line);
      expect(s.borderWidth).toBe(1);
    }
  });

  it("story cards are labelled buttons with >=44pt targets", async () => {
    await seedShelf();
    const root = await mountShelf();
    for (const name of ["Brackenford", "Willowmere"]) {
      const hits = byA11yLabel(root, `Open ${name}`);
      expect(hits).toHaveLength(1);
      expect(hits[0].props.accessibilityRole).toBe("button");
      expect(flat(hits[0].props.style).minHeight as number).toBeGreaterThanOrEqual(44);
    }
  });

  it("story titles are set in the Alegreya scale, ink on surface", async () => {
    await seedShelf();
    const root = await mountShelf();
    const title = root.root.find(
      (n) => isHost(n.type, "rn-text") && allText(n) === "Willowmere",
    );
    const s = flat(title.props.style);
    expect(s.fontFamily).toBe(typography.entityNameArt.fontFamily);
    expect(s.color).toBe(palettes.day.ink);
  });

  it("cover art renders on a 2:1 plate, radius 8, hairline border — no dead label on the art", async () => {
    await seedShelf();
    const root = await mountShelf();
    const plates = coverPlates(root);
    expect(plates).toHaveLength(2);
    for (const plate of plates) {
      const s = flat(plate.props.style);
      expect(s.borderRadius).toBe(8);
      expect(s.borderColor).toBe(palettes.day.line);
    }
    const images = root.root.findAll((n) => isHost(n.type, "rn-image"));
    expect(images.map((n) => n.props.source?.uri)).toContain("file:///doc/blobs/hero-1.png");
    // The card Pressable's label is the one voiced — the art stays quiet.
    for (const img of images) {
      expect(img.props.accessibilityLabel).toBeUndefined();
    }
  });

  it("shelf art leans hand-placed: alternating counter-rotations down the shelf", async () => {
    await seedShelf();
    const root = await mountShelf();
    const rotations = coverPlates(root).map((n) => {
      const t = flat(n.props.style).transform as Array<{ rotate?: string }> | undefined;
      return t?.find((x) => x.rotate)?.rotate;
    });
    expect(rotations).toEqual(["-0.7deg", "0.5deg"]);
  });
});

describe("Library empty shelf — storytime composition (§1/§5)", () => {
  it("no stories yet: the motif vignette plus a warm read-aloud invitation", async () => {
    const root = await mountShelf();
    expect(root.root.findAllByType(StorytimeVignette)).toHaveLength(1);
    const invite = root.root.find(
      (n) => isHost(n.type, "rn-text") && allText(n).includes("No tales on the shelf yet"),
    );
    const s = flat(invite.props.style);
    expect(s.fontFamily).toBe(typography.body.fontFamily);
    expect(s.color).toBe(palettes.day.ink);
    expect(invite.props.maxFontSizeMultiplier as number).toBeLessThanOrEqual(1.6);
  });

  it("the motif belongs to the empty state — a stocked shelf shows the stories instead", async () => {
    await seedShelf();
    const root = await mountShelf();
    expect(root.root.findAllByType(StorytimeVignette)).toHaveLength(0);
  });
});

describe("Library primary action", () => {
  it("＋ New Story is the accent pill with a >=44pt target and accentInk label", async () => {
    await seedShelf();
    const root = await mountShelf();
    const cta = pressableByLabel(root, "New Story")!;
    expect(cta).toBeTruthy();
    expect(cta.props.accessibilityRole).toBe("button");
    const s = flat(cta.props.style);
    expect(s.backgroundColor).toBe(palettes.day.accent);
    expect(s.borderRadius).toBe(999);
    expect(s.minHeight as number).toBeGreaterThanOrEqual(44);
    const label = cta.findAll((n) => isHost(n.type, "rn-text"))[0];
    const ts = flat(label.props.style);
    expect(ts.fontFamily).toBe(typography.button.fontFamily);
    expect(ts.color).toBe(palettes.day.accentInk);
  });

  it("accent grounds the primary action ONLY — story cards stay on the surface", async () => {
    await seedShelf();
    const root = await mountShelf();
    const accentPressables = root.root.findAll(
      (n) =>
        isHost(n.type, "rn-pressable") &&
        flat(n.props.style).backgroundColor === palettes.day.accent,
    );
    expect(accentPressables).toHaveLength(1);
    expect(allText(accentPressables[0])).toContain("New Story");
  });
});

describe("Library warm errors", () => {
  it("a failed shelf load reads warm on a surface — never dev-speak red", async () => {
    vi.spyOn(store, "listWorldSummaries").mockRejectedValue(new Error("db locked"));
    const root = await mountShelf();
    const err = root.root.find(
      (n) => isHost(n.type, "rn-text") && allText(n).includes("Couldn't load your bookshelf"),
    );
    const s = flat(err.props.style);
    expect(s.color).toBe(palettes.day.ink);
    expect(s.backgroundColor).toBe(palettes.day.surface);
    expect(s.borderColor).toBe(palettes.day.line);
  });
});

describe("Library copy rule — story language, never 'beat'", () => {
  it("no reader-facing text or accessibility label says 'beat'", async () => {
    await seedShelf();
    const root = await mountShelf();
    for (const s of [allText(root.root), ...allLabels(root)]) {
      expect(s).not.toMatch(/\bbeats?\b/i);
    }
  });
});

describe("Library palettes — day and night, tokens only", () => {
  it("night: ground, surface and ink all flip; no day-only value leaks in", async () => {
    await seedShelf();
    const root = await mountShelf("night");
    const styles = root.root.findAll((n) => Boolean(n.props?.style)).map((n) => flat(n.props.style));
    const values = styles.flatMap((s) => Object.values(s));
    expect(values).toContain(palettes.night.bg);
    expect(values).toContain(palettes.night.surface);
    expect(values).toContain(palettes.night.ink);
    for (const dayOnly of [palettes.day.bg, palettes.day.surface, palettes.day.ink, palettes.day.ink2, palettes.day.line]) {
      expect(values).not.toContain(dayOnly);
    }
  });
});

describe("Library dynamic type", () => {
  it("every text bounds its font scaling (maxFontSizeMultiplier)", async () => {
    await seedShelf();
    const root = await mountShelf();
    const texts = root.root.findAll((n) => isHost(n.type, "rn-text"));
    expect(texts.length).toBeGreaterThan(0);
    for (const t of texts) {
      expect(typeof t.props.maxFontSizeMultiplier).toBe("number");
      expect(t.props.maxFontSizeMultiplier as number).toBeLessThanOrEqual(1.6);
    }
  });
});
