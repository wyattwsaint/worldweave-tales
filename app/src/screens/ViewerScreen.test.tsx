import React from "react";
import TestRenderer, { act, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NavProvider, useNav, type NavState, type ViewerParams } from "../nav/NavContext";
import ViewerScreen from "./ViewerScreen";
import LibraryScreen from "./LibraryScreen";
import { store } from "../storage/store";
import { sampleArc, sampleWorld } from "../storage/testFixtures";

/**
 * Viewer persistence (#8 review fixes): the on-mount persist must be observable
 * and awaitable — a failed save surfaces an inline error (never silent loss),
 * and the ‹ Shelf affordance waits for an in-flight save so the shelf never
 * comes up missing the story that was just woven.
 */

type Node = TestRenderer.ReactTestInstance;

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

/** A tappable Pressable whose visible label contains `label`. */
function pressableByLabel(root: ReactTestRenderer, label: string): Node {
  const hits = root.root.findAll(
    (n) => isHost(n.type, "rn-pressable") && allText(n).includes(label),
  );
  return hits.sort((a, b) => a.findAll(() => true).length - b.findAll(() => true).length)[0];
}

/** Records the navigator so the ‹ Shelf transition is observable. */
let navState: NavState | undefined;
let navigateFn: ((next: NavState) => void) | undefined;
function NavProbe() {
  const nav = useNav();
  navState = nav.state;
  navigateFn = nav.navigate;
  return null;
}

/** The exact params the creation path (CardPick) passes. */
function viewerParams(overrides: Partial<ViewerParams> = {}): ViewerParams {
  const world = sampleWorld();
  return { arc: sampleArc(), cards: world.deck, bible: world.bible, ...overrides };
}

async function mountViewer(params: ViewerParams) {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = TestRenderer.create(
      <NavProvider>
        <NavProbe />
        <ViewerScreen params={params} />
      </NavProvider>,
    );
  });
  // Mirror App: the navigator is ON the viewer screen while this renders.
  await act(async () => {
    navigateFn!({ screen: "viewer", params });
  });
  return root;
}

// Reset the module-singleton InMemoryStore between tests so each run is isolated.
const bag = store as unknown as { worlds: Map<string, unknown>; arcs: Map<string, unknown> };

describe("ViewerScreen — durable persist on mount", () => {
  beforeEach(() => {
    bag.worlds.clear();
    bag.arcs.clear();
    navState = undefined;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("surfaces an inline error when the persist fails (no silent loss)", async () => {
    vi.spyOn(store, "saveWorld").mockRejectedValue(new Error("disk full"));
    const root = await mountViewer(viewerParams());
    expect(allText(root.root)).toContain("Couldn't save this tale");
  });

  it("a fresh CardPick→Viewer mount persists exactly once", async () => {
    const savedWorlds = vi.spyOn(store, "saveWorld");
    await mountViewer(viewerParams());
    expect(savedWorlds).toHaveBeenCalledTimes(1);
  });

  it("persists a human-readable world name (never the internal world id) that the shelf shows", async () => {
    const params = viewerParams();
    await mountViewer(params);

    const saved = await store.getWorld(params.arc.worldId);
    expect(saved?.name).toBe("courage"); // the teaching-point-derived title
    expect(saved?.name).not.toBe(params.arc.worldId);

    // The shelf lists the persisted world under that human title.
    let shelf!: ReactTestRenderer;
    await act(async () => {
      shelf = TestRenderer.create(
        <NavProvider>
          <LibraryScreen />
        </NavProvider>,
      );
    });
    expect(allText(shelf.root)).toContain("courage");
    expect(allText(shelf.root)).not.toContain(params.arc.worldId);
  });

  it("‹ Shelf tapped while the persist is in flight still lands the story on the shelf", async () => {
    const realSave = store.saveWorld.bind(store);
    let open!: () => void;
    const gate = new Promise<void>((resolve) => (open = resolve));
    vi.spyOn(store, "saveWorld").mockImplementation(async (world) => {
      await gate;
      await realSave(world);
    });

    const params = viewerParams();
    const root = await mountViewer(params);

    // Tap ‹ Shelf while saveWorld is still pending.
    act(() => {
      void pressableByLabel(root, "‹ Shelf").props.onPress();
    });
    await act(async () => {});

    // The shelf must never appear without the just-woven story on it: if we
    // are already home, the world has to be in the store Library lists.
    if (navState?.screen === "library") {
      expect((await store.listWorldSummaries()).map((w) => w.id)).toContain(params.arc.worldId);
    }

    // Let the save finish — we end up home with the story shelved.
    await act(async () => {
      open();
    });
    await act(async () => {});
    expect(navState).toEqual({ screen: "library" });
    expect((await store.listWorldSummaries()).map((w) => w.id)).toContain(params.arc.worldId);
  });

  /** Mount, tap ‹ Shelf mid-save, then make the save REJECT while the tap awaits it. */
  async function tapShelfThenFailSave() {
    let fail!: (e: Error) => void;
    const gate = new Promise<never>((_, reject) => (fail = reject));
    vi.spyOn(store, "saveWorld").mockImplementation(async () => {
      await gate;
    });

    const params = viewerParams();
    const root = await mountViewer(params);

    // Tap ‹ Shelf while saveWorld is still pending…
    act(() => {
      void pressableByLabel(root, "‹ Shelf").props.onPress();
    });
    // …then the save fails while the user is mid-tap-wait.
    await act(async () => {
      fail(new Error("disk full"));
    });
    await act(async () => {});
    return root;
  }

  it("‹ Shelf tapped mid-save that then FAILS stays on the Viewer with the error visible", async () => {
    const root = await tapShelfThenFailSave();

    // No silent hop home: the user must see the failure before leaving.
    expect(navState?.screen).toBe("viewer");
    expect(allText(root.root)).toContain("Couldn't save this tale");
  });

  it("a second ‹ Shelf tap after the surfaced failure does navigate home (never trapped)", async () => {
    const root = await tapShelfThenFailSave();

    act(() => {
      void pressableByLabel(root, "‹ Shelf").props.onPress();
    });
    await act(async () => {});
    expect(navState).toEqual({ screen: "library" });
  });
});
