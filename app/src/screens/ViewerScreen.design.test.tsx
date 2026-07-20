import React from "react";
import TestRenderer, { act, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  Animated,
  __fireBackPress,
  __resetBackPressHandlers,
} from "../../test/react-native.mock";
import { NavProvider, useNav, type NavState, type ViewerParams } from "../nav/NavContext";
import { ThemeProvider } from "../theme/ThemeContext";
import { palettes, typography, type ThemeMode } from "../theme/tokens";
import ViewerScreen from "./ViewerScreen";
import StorytimeVignette from "../components/StorytimeVignette";
import { setBlobFs } from "../storage/store";
import type { BlobFs } from "../storage/blobStore";
import { sampleArc, sampleWorld } from "../storage/testFixtures";

/**
 * Viewer — the #5 proof screen, rebuilt to the locked direction
 * (docs/design/ui-direction.md + prototype-confirmed appendix):
 *
 * - page card on bg (surface / hairline `line` border / radius 14);
 * - top bar: ‹ Shelf, world label, page count; motif A header vignette;
 * - title + spine-stage line; entity-art tiles (name + role captions);
 * - read-aloud prose in typography.body, ink on surface;
 * - pager: ‹ Back, progress dots, Next page on accent (last page: New story);
 * - reader-facing copy says "page", never "beat" (aria labels included);
 * - tap a tile → full-screen palette-aware art lightbox (Animated fade/scale);
 * - both palettes via ThemeContext — zero hardcoded color/font in the screen.
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

/** Flattened RN style (arrays merged left-to-right, falsy entries dropped). */
function flat(style: unknown): Record<string, unknown> {
  if (!style) return {};
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flat));
  return style as Record<string, unknown>;
}

/**
 * The background content column — the smallest plain view holding both the top
 * bar ("Your Tale") and the pager ("‹ Back"); everything the lightbox covers.
 */
function contentColumn(root: ReactTestRenderer): Node {
  const hits = root.root.findAll(
    (n) =>
      isHost(n.type, "rn-view") && allText(n).includes("Your Tale") && allText(n).includes("‹ Back"),
  );
  return hits.sort((a, b) => a.findAll(() => true).length - b.findAll(() => true).length)[0];
}

/** All accessibilityLabel strings anywhere in the tree. */
function allLabels(root: ReactTestRenderer): string[] {
  return root.root
    .findAll((n) => typeof n.props?.accessibilityLabel === "string")
    .map((n) => n.props.accessibilityLabel as string);
}

let navState: NavState | undefined;
function NavProbe() {
  navState = useNav().state;
  return null;
}

/** Library-sourced params: already shelved, so no on-mount persist runs. */
function viewerParams(): ViewerParams {
  const world = sampleWorld();
  return { arc: sampleArc(), cards: world.deck, bible: world.bible, source: "library" };
}

async function mountViewer(mode: ThemeMode = "day"): Promise<ReactTestRenderer> {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = TestRenderer.create(
      <ThemeProvider mode={mode}>
        <NavProvider>
          <NavProbe />
          <ViewerScreen params={viewerParams()} />
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
  // Roots stay mounted between tests, so open-lightbox subscriptions from an
  // earlier test would otherwise leak into this one's BackHandler state.
  __resetBackPressHandlers();
});
afterEach(() => {
  setBlobFs(undefined);
});

describe("Viewer top bar", () => {
  it("‹ Shelf back link is labelled 'Back to the Shelf'", async () => {
    const root = await mountViewer();
    const back = pressableByLabel(root, "‹ Shelf");
    expect(back).toBeTruthy();
    expect(back!.props.accessibilityLabel).toBe("Back to the Shelf");
    expect(back!.props.accessibilityRole).toBe("button");
  });

  it("shows the world label and a tabular page count", async () => {
    const root = await mountViewer();
    const text = allText(root.root);
    expect(text).toContain("Your Tale");
    expect(text).toContain("1 / 2");
  });
});

describe("Viewer header — motif, title, spine-stage", () => {
  it("renders the storytime bookplate vignette (motif A)", async () => {
    const root = await mountViewer();
    expect(root.root.findAllByType(StorytimeVignette)).toHaveLength(1);
  });

  it("title is the human story label in display type, marked as a header", async () => {
    const root = await mountViewer();
    const title = root.root
      .findAll((n) => isHost(n.type, "rn-text") && allText(n).includes("courage"))
      .find((n) => n.props.accessibilityRole === "header");
    expect(title).toBeTruthy();
    expect(flat(title!.props.style).fontFamily).toBe(typography.display.fontFamily);
    expect(flat(title!.props.style).fontSize).toBe(typography.display.fontSize);
  });

  it("spine-stage line reads 'Page one · setup' (humanized, page-first)", async () => {
    const root = await mountViewer();
    expect(allText(root.root)).toContain("Page one · setup");
  });
});

describe("Viewer page card + prose", () => {
  it("page card sits on the surface with a hairline border and radius 14", async () => {
    const root = await mountViewer();
    const card = root.root.findAll((n) => {
      if (!isHost(n.type, "rn-view")) return false;
      const s = flat(n.props.style);
      return s.backgroundColor === palettes.day.surface && s.borderRadius === 14;
    });
    expect(card.length).toBeGreaterThanOrEqual(1);
    expect(flat(card[0].props.style).borderColor).toBe(palettes.day.line);
    expect(flat(card[0].props.style).borderWidth).toBe(1);
  });

  it("read-aloud prose uses typography.body, ink on surface", async () => {
    const root = await mountViewer();
    const prose = root.root.find(
      (n) => isHost(n.type, "rn-text") && allText(n).includes("nce upon a time"),
    );
    const s = flat(prose.props.style);
    expect(s.fontFamily).toBe(typography.body.fontFamily);
    expect(s.fontSize).toBe(typography.body.fontSize);
    expect(s.lineHeight).toBe(typography.body.lineHeight);
    expect(s.color).toBe(palettes.day.ink);
  });

  it("shows one page at a time — page two's prose is not on page one", async () => {
    const root = await mountViewer();
    const text = allText(root.root);
    expect(text).toContain("nce upon a time");
    expect(text).not.toContain("ood won the day");
  });
});

describe("Viewer pager", () => {
  it("Next page advances: spine-stage, count, dots label and prose all turn", async () => {
    const root = await mountViewer();
    await press(pressableByLabel(root, "Next page"));
    const text = allText(root.root);
    expect(text).toContain("Page two · good triumphs");
    expect(text).toContain("2 / 2");
    expect(text).toContain("ood won the day");
    expect(text).not.toContain("nce upon a time");
    expect(byA11yLabel(root, "Page two of two")).toHaveLength(1);
  });

  it("‹ Back is disabled on the first page, and returns from the second", async () => {
    const root = await mountViewer();
    const back = pressableByLabel(root, "‹ Back");
    expect(back!.props.accessibilityLabel).toBe("Previous page");
    expect(back!.props.accessibilityState?.disabled).toBe(true);
    expect(back!.props.disabled).toBe(true);

    await press(pressableByLabel(root, "Next page"));
    const back2 = pressableByLabel(root, "‹ Back");
    expect(back2!.props.accessibilityState?.disabled).toBe(false);
    await press(back2);
    expect(allText(root.root)).toContain("Page one · setup");
  });

  it("progress dots: one per page, the active one on accent, labelled once", async () => {
    const root = await mountViewer();
    const dots = byA11yLabel(root, "Page one of two");
    expect(dots).toHaveLength(1);
    // The dots themselves are the pill-shaped views inside the labelled group.
    const pips = dots[0].findAll(
      (n) => isHost(n.type, "rn-view") && flat(n.props.style).borderRadius === 999,
    );
    expect(pips).toHaveLength(2);
    const active = pips.filter((n) => flat(n.props.style).backgroundColor === palettes.day.accent);
    expect(active).toHaveLength(1);
  });

  it("Next page is the primary button on accent with a >=44pt target", async () => {
    const root = await mountViewer();
    const next = pressableByLabel(root, "Next page")!;
    expect(next.props.accessibilityRole).toBe("button");
    expect(next.props.accessibilityLabel).toBe("Next page");
    const s = flat(next.props.style);
    expect(s.backgroundColor).toBe(palettes.day.accent);
    expect(s.borderRadius).toBe(999);
    expect(s.minHeight as number).toBeGreaterThanOrEqual(44);
  });

  it("the last page swaps Next page for New story, which opens the wizard", async () => {
    const root = await mountViewer();
    await press(pressableByLabel(root, "Next page"));
    expect(pressableByLabel(root, "Next page")).toBeUndefined();
    await press(pressableByLabel(root, "New story"));
    expect(navState).toEqual({ screen: "wizard" });
  });
});

describe("Viewer entity-art tiles", () => {
  it("tiles carry blob-backed art plus name and role captions", async () => {
    const root = await mountViewer();
    const uris = root.root
      .findAll((n) => isHost(n.type, "rn-image"))
      .map((n) => n.props.source?.uri);
    expect(uris).toContain("file:///doc/blobs/hero-1.png");
    const text = allText(root.root);
    expect(text).toContain("Pip");
    expect(text).toContain("hero · dealt this page");
  });

  it("a card dealt earlier says which page dealt it", async () => {
    const root = await mountViewer();
    await press(pressableByLabel(root, "Next page"));
    const text = allText(root.root);
    expect(text).toContain("hero · dealt page one");
    expect(text).toContain("villain · dealt this page");
  });
});

describe("Viewer copy rule — 'page', never 'beat'", () => {
  it("no reader-facing text or accessibility label says 'beat' on any page", async () => {
    const root = await mountViewer();
    const seen = [allText(root.root), ...allLabels(root)];
    await press(pressableByLabel(root, "Next page"));
    seen.push(allText(root.root), ...allLabels(root));
    for (const s of seen) {
      expect(s).not.toMatch(/\bbeats?\b/i);
    }
  });

  it("page position is announced in words: 'Page one of two'", async () => {
    const root = await mountViewer();
    expect(byA11yLabel(root, "Page one of two")).toHaveLength(1);
  });
});

describe("Viewer palettes — day and night, tokens only", () => {
  it("day: the screen ground is the day bg", async () => {
    const root = await mountViewer("day");
    const grounds = root.root.findAll(
      (n) => isHost(n.type, "rn-view") && flat(n.props.style).backgroundColor === palettes.day.bg,
    );
    expect(grounds.length).toBeGreaterThanOrEqual(1);
  });

  it("night: ground, surface and ink all flip; no day-only value leaks in", async () => {
    const root = await mountViewer("night");
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

describe("Viewer entity-art lightbox", () => {
  it("tapping a tile opens a full-screen palette-aware plate with name and role", async () => {
    const root = await mountViewer("night");
    await press(byA11yLabel(root, "Open art for Pip")[0]);

    const overlay = root.root.findAll((n) => isHost(n.type, "rn-animated-view"));
    expect(overlay).toHaveLength(1);
    expect(flat(overlay[0].props.style).backgroundColor).toBe(palettes.night.bg);

    const caption = allText(overlay[0]);
    expect(caption).toContain("Pip");
    expect(caption).toContain("hero");
    const name = overlay[0].findAll(
      (n) => isHost(n.type, "rn-text") && flat(n.props.style).fontSize === typography.entityNameArt.fontSize,
    );
    expect(name.length).toBeGreaterThanOrEqual(1);
  });

  it("enters with the built-in Animated fade/scale (no reanimated)", async () => {
    const root = await mountViewer();
    await press(byA11yLabel(root, "Open art for Pip")[0]);
    const overlay = root.root.find((n) => isHost(n.type, "rn-animated-view"));
    expect(flat(overlay.props.style).opacity).toBeInstanceOf(Animated.Value);
  });

  it("dismisses via the close affordance (>=44pt target)", async () => {
    const root = await mountViewer();
    await press(byA11yLabel(root, "Open art for Pip")[0]);
    const close = byA11yLabel(root, "Close entity art")[0];
    expect(flat(close.props.style).width as number).toBeGreaterThanOrEqual(44);
    expect(flat(close.props.style).height as number).toBeGreaterThanOrEqual(44);
    await press(close);
    expect(root.root.findAll((n) => isHost(n.type, "rn-animated-view"))).toHaveLength(0);
  });

  it("dismisses via a tap anywhere on the overlay", async () => {
    const root = await mountViewer();
    await press(byA11yLabel(root, "Open art for Pip")[0]);
    const overlay = root.root.find((n) => isHost(n.type, "rn-animated-view"));
    const scrim = overlay
      .findAll((n) => isHost(n.type, "rn-pressable") && allText(n).includes("Pip"))
      .sort((a, b) => b.findAll(() => true).length - a.findAll(() => true).length)[0];
    await press(scrim);
    expect(root.root.findAll((n) => isHost(n.type, "rn-animated-view"))).toHaveLength(0);
  });

  it("hides the covered content from TalkBack AND VoiceOver while open", async () => {
    const root = await mountViewer();
    const column = contentColumn(root);
    expect(column.props.importantForAccessibility).toBe("auto");
    expect(column.props.accessibilityElementsHidden).toBe(false);

    await press(byA11yLabel(root, "Open art for Pip")[0]);
    expect(column.props.importantForAccessibility).toBe("no-hide-descendants");
    expect(column.props.accessibilityElementsHidden).toBe(true);

    await press(byA11yLabel(root, "Close entity art")[0]);
    expect(column.props.importantForAccessibility).toBe("auto");
    expect(column.props.accessibilityElementsHidden).toBe(false);
  });

  it("Android hardware Back closes the open lightbox and consumes the event", async () => {
    const root = await mountViewer();
    await press(byA11yLabel(root, "Open art for Pip")[0]);
    let consumed = false;
    await act(async () => {
      consumed = __fireBackPress();
    });
    expect(consumed).toBe(true);
    expect(root.root.findAll((n) => isHost(n.type, "rn-animated-view"))).toHaveLength(0);
  });

  it("hardware Back with the lightbox closed stays default (not consumed)", async () => {
    const root = await mountViewer();
    expect(__fireBackPress()).toBe(false);
    // …and the handler unregisters on close, not just on unmount.
    await press(byA11yLabel(root, "Open art for Pip")[0]);
    await press(byA11yLabel(root, "Close entity art")[0]);
    expect(__fireBackPress()).toBe(false);
  });

  it("the entrance animation starts only after the overlay has committed", async () => {
    const root = await mountViewer();
    const originalTiming = Animated.timing;
    let overlaysWhenStarted = -1;
    Animated.timing = (value, config) => {
      const anim = originalTiming(value, config);
      return {
        start: (cb) => {
          overlaysWhenStarted = root.root.findAll((n) => isHost(n.type, "rn-animated-view")).length;
          anim.start(cb);
        },
      };
    };
    try {
      await press(byA11yLabel(root, "Open art for Pip")[0]);
    } finally {
      Animated.timing = originalTiming;
    }
    expect(overlaysWhenStarted).toBe(1);
  });
});
