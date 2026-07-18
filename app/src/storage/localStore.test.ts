import { describe, expect, it } from "vitest";
import { InMemoryStore } from "./localStore";
import { sampleArc, sampleWorld } from "./testFixtures";

describe("InMemoryStore — arc methods", () => {
  it("round-trips an Arc (save -> get)", async () => {
    const store = new InMemoryStore();
    const arc = sampleArc();
    await store.saveArc(arc);
    expect(await store.getArc(arc.id)).toEqual(arc);
  });

  it("getArc returns undefined for an unknown id", async () => {
    const store = new InMemoryStore();
    expect(await store.getArc("nope")).toBeUndefined();
  });

  it("listArcs filters by worldId", async () => {
    const store = new InMemoryStore();
    await store.saveArc(sampleArc({ id: "a1", worldId: "w1" }));
    await store.saveArc(sampleArc({ id: "a2", worldId: "w1" }));
    await store.saveArc(sampleArc({ id: "a3", worldId: "w2" }));

    const w1 = await store.listArcs("w1");
    expect(w1.map((a) => a.id).sort()).toEqual(["a1", "a2"]);
    expect(await store.listArcs("w2")).toHaveLength(1);
    expect(await store.listArcs("missing")).toEqual([]);
  });

  it("still round-trips a Storyworld (unchanged behavior)", async () => {
    const store = new InMemoryStore();
    const world = sampleWorld();
    await store.saveWorld(world);
    expect(await store.getWorld(world.id)).toEqual(world);
    expect(await store.listWorlds()).toEqual([world]);
  });
});
