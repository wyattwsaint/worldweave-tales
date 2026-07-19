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
