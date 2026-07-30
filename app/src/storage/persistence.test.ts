import { describe, expect, it, vi } from "vitest";
import { InMemoryStore } from "./localStore";
import { arcTitle, persistFinishedWorld } from "./persistence";
import { sampleArc, sampleCard, sampleWorld } from "./testFixtures";

describe("arcTitle", () => {
  it("derives the human-facing label from the teaching point", () => {
    expect(arcTitle(sampleArc())).toBe("courage");
    expect(
      arcTitle(
        sampleArc({
          teachingPoint: { kind: "situation", description: "A new baby brother", heavy: false },
        }),
      ),
    ).toBe("A new baby brother");
  });
});

describe("persistFinishedWorld", () => {
  it("saves the world and its arc", async () => {
    const store = new InMemoryStore();
    const world = sampleWorld();
    const arc = sampleArc();
    await persistFinishedWorld(world, arc, { store });

    expect((await store.getWorld(world.id))?.id).toBe(world.id);
    expect((await store.getArc(arc.id))?.id).toBe(arc.id);
  });

  it("without a downloader, leaves lockedImageRef untouched", async () => {
    const store = new InMemoryStore();
    const world = sampleWorld({
      deck: [sampleCard({ entityId: "h", lockedImageRef: "https://cdn/pic.png" })],
    });
    await persistFinishedWorld(world, sampleArc(), { store });
    const saved = await store.getWorld(world.id);
    expect(saved?.deck[0].lockedImageRef).toBe("https://cdn/pic.png");
  });

  it("downloads http(s) art to a local blob and rewrites lockedImageRef", async () => {
    const store = new InMemoryStore();
    const downloadArt = vi.fn(async (_url: string, name: string) => `blobs/${name}`);
    const world = sampleWorld({
      deck: [
        sampleCard({ entityId: "hero-1", lockedImageRef: "https://cdn/hero.png" }),
        sampleCard({ entityId: "villain-1", role: "villain", lockedImageRef: "https://cdn/vil.jpeg?sig=abc" }),
      ],
    });

    await persistFinishedWorld(world, sampleArc(), { store, downloadArt });

    // Extension derived from the URL (query stripped); name is the entityId.
    expect(downloadArt).toHaveBeenCalledWith("https://cdn/hero.png", "hero-1.png");
    expect(downloadArt).toHaveBeenCalledWith("https://cdn/vil.jpeg?sig=abc", "villain-1.jpeg");
    const saved = await store.getWorld(world.id);
    expect(saved?.deck.map((c) => c.lockedImageRef)).toEqual(["blobs/hero-1.png", "blobs/villain-1.jpeg"]);
  });

  it("continuing a world MERGES: new cards appended, locked art and shelf label kept (#10)", async () => {
    const store = new InMemoryStore();
    // Arc 1 is already on the shelf.
    const first = sampleWorld();
    await persistFinishedWorld(first, sampleArc(), { store });

    // Arc 2 brings back the hero (same entityId, art the proxy could not know) and
    // introduces a companion. The world object the Viewer builds is name-naive.
    const second = sampleWorld({
      name: "patience", // arc 2's title — must NOT become the shelf label
      artStyle: { presetId: "pencil-sketch", displayName: "Imaginative Pencil-Sketch" },
      createdAt: "2026-08-01T00:00:00.000Z",
      arcIds: ["arc-2"],
      deck: [
        sampleCard({ lockedImageRef: "https://cdn/REDRAWN.png" }), // hero-1 again
        sampleCard({ entityId: "fern-1", role: "companion", canonName: "Fern", lockedImageRef: "blobs/fern.png" }),
      ],
      bible: {
        ...first.bible,
        eventLog: [...first.bible.eventLog, { arcId: "arc-2", summary: "Pip waited.", lessonTaught: "patience" }],
      },
    });
    await persistFinishedWorld(second, sampleArc({ id: "arc-2" }), { store });

    const saved = (await store.getWorld(first.id))!;
    // Prior canon intact; the returning hero keeps the art locked in arc 1.
    expect(saved.deck.map((c) => c.entityId)).toEqual(["hero-1", "villain-1", "fern-1"]);
    expect(saved.deck[0].lockedImageRef).toBe("blobs/hero-1.png");
    // Shelf identity is stable across arcs.
    expect(saved.name).toBe("Willowmere");
    expect(saved.createdAt).toBe("2026-07-18T00:00:00.000Z");
    expect(saved.artStyle.providerStyleRef).toBe("sub:pencil-42");
    // Both arcs are owned by the world, and the latest bible won.
    expect(saved.arcIds).toEqual(["arc-1", "arc-2"]);
    expect(saved.bible.eventLog.map((e) => e.arcId)).toEqual(["arc-1", "arc-2"]);
    expect((await store.listArcs(first.id)).map((a) => a.id).sort()).toEqual(["arc-1", "arc-2"]);
  });

  it("re-saving the same arc does not duplicate its id", async () => {
    const store = new InMemoryStore();
    await persistFinishedWorld(sampleWorld(), sampleArc(), { store });
    await persistFinishedWorld(sampleWorld(), sampleArc(), { store });
    expect((await store.getWorld("world-willowmere"))?.arcIds).toEqual(["arc-1"]);
  });

  it("leaves already-local (non-http) refs alone even with a downloader", async () => {
    const store = new InMemoryStore();
    const downloadArt = vi.fn(async () => "blobs/should-not-happen");
    const world = sampleWorld({
      deck: [sampleCard({ entityId: "h", lockedImageRef: "blobs/h.png" })],
    });
    await persistFinishedWorld(world, sampleArc(), { store, downloadArt });
    expect(downloadArt).not.toHaveBeenCalled();
    expect((await store.getWorld(world.id))?.deck[0].lockedImageRef).toBe("blobs/h.png");
  });
});
