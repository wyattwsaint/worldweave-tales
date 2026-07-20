import React from "react";
import TestRenderer, { act, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../App";
import { NavProvider, useNav, type NavState } from "../nav/NavContext";
import LibraryScreen from "./LibraryScreen";
import { FakeProxyClient } from "../api/fakeProxyClient";
import { setBlobFs, store } from "../storage/store";
import type { BlobFs } from "../storage/blobStore";
import { sampleArc, sampleWorld } from "../storage/testFixtures";

/**
 * Library (#8): the persistent bookshelf is the HOME surface. It lists saved
 * storyworlds newest-first (title + cover thumb + created date), re-opens a
 * tapped world's most recent arc in the Viewer with the exact {arc, cards,
 * bible} params the creation path passes, and shows a friendly empty state
 * whose ＋ New Story CTA launches the Wizard.
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

function images(root: ReactTestRenderer): Node[] {
  return root.root.findAll((n) => isHost(n.type, "rn-image"));
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

function textInputByTestID(root: ReactTestRenderer, testID: string): Node | null {
  const hits = root.root.findAll(
    (n) => isHost(n.type, "rn-textinput") && n.props.testID === testID,
  );
  return hits[0] ?? null;
}

/** Records the navigator state so shelf-driven transitions are observable. */
let navState: NavState | undefined;
function NavProbe() {
  navState = useNav().state;
  return null;
}

async function mountShelf() {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = TestRenderer.create(
      <NavProvider>
        <NavProbe />
        <LibraryScreen />
      </NavProvider>,
    );
  });
  return root;
}

// Reset the module-singleton InMemoryStore between tests so each run is isolated.
const bag = store as unknown as { worlds: Map<string, unknown>; arcs: Map<string, unknown> };

describe("LibraryScreen — the home bookshelf", () => {
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

  it("lists saved worlds newest-first with title, cover thumb, and created date", async () => {
    await store.saveWorld(
      sampleWorld({ id: "w-old", name: "Willowmere", createdAt: "2026-07-01T00:00:00.000Z" }),
    );
    await store.saveWorld(
      sampleWorld({
        id: "w-new",
        name: "Brackenford",
        createdAt: "2026-07-15T00:00:00.000Z",
        deck: [],
      }),
    );

    const root = await mountShelf();
    const text = allText(root.root);

    expect(text).toContain("Willowmere");
    expect(text).toContain("Brackenford");
    // Newest first.
    expect(text.indexOf("Brackenford")).toBeLessThan(text.indexOf("Willowmere"));
    // Created dates, formatted warmly — never raw ISO on the shelf.
    expect(text).toContain("Kept since July 15, 2026");
    expect(text).toContain("Kept since July 1, 2026");
    // Willowmere's cover (the summary's coverRef, indexed at save time from
    // deck[0].lockedImageRef) resolves through the blob store; the deckless
    // world degrades to a neutral placeholder (no image).
    expect(images(root).map((n) => n.props.source?.uri)).toEqual(["file:///doc/blobs/hero-1.png"]);
  });

  it("renders the cover thumb from the summary's coverRef — never re-derived from the payload", async () => {
    // The store hands the shelf ONLY the summary projection; there is no full
    // world to re-derive deck[0].lockedImageRef from.
    vi.spyOn(store, "listWorldSummaries").mockResolvedValue([
      { id: "w1", name: "Willowmere", createdAt: "2026-07-18T00:00:00.000Z", coverRef: "blobs/cover-only.png" },
    ]);
    const root = await mountShelf();
    expect(allText(root.root)).toContain("Willowmere");
    expect(images(root).map((n) => n.props.source?.uri)).toEqual(["file:///doc/blobs/cover-only.png"]);
  });

  it("opens a tapped world in the Viewer: most recent arc + the creation-path params", async () => {
    const world = sampleWorld({ id: "w1" });
    await store.saveWorld(world);
    await store.saveArc(
      sampleArc({ id: "arc-old", worldId: "w1", createdAt: "2026-07-01T00:00:00.000Z" }),
    );
    await store.saveArc(
      sampleArc({ id: "arc-new", worldId: "w1", createdAt: "2026-07-15T00:00:00.000Z" }),
    );

    const root = await mountShelf();
    await act(async () => {
      pressableByLabel(root, "Willowmere").props.onPress();
    });

    expect(navState).toMatchObject({ screen: "viewer" });
    const params = (navState as Extract<NavState, { screen: "viewer" }>).params;
    expect(params.arc.id).toBe("arc-new");
    expect(params.cards).toEqual(world.deck);
    expect(params.bible).toEqual(world.bible);
  });

  it("openWorld fetches the full world and its arcs concurrently, not sequentially", async () => {
    await store.saveWorld(sampleWorld({ id: "w1" }));
    await store.saveArc(sampleArc({ id: "arc-1", worldId: "w1" }));

    // Hold getWorld open: the arc fetch must already be in flight while the
    // world fetch is still pending (independent reads run via Promise.all).
    const realGetWorld = store.getWorld.bind(store);
    let releaseGetWorld!: () => void;
    const gate = new Promise<void>((resolve) => (releaseGetWorld = resolve));
    vi.spyOn(store, "getWorld").mockImplementation(async (id) => {
      await gate;
      return realGetWorld(id);
    });
    const listArcs = vi.spyOn(store, "listArcs");

    const root = await mountShelf();
    act(() => {
      pressableByLabel(root, "Willowmere").props.onPress();
    });
    expect(listArcs).toHaveBeenCalledWith("w1");

    await act(async () => {
      releaseGetWorld();
    });
    expect(navState).toMatchObject({ screen: "viewer" });
  });

  it("renders the friendly empty state whose ＋ New Story CTA launches the Wizard", async () => {
    const root = await mountShelf();
    expect(allText(root.root)).toContain("No tales on the shelf yet");
    await act(async () => {
      pressableByLabel(root, "New Story").props.onPress();
    });
    expect(navState).toEqual({ screen: "wizard" });
  });

  it("shows the inline shelf error when the initial load fails — never a silent blank shelf", async () => {
    vi.spyOn(store, "listWorldSummaries").mockRejectedValue(new Error("db locked"));
    const root = await mountShelf();
    expect(allText(root.root)).toContain("Couldn't load your bookshelf");
  });

  it("stays on the shelf with an inline error when a world fails to open", async () => {
    await store.saveWorld(sampleWorld({ id: "w1" })); // world saved, but no arc
    const root = await mountShelf();
    await act(async () => {
      pressableByLabel(root, "Willowmere").props.onPress();
    });
    expect(navState).toEqual({ screen: "library" });
    const text = allText(root.root);
    expect(text).toContain("Couldn't open that story");
    expect(text).toContain("Willowmere"); // still shelved
  });

  it("is the app's home surface: App mounts on the shelf, not the Wizard", async () => {
    let root!: ReactTestRenderer;
    await act(async () => {
      root = TestRenderer.create(<App client={new FakeProxyClient()} />);
    });
    expect(allText(root.root)).toContain("Your Bookshelf");
    expect(textInputByTestID(root, "world")).toBeNull();
    await act(async () => {
      pressableByLabel(root, "New Story").props.onPress();
    });
    expect(textInputByTestID(root, "world")).toBeTruthy();
  });

  it("re-opening a world from the shelf never re-persists it (no clobbering upsert)", async () => {
    await store.saveWorld(sampleWorld());
    await store.saveArc(sampleArc());
    const savedWorlds = vi.spyOn(store, "saveWorld");
    const savedArcs = vi.spyOn(store, "saveArc");

    let root!: ReactTestRenderer;
    await act(async () => {
      root = TestRenderer.create(<App client={new FakeProxyClient()} />);
    });
    await act(async () => {
      pressableByLabel(root, "Willowmere").props.onPress();
    });

    expect(allText(root.root)).toContain("Your Tale"); // the Viewer is open...
    expect(savedWorlds).not.toHaveBeenCalled(); // ...but nothing was re-saved
    expect(savedArcs).not.toHaveBeenCalled();
  });

  it("Viewer's ‹ Shelf affordance returns to a freshly-reloaded shelf", async () => {
    await store.saveWorld(sampleWorld());
    await store.saveArc(sampleArc());
    let root!: ReactTestRenderer;
    await act(async () => {
      root = TestRenderer.create(<App client={new FakeProxyClient()} />);
    });
    await act(async () => {
      pressableByLabel(root, "Willowmere").props.onPress();
    });
    expect(allText(root.root)).toContain("Your Tale");
    await act(async () => {
      pressableByLabel(root, "‹ Shelf").props.onPress();
    });
    const text = allText(root.root);
    expect(text).toContain("Your Bookshelf");
    expect(text).not.toContain("Your Tale");
    expect(text).toContain("Kept since July 18, 2026"); // the world is still shelved (reloaded on remount)
  });
});
