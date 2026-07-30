import React from "react";
import TestRenderer, { act, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NavProvider, useNav, type NavState } from "../nav/NavContext";
import WorldScreen from "./WorldScreen";
import { setBlobFs, store } from "../storage/store";
import type { BlobFs } from "../storage/blobStore";
import { sampleArc, sampleWorld } from "../storage/testFixtures";

/**
 * World screen (#10): a Storyworld's own shelf. It lists every tale woven in the
 * world (newest first, each re-readable), shows the canon whose art is locked
 * forever, and offers the one action that makes a world a franchise — weaving a
 * NEW tale, which re-enters the wizard in continue mode carrying this world.
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

function pressableByLabel(root: ReactTestRenderer, label: string): Node {
  const hits = root.root.findAll(
    (n) => isHost(n.type, "rn-pressable") && allText(n).includes(label),
  );
  return hits.sort((a, b) => a.findAll(() => true).length - b.findAll(() => true).length)[0];
}

let navState: NavState | undefined;
function NavProbe() {
  navState = useNav().state;
  return null;
}

async function mountWorld(worldId = "world-willowmere") {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = TestRenderer.create(
      <NavProvider>
        <NavProbe />
        <WorldScreen params={{ worldId }} />
      </NavProvider>,
    );
  });
  return root;
}

const bag = store as unknown as { worlds: Map<string, unknown>; arcs: Map<string, unknown> };

describe("WorldScreen — one Storyworld's own shelf", () => {
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

  it("shows the world, every tale newest-first, and the canon deck", async () => {
    await store.saveWorld(sampleWorld());
    await store.saveArc(
      sampleArc({ id: "arc-1", createdAt: "2026-07-18T00:00:00.000Z" }),
    );
    await store.saveArc(
      sampleArc({
        id: "arc-2",
        createdAt: "2026-08-02T00:00:00.000Z",
        teachingPoint: { kind: "virtue", virtue: "patience" },
      }),
    );

    const text = allText((await mountWorld()).root);

    expect(text).toContain("Willowmere");
    expect(text).toContain("Kept since July 18, 2026");
    expect(text).toContain("2 tales so far");
    // Newest tale first, each with the day it was woven — never raw ISO.
    expect(text.indexOf("patience")).toBeLessThan(text.indexOf("courage"));
    expect(text).toContain("Woven August 2, 2026");
    // The canon is visible: this is what a new tale already owns, free.
    expect(text).toContain("The canon");
    expect(text).toContain("Pip");
    expect(text).toContain("Gloom");
  });

  it("re-reads a tapped tale in the Viewer, flagged as already-shelved", async () => {
    const world = sampleWorld();
    await store.saveWorld(world);
    await store.saveArc(sampleArc({ id: "arc-1" }));

    const root = await mountWorld();
    await act(async () => {
      pressableByLabel(root, "courage").props.onPress();
    });

    expect(navState).toMatchObject({ screen: "viewer" });
    const params = (navState as Extract<NavState, { screen: "viewer" }>).params;
    expect(params.arc.id).toBe("arc-1");
    expect(params.cards).toEqual(world.deck);
    expect(params.bible).toEqual(world.bible);
    expect(params.artStyle).toEqual(world.artStyle);
    // Already persisted — the Viewer must not re-save and clobber the world.
    expect(params.source).toBe("library");
  });

  it("＋ Weave a new tale enters the wizard carrying THIS world (continue mode)", async () => {
    const world = sampleWorld();
    await store.saveWorld(world);
    await store.saveArc(sampleArc());

    const root = await mountWorld();
    await act(async () => {
      pressableByLabel(root, "Weave a new tale").props.onPress();
    });

    expect(navState).toMatchObject({ screen: "wizard" });
    const params = (navState as Extract<NavState, { screen: "wizard" }>).params;
    expect(params?.world?.id).toBe(world.id);
    // The bible travels too — that's what the springboard offer is drawn from.
    expect(params?.world?.bible.openThreads).toHaveLength(1);
  });

  it("loads the world payload and its arc list concurrently, not sequentially", async () => {
    await store.saveWorld(sampleWorld());
    await store.saveArc(sampleArc());

    const realGetWorld = store.getWorld.bind(store);
    let releaseGetWorld!: () => void;
    const gate = new Promise<void>((resolve) => (releaseGetWorld = resolve));
    vi.spyOn(store, "getWorld").mockImplementation(async (id) => {
      await gate;
      return realGetWorld(id);
    });
    const listArcs = vi.spyOn(store, "listArcs");

    const root = await mountWorld();
    // The arc fetch is already in flight while the world payload is still pending.
    expect(listArcs).toHaveBeenCalledWith("world-willowmere");

    await act(async () => {
      releaseGetWorld();
    });
    expect(allText(root.root)).toContain("Willowmere");
  });

  it("degrades warmly when the world isn't on the shelf, keeping the way back", async () => {
    const root = await mountWorld("world-that-never-was");
    const text = allText(root.root);
    expect(text).toContain("Couldn't open that world");
    expect(text).toContain("‹ Shelf");

    await act(async () => {
      pressableByLabel(root, "‹ Shelf").props.onPress();
    });
    expect(navState).toEqual({ screen: "library" });
  });

  it("a world with no tales yet still offers weaving one", async () => {
    await store.saveWorld(sampleWorld({ deck: [] }));
    const text = allText((await mountWorld()).root);
    expect(text).toContain("0 tales so far");
    expect(text).toContain("Weave a new tale");
  });
});
