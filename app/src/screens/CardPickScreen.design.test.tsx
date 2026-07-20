import React from "react";
import TestRenderer, { act, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Arc, GenerateArcResponse, StoryBible, WizardAnswers } from "@wwt/domain";
import { NavProvider, useNav, type CardPickParams, type NavState } from "../nav/NavContext";
import { ThemeProvider } from "../theme/ThemeContext";
import { palettes, typography, type ThemeMode } from "../theme/tokens";
import CardPickScreen from "./CardPickScreen";
import { setBlobFs } from "../storage/store";
import type { BlobFs } from "../storage/blobStore";

/**
 * Card-Pick — #5 build-order slice 3, restyled to the locked direction
 * (docs/design/ui-direction.md + prototype-confirmed appendix), preserving the
 * existing pick/confirm behavior:
 *
 * - "Pick the Art" header in display type on the bg ground;
 * - one surface card per pending role (hairline `line` border, radius 14);
 * - variant look tiles: 2:1 art, radius 8, hand-placed counter-rotations on
 *   the row's ends; labelled buttons with >=44pt targets + selected state;
 *   rows wrap (minWidth per look) so extra variants never shrink the targets;
 * - the chosen look carries an accent edge and an accent "Chosen" pill;
 *   selection recolors a constant-width border (no layout jump on tap);
 * - confirm: enabled is the accent pill; the gated state is a quiet readable
 *   pill (surface ground, hairline `line` border, full-opacity ink2 copy);
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

/** The 2:1 art plates — the visual body of every variant look tile. */
function artPlates(root: ReactTestRenderer): Node[] {
  return root.root.findAll((n) => isHost(n.type, "rn-view") && flat(n.props.style).aspectRatio === 2);
}

let navState: NavState | undefined;
function NavProbe() {
  navState = useNav().state;
  return null;
}

const bible: StoryBible = {
  entitySheets: [],
  eventLog: [],
  worldState: [],
  openThreads: [],
  virtuesTaught: ["courage"],
};

const arc: Arc = {
  id: "arc-1",
  worldId: "w1",
  tier: "beginner",
  ageBand: "preschool",
  shape: "quest",
  teachingPoint: { kind: "virtue", virtue: "courage" },
  closingVerseEnabled: false,
  beats: [{ spineBeat: "setup", text: "Once upon a time.", dealtCardIds: ["hero-e", "villain-e"] }],
  createdAt: "2026-01-01T00:00:00.000Z",
};

/** Two pending roles: hero (three looks, one a stub) and villain (two looks). */
function cardPickParams(): CardPickParams {
  const response: GenerateArcResponse = {
    arc,
    newCanonCards: [],
    pendingCardChoices: [
      {
        entityId: "hero-e",
        role: "hero",
        appearanceNote: "a tiny mouse in a red cloak",
        variantImageRefs: ["https://cdn/hero-a.png", "https://cdn/hero-b.png", "stub-image:hero#2"],
      },
      {
        entityId: "villain-e",
        role: "villain",
        appearanceNote: "a drifting shadow",
        variantImageRefs: ["https://cdn/villain-a.png", "stub-image:villain#1"],
      },
    ],
    bible,
  };
  const answers: WizardAnswers = {
    tier: "beginner",
    ageBand: "preschool",
    teachingPoint: { kind: "virtue", virtue: "courage" },
    closingVerseEnabled: false,
    choices: { hero: "Pip", villain: "Gloom" },
  };
  return { response, answers };
}

async function mountCardPick(
  mode: ThemeMode = "day",
  params: CardPickParams = cardPickParams(),
): Promise<ReactTestRenderer> {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = TestRenderer.create(
      <ThemeProvider mode={mode}>
        <NavProvider>
          <NavProbe />
          <CardPickScreen params={params} />
        </NavProvider>
      </ThemeProvider>,
    );
  });
  return root;
}

async function press(node: Node | undefined) {
  expect(node).toBeTruthy();
  await act(async () => {
    node!.props.onPress();
  });
}

beforeEach(() => {
  setBlobFs(fakeFs);
  navState = undefined;
});
afterEach(() => {
  setBlobFs(undefined);
});

describe("CardPick header", () => {
  it("'Pick the Art' is a display-type header in ink", async () => {
    const root = await mountCardPick();
    const title = root.root
      .findAll((n) => isHost(n.type, "rn-text") && allText(n).includes("Pick the Art"))
      .find((n) => n.props.accessibilityRole === "header");
    expect(title).toBeTruthy();
    const s = flat(title!.props.style);
    expect(s.fontFamily).toBe(typography.display.fontFamily);
    expect(s.fontSize).toBe(typography.display.fontSize);
    expect(s.color).toBe(palettes.day.ink);
  });

  it("keeps the guidance line, set in the supporting ink", async () => {
    const root = await mountCardPick();
    const sub = root.root.find(
      (n) => isHost(n.type, "rn-text") && allText(n).includes("Tap one look for each character"),
    );
    expect(flat(sub.props.style).color).toBe(palettes.day.ink2);
  });
});

describe("CardPick choice cards", () => {
  it("each pending role sits on a surface card with a hairline border and radius 14", async () => {
    const root = await mountCardPick();
    const cards = root.root.findAll((n) => {
      if (!isHost(n.type, "rn-view")) return false;
      const s = flat(n.props.style);
      return s.backgroundColor === palettes.day.surface && s.borderRadius === 14;
    });
    expect(cards).toHaveLength(2);
    for (const card of cards) {
      expect(flat(card.props.style).borderColor).toBe(palettes.day.line);
      expect(flat(card.props.style).borderWidth).toBe(1);
    }
  });

  it("names both roles", async () => {
    const root = await mountCardPick();
    const text = allText(root.root);
    expect(text).toContain("hero");
    expect(text).toContain("villain");
  });
});

describe("CardPick variant look tiles", () => {
  it("every look is a 2:1 art plate with radius 8 on a hairline border", async () => {
    const root = await mountCardPick();
    const plates = artPlates(root);
    expect(plates).toHaveLength(5); // three hero looks + two villain looks
    for (const plate of plates) {
      const s = flat(plate.props.style);
      expect(s.borderRadius).toBe(8);
      expect(s.borderColor).toBe(palettes.day.line);
      // Same width as the selected state — selection must not move layout.
      expect(s.borderWidth).toBe(2);
    }
  });

  it("row ends counter-rotate slightly for the hand-placed feel", async () => {
    const root = await mountCardPick();
    const rotations = artPlates(root).map((n) => {
      const t = flat(n.props.style).transform as Array<{ rotate?: string }> | undefined;
      return t?.find((x) => x.rotate)?.rotate;
    });
    // Both rows lean their first look left and their last look right.
    expect(rotations.filter((r) => r === "-0.7deg")).toHaveLength(2);
    expect(rotations.filter((r) => r === "0.5deg")).toHaveLength(2);
  });

  it("tiles are labelled buttons with >=44pt touch targets", async () => {
    const root = await mountCardPick();
    const heroOne = byA11yLabel(root, "Pick look one of three for the hero");
    expect(heroOne).toHaveLength(1);
    expect(heroOne[0].props.accessibilityRole).toBe("button");
    expect(flat(heroOne[0].props.style).minHeight as number).toBeGreaterThanOrEqual(44);
    expect(byA11yLabel(root, "Pick look two of two for the villain")).toHaveLength(1);
  });

  it("a real look renders as art; a stub keeps the visible placeholder ref", async () => {
    const root = await mountCardPick();
    const images = root.root.findAll((n) => isHost(n.type, "rn-image"));
    expect(images.map((n) => n.props.source?.uri)).toContain("https://cdn/hero-a.png");
    // No dead label on the art: the parent Pressable's label is the one voiced.
    for (const img of images) {
      expect(img.props.accessibilityLabel).toBeUndefined();
    }
    expect(allText(root.root)).toContain("stub-image:hero#2");
  });

  it("six looks wrap instead of shrinking: minWidth per look, flexWrap on the row", async () => {
    const params = cardPickParams();
    params.response.pendingCardChoices = [
      {
        entityId: "hero-e",
        role: "hero",
        appearanceNote: "a tiny mouse in a red cloak",
        variantImageRefs: [
          "https://cdn/hero-a.png",
          "https://cdn/hero-b.png",
          "https://cdn/hero-c.png",
          "https://cdn/hero-d.png",
          "https://cdn/hero-e.png",
          "https://cdn/hero-f.png",
        ],
      },
    ];
    const root = await mountCardPick("day", params);
    const looks = root.root.findAll(
      (n) =>
        isHost(n.type, "rn-pressable") &&
        typeof n.props.accessibilityLabel === "string" &&
        n.props.accessibilityLabel.startsWith("Pick look"),
    );
    expect(looks).toHaveLength(6);
    // 140pt keeps every 2:1 plate >=70pt tall — comfortably over the 44pt floor.
    for (const look of looks) {
      expect(flat(look.props.style).minWidth as number).toBeGreaterThanOrEqual(140);
    }
    const rows = root.root.findAll(
      (n) => isHost(n.type, "rn-view") && flat(n.props.style).flexDirection === "row",
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
    for (const row of rows) {
      expect(flat(row.props.style).flexWrap).toBe("wrap");
    }
  });
});

describe("CardPick selection", () => {
  it("tapping a look selects it: state, accent edge, and a Chosen mark", async () => {
    const root = await mountCardPick();
    await press(byA11yLabel(root, "Pick look one of three for the hero")[0]);

    const tile = byA11yLabel(root, "Pick look one of three for the hero")[0];
    expect(tile.props.accessibilityState?.selected).toBe(true);
    const plate = tile.findAll((n) => isHost(n.type, "rn-view") && flat(n.props.style).aspectRatio === 2)[0];
    expect(flat(plate.props.style).borderColor).toBe(palettes.day.accent);
    // Selection only recolors the border — width stays 2, so no 1px jump on tap.
    expect(flat(plate.props.style).borderWidth).toBe(2);
    expect(allText(tile)).toContain("Chosen");
  });

  it("a role holds one pick — choosing another look moves it", async () => {
    const root = await mountCardPick();
    await press(byA11yLabel(root, "Pick look one of three for the hero")[0]);
    await press(byA11yLabel(root, "Pick look two of three for the hero")[0]);

    expect(byA11yLabel(root, "Pick look one of three for the hero")[0].props.accessibilityState?.selected).toBe(false);
    expect(byA11yLabel(root, "Pick look two of three for the hero")[0].props.accessibilityState?.selected).toBe(true);
    expect(allText(root.root).match(/Chosen/g)).toHaveLength(1);
  });
});

describe("CardPick confirm", () => {
  it("stays gated until every role has a pick — a quiet readable pill, not a dimmed accent", async () => {
    const root = await mountCardPick();
    expect(pressableByLabel(root, "Weave the tale")).toBeUndefined();
    const gate = pressableByLabel(root, "Pick every look to continue")!;
    expect(gate).toBeTruthy();
    expect(gate.props.disabled).toBe(true);
    expect(gate.props.accessibilityState?.disabled).toBe(true);
    expect(gate.props.accessibilityRole).toBe("button");
    const s = flat(gate.props.style);
    // Quiet state: surface ground + hairline `line` border, never the dimmed
    // accent pill (accent at opacity 0.4 read ~1.8:1 in day mode).
    expect(s.backgroundColor).toBe(palettes.day.surface);
    expect(s.borderColor).toBe(palettes.day.line);
    expect(s.opacity).toBeUndefined();
    expect(s.borderRadius).toBe(999);
    expect(s.minHeight as number).toBeGreaterThanOrEqual(44);
    // The only copy explaining the gate reads at full contrast: ink2, no dim.
    const label = gate.findAll((n) => isHost(n.type, "rn-text"))[0];
    const ts = flat(label.props.style);
    expect(ts.color).toBe(palettes.day.ink2);
    expect(ts.color).not.toBe(palettes.day.accentInk);
    expect(ts.opacity).toBeUndefined();
  });

  it("with every look picked, Weave the tale canonizes and opens the Viewer", async () => {
    const root = await mountCardPick();
    await press(byA11yLabel(root, "Pick look one of three for the hero")[0]);
    await press(byA11yLabel(root, "Pick look one of two for the villain")[0]);

    const weave = pressableByLabel(root, "Weave the tale")!;
    expect(weave.props.disabled).toBe(false);
    expect(flat(weave.props.style).backgroundColor).toBe(palettes.day.accent);
    await press(weave);

    expect(navState?.screen).toBe("viewer");
    const { params } = navState as Extract<NavState, { screen: "viewer" }>;
    const hero = params.cards.find((c) => c.entityId === "hero-e");
    const villain = params.cards.find((c) => c.entityId === "villain-e");
    expect(hero?.canonName).toBe("Pip");
    expect(hero?.lockedImageRef).toBe("https://cdn/hero-a.png");
    expect(hero?.canonizedAt).toBeTruthy();
    expect(villain?.canonName).toBe("Gloom");
    expect(villain?.lockedImageRef).toBe("https://cdn/villain-a.png");
  });
});

describe("CardPick copy rule — 'page', never 'beat'", () => {
  it("no reader-facing text or accessibility label says 'beat', before or after a pick", async () => {
    const root = await mountCardPick();
    const seen = [allText(root.root), ...allLabels(root)];
    await press(byA11yLabel(root, "Pick look one of three for the hero")[0]);
    seen.push(allText(root.root), ...allLabels(root));
    for (const s of seen) {
      expect(s).not.toMatch(/\bbeats?\b/i);
    }
  });
});

describe("CardPick palettes — day and night, tokens only", () => {
  it("day: the screen ground is the day bg", async () => {
    const root = await mountCardPick("day");
    const grounds = root.root.findAll(
      (n) => isHost(n.type, "rn-view") && flat(n.props.style).backgroundColor === palettes.day.bg,
    );
    expect(grounds.length).toBeGreaterThanOrEqual(1);
  });

  it("night: ground, surface and ink all flip; no day-only value leaks in", async () => {
    const root = await mountCardPick("night");
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

describe("CardPick dynamic type", () => {
  it("every text bounds its font scaling (maxFontSizeMultiplier)", async () => {
    const root = await mountCardPick();
    const texts = root.root.findAll((n) => isHost(n.type, "rn-text"));
    expect(texts.length).toBeGreaterThan(0);
    for (const t of texts) {
      expect(typeof t.props.maxFontSizeMultiplier).toBe("number");
      expect(t.props.maxFontSizeMultiplier as number).toBeLessThanOrEqual(1.6);
    }
  });
});
