import React from "react";
import TestRenderer, { act, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NavProvider } from "../nav/NavContext";
import { ThemeProvider } from "../theme/ThemeContext";
import { palettes, typography, type ThemeMode } from "../theme/tokens";
import { expectPressedFeedback, flat } from "../../test/pressedFeedback";
import WorldScreen from "./WorldScreen";
import { setBlobFs, store } from "../storage/store";
import type { BlobFs } from "../storage/blobStore";
import { sampleArc, sampleWorld } from "../storage/testFixtures";

/**
 * World screen (#10) held to the locked direction (docs/design/ui-direction.md +
 * prototype-confirmed appendix), the same bar as the other four screens:
 *
 * - the world's name in display type on the bg ground under the lamp wash;
 * - one surface card per tale (hairline `line` border, radius 14), each a
 *   labelled >=44pt button that re-opens it;
 * - cover art on a 2:1 plate (radius 8), hand-placed counter-rotation;
 * - ＋ Weave a new tale is the SINGLE accent pill (accent = primary only);
 * - the way home is a quiet ghost link, never an accent competitor;
 * - errors read warm on a surface — never dev-speak red;
 * - reader-facing copy never says "beat" or "arc" (labels included);
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

function pressableByLabel(root: ReactTestRenderer, label: string): Node | undefined {
  const hits = root.root.findAll(
    (n) => isHost(n.type, "rn-pressable") && allText(n).includes(label),
  );
  return hits.sort((a, b) => a.findAll(() => true).length - b.findAll(() => true).length)[0];
}

function allLabels(root: ReactTestRenderer): string[] {
  return root.root
    .findAll((n) => typeof n.props?.accessibilityLabel === "string")
    .map((n) => n.props.accessibilityLabel as string);
}

async function mountWorld(mode: ThemeMode = "day"): Promise<ReactTestRenderer> {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = TestRenderer.create(
      <ThemeProvider mode={mode}>
        <NavProvider>
          <WorldScreen params={{ worldId: "world-willowmere" }} />
        </NavProvider>
      </ThemeProvider>,
    );
  });
  return root;
}

async function seedWorld() {
  await store.saveWorld(sampleWorld());
  await store.saveArc(sampleArc());
}

const bag = store as unknown as { worlds: Map<string, unknown>; arcs: Map<string, unknown> };

beforeEach(() => {
  bag.worlds.clear();
  bag.arcs.clear();
  setBlobFs(fakeFs);
});
afterEach(() => {
  setBlobFs(undefined);
  vi.restoreAllMocks();
});

describe("World header + ground", () => {
  it("the world's name is a display-type header in ink", async () => {
    await seedWorld();
    const root = await mountWorld();
    const title = root.root
      .findAll((n) => isHost(n.type, "rn-text") && allText(n).includes("Willowmere"))
      .find((n) => n.props.accessibilityRole === "header");
    expect(title).toBeTruthy();
    const s = flat(title!.props.style);
    expect(s.fontFamily).toBe(typography.display.fontFamily);
    expect(s.color).toBe(palettes.day.ink);
  });

  it("night: the ground and the copy come from the night palette (no hardcoded values)", async () => {
    await seedWorld();
    const root = await mountWorld("night");
    const screen = root.root.findAll((n) => isHost(n.type, "rn-view"))[0];
    expect(flat(screen.props.style).backgroundColor).toBe(palettes.night.bg);
  });

  it("a decorative accent lamp wash glows from the top, untouchable and whisper-quiet", async () => {
    await seedWorld();
    const root = await mountWorld();
    const wash = root.root.find((n) => {
      if (!isHost(n.type, "rn-view")) return false;
      const s = flat(n.props.style);
      return s.backgroundColor === palettes.day.accent && (s.opacity as number) < 0.2;
    });
    expect(wash.props.pointerEvents).toBe("none");
  });

  it("cover art rides a 2:1 plate at radius 8, leaning hand-placed", async () => {
    await seedWorld();
    const root = await mountWorld();
    const plate = root.root.find((n) => isHost(n.type, "rn-view") && flat(n.props.style).aspectRatio === 2);
    const s = flat(plate.props.style);
    expect(s.borderRadius).toBe(8);
    expect(s.borderColor).toBe(palettes.day.line);
    expect(s.transform).toBeTruthy();
  });
});

describe("World tales list", () => {
  it("each tale sits on a surface card and is a >=44pt labelled button", async () => {
    await seedWorld();
    const root = await mountWorld();
    const tale = pressableByLabel(root, "courage")!;
    expect(tale.props.accessibilityRole).toBe("button");
    const s = flat(tale.props.style);
    expect(s.backgroundColor).toBe(palettes.day.surface);
    expect(s.borderColor).toBe(palettes.day.line);
    expect(s.borderRadius).toBe(14);
    expect(s.minHeight as number).toBeGreaterThanOrEqual(44);
  });

  it("voices what the card shows: the tale's name AND when it was woven", async () => {
    await seedWorld();
    const root = await mountWorld();
    expect(allLabels(root)).toContain("Re-read courage, woven July 18, 2026");
  });

  it("reader-facing copy never leaks the internal words 'beat' or 'arc'", async () => {
    await seedWorld();
    const root = await mountWorld();
    const spoken = [allText(root.root), ...allLabels(root)].join(" ").toLowerCase();
    expect(spoken).not.toContain("beat");
    expect(spoken).not.toMatch(/\barc\b/);
  });

  it("every text bounds dynamic type", async () => {
    await seedWorld();
    const root = await mountWorld();
    const texts = root.root.findAll((n) => isHost(n.type, "rn-text"));
    expect(texts.length).toBeGreaterThan(0);
    for (const t of texts) expect(t.props.maxFontSizeMultiplier).toBeTruthy();
  });
});

describe("World primary action + escape", () => {
  it("＋ Weave a new tale is the accent pill with an accentInk label", async () => {
    await seedWorld();
    const root = await mountWorld();
    const cta = pressableByLabel(root, "Weave a new tale")!;
    const s = flat(cta.props.style);
    expect(s.backgroundColor).toBe(palettes.day.accent);
    expect(s.borderRadius).toBe(999);
    expect(s.minHeight as number).toBeGreaterThanOrEqual(44);
    const label = cta.findAll((n) => isHost(n.type, "rn-text"))[0];
    expect(flat(label.props.style).color).toBe(palettes.day.accentInk);
  });

  it("accent grounds that ONE action — tales and the way home stay quiet", async () => {
    await seedWorld();
    const root = await mountWorld();
    const accented = root.root.findAll(
      (n) => isHost(n.type, "rn-pressable") && flat(n.props.style).backgroundColor === palettes.day.accent,
    );
    expect(accented).toHaveLength(1);
    expect(allText(accented[0])).toContain("Weave a new tale");
    // The way home is a ghost link: no ground of its own, supporting ink.
    const shelf = pressableByLabel(root, "‹ Shelf")!;
    expect(flat(shelf.props.style).backgroundColor).toBeUndefined();
    const shelfLabel = shelf.findAll((n) => isHost(n.type, "rn-text"))[0];
    expect(flat(shelfLabel.props.style).color).toBe(palettes.day.ink2);
  });

  it("every control dims under the finger (§5)", async () => {
    await seedWorld();
    const root = await mountWorld();
    const controls = root.root.findAll(
      (n) => isHost(n.type, "rn-pressable") && n.props.accessibilityRole === "button",
    );
    expect(controls).toHaveLength(3); // ‹ Shelf + the one tale + the CTA
    for (const c of controls) expectPressedFeedback(c);
  });
});

describe("World failure + loading states", () => {
  it("a failed open reads warm on a surface — never dev-speak red", async () => {
    const root = await mountWorld(); // nothing seeded
    const error = root.root
      .findAll((n) => isHost(n.type, "rn-text"))
      .find((n) => allText(n).includes("Couldn't open that world"))!;
    const s = flat(error.props.style);
    expect(s.color).toBe(palettes.day.ink);
    expect(s.backgroundColor).toBe(palettes.day.surface);
    expect(allText(root.root)).not.toContain("Error");
  });

  it("while the world loads, a skeleton card holds the space", async () => {
    vi.spyOn(store, "getWorld").mockReturnValue(new Promise(() => {}));
    const root = await mountWorld();
    const bones = root.root.findAll((n) => {
      if (!isHost(n.type, "rn-view")) return false;
      const s = flat(n.props.style);
      return s.backgroundColor === palettes.day.line && s.borderRadius === 6;
    });
    expect(bones.length).toBeGreaterThan(0);
  });
});
