import { describe, it, expect, vi } from "vitest";
import type { CastMember, GenerateArcRequest, StoryBible, Storyworld } from "@wwt/domain";
import { INVARIANT_SPINE } from "@wwt/domain";
import type { ImageProvider } from "../providers/imageProvider.js";
import type { LlmProvider } from "../providers/llmProvider.js";
import { StubLlmProvider } from "../providers/llmProvider.js";
import { generateArc } from "./generateArc.js";

/** Minimal valid answers for a brand-NEW world (no world state passed). */
function newWorldRequest(): GenerateArcRequest {
  return {
    attestationToken: "dev",
    deviceId: "test-device",
    answers: {
      tier: "beginner",
      ageBand: "toddler",
      teachingPoint: { kind: "virtue", virtue: "courage" },
      closingVerseEnabled: false,
      choices: {},
    },
    // world intentionally omitted — this is the first-ever arc.
  };
}

/** A spy ImageProvider that records the style ref flowing through the pipeline. */
function spyImageProvider() {
  const ensureStyle = vi.fn(async () => ({ providerStyleRef: "spy-style:from-ensure" }));
  const seenRefs: string[] = [];
  const generateCardVariants = vi.fn(async (input: { providerStyleRef: string; count: number }) => {
    seenRefs.push(input.providerStyleRef);
    return { imageRefs: Array.from({ length: input.count }, (_, i) => `spy-image:${i}`) };
  });
  const provider: ImageProvider = { ensureStyle, generateCardVariants };
  return { provider, ensureStyle, generateCardVariants, seenRefs };
}

/** A bible with nothing in it — what a forgetful model returns. */
function emptyBible(): StoryBible {
  return { entitySheets: [], eventLog: [], worldState: [], openThreads: [], virtuesTaught: [] };
}

/** A fake LLM that authors one prose beat per spine step plus a fixed cast, so a
 *  test can drive the deterministic cast→dealtCardIds derivation precisely. */
function fakeLlm(cast: CastMember[]): LlmProvider {
  return {
    async writeArc() {
      const beats = INVARIANT_SPINE.map((spineBeat) => ({ spineBeat, text: `t ${spineBeat}` }));
      return { beats, cast };
    },
    async updateBible() {
      return { entitySheets: [], eventLog: [], worldState: [], openThreads: [], virtuesTaught: [] };
    },
  };
}

/** A saved Storyworld with two locked cards and a bible carrying an open thread. */
function savedWorld(): Storyworld {
  return {
    id: "world-willowmere",
    name: "courage",
    artStyle: {
      presetId: "pencil-mvp",
      displayName: "Imaginative Pencil Sketch",
      providerStyleRef: "sub:pencil-42",
    },
    defaultAgeBand: "toddler",
    deck: [
      {
        entityId: "pip",
        role: "hero",
        canonName: "Pip",
        traits: ["brave"],
        appearanceNote: "a mouse in a red cloak",
        lockedImageRef: "", // blanked by the app before sending (#10)
        relationships: [],
        canonizedAt: "2026-07-18T00:00:00.000Z",
      },
      {
        entityId: "gloom",
        role: "villain",
        canonName: "Gloom",
        traits: ["shadowy"],
        appearanceNote: "a drifting shadow",
        lockedImageRef: "",
        relationships: [],
        canonizedAt: "2026-07-18T00:00:00.000Z",
      },
    ],
    bible: {
      entitySheets: [
        { entityId: "pip", facts: ["brave"], appearanceNote: "a mouse in a red cloak", relationships: [] },
      ],
      eventLog: [{ arcId: "arc-1", summary: "Pip faced the shadow.", lessonTaught: "courage" }],
      worldState: ["The shadow was calmed."],
      openThreads: [{ id: "t1", teaser: "A tiny door was left ajar.", originArcId: "arc-1", resolved: false }],
      virtuesTaught: ["courage"],
    },
    arcIds: ["arc-1"],
    createdAt: "2026-07-18T00:00:00.000Z",
  };
}

/** Continuing that world, with the parent's chosen springboard thread. */
function continuationRequest(overrides: Partial<GenerateArcRequest["answers"]> = {}): GenerateArcRequest {
  return {
    attestationToken: "dev",
    deviceId: "test-device",
    answers: {
      worldId: "world-willowmere",
      tier: "beginner",
      ageBand: "toddler",
      teachingPoint: { kind: "virtue", virtue: "patience" },
      closingVerseEnabled: false,
      choices: {},
      continueThreadId: "t1",
      ...overrides,
    },
    world: savedWorld(),
  };
}

describe("generateArc — cast → dealtCardIds derivation", () => {
  it("derives per-beat dealtCardIds and canonizes retained fresh (non-hero/villain) cast", async () => {
    const spy = spyImageProvider();
    const cast: CastMember[] = [
      { entityId: "owl", role: "companion", appearanceNote: "a wise owl", firstBeatIndex: 0 },
      { entityId: "glade", role: "place", appearanceNote: "a mossy glade", firstBeatIndex: 2 },
    ];
    const res = await generateArc(newWorldRequest(), {
      image: spy.provider,
      llm: fakeLlm(cast),
      now: () => "2026-07-17T00:00:00Z",
    });

    // Every returned beat is a full Beat carrying a derived dealtCardIds array.
    expect(res.arc.beats).toHaveLength(INVARIANT_SPINE.length);
    for (const beat of res.arc.beats) expect(Array.isArray(beat.dealtCardIds)).toBe(true);

    // Each entity is dealt onto exactly the beat it first appears in.
    expect(res.arc.beats[0].dealtCardIds).toEqual(["owl"]);
    expect(res.arc.beats[2].dealtCardIds).toEqual(["glade"]);
    expect(res.arc.beats[1].dealtCardIds).toEqual([]);

    // Retained fresh, non-hero/villain cast is canonized into single-option Cards.
    expect(res.newCanonCards.map((c) => c.entityId).sort()).toEqual(["glade", "owl"]);
    expect(res.pendingCardChoices).toEqual([]);
  });
});

describe("generateArc — hero/villain parent-pick entityId threading", () => {
  it("threads a hero cast member's real entityId (!= role) onto its pending choice AND the beat it is dealt", async () => {
    const spy = spyImageProvider();
    // A REAL model names the hero "prince-alden" — its entityId is NOT "hero".
    const cast: CastMember[] = [
      { entityId: "prince-alden", role: "hero", appearanceNote: "a young prince in a blue cloak", firstBeatIndex: 0 },
    ];
    const res = await generateArc(newWorldRequest(), {
      image: spy.provider,
      llm: fakeLlm(cast),
      now: () => "2026-07-17T00:00:00Z",
    });

    // The pending parent-pick carries the SAME entityId that was bucketed into
    // dealtCardIds, so the canonized card will match ViewerScreen's byId lookup.
    expect(res.pendingCardChoices).toHaveLength(1);
    expect(res.pendingCardChoices[0].entityId).toBe("prince-alden");
    expect(res.pendingCardChoices[0].appearanceNote).toBe("a young prince in a blue cloak");
    // dealtCardIds and the choice agree — no dangling ref on a real LLM run.
    expect(res.arc.beats[0].dealtCardIds).toContain("prince-alden");
  });
});

describe("generateArc — arc continuation (#10)", () => {
  it("hands the DECK's roster to the authoring model so returning cast keeps its ids", async () => {
    const spy = spyImageProvider();
    const writeArc = vi.fn(async () => ({
      beats: INVARIANT_SPINE.map((spineBeat) => ({ spineBeat, text: `t ${spineBeat}` })),
      cast: [] as CastMember[],
    }));
    await generateArc(continuationRequest(), {
      image: spy.provider,
      llm: { writeArc, updateBible: async () => emptyBible() },
      now: () => "2026-07-20T00:00:00Z",
    });

    const roster = writeArc.mock.calls[0][0].canon;
    expect(roster).toEqual([
      { entityId: "pip", role: "hero", canonName: "Pip", appearanceNote: "a mouse in a red cloak" },
      { entityId: "gloom", role: "villain", canonName: "Gloom", appearanceNote: "a drifting shadow" },
    ]);
  });

  it("passes no roster for a brand-new world", async () => {
    const spy = spyImageProvider();
    const writeArc = vi.fn(async () => ({
      beats: INVARIANT_SPINE.map((spineBeat) => ({ spineBeat, text: `t ${spineBeat}` })),
      cast: [] as CastMember[],
    }));
    await generateArc(newWorldRequest(), {
      image: spy.provider,
      llm: { writeArc, updateBible: async () => emptyBible() },
      now: () => "2026-07-20T00:00:00Z",
    });
    expect(writeArc.mock.calls[0][0].canon).toBeUndefined();
  });

  it("reuses locked canon for free: recurring cast is dealt but never redrawn", async () => {
    const spy = spyImageProvider();
    // The model brings both canon entities back plus ONE new companion.
    const cast: CastMember[] = [
      { entityId: "pip", role: "hero", appearanceNote: "a mouse in a red cloak", firstBeatIndex: 0 },
      { entityId: "gloom", role: "villain", appearanceNote: "a drifting shadow", firstBeatIndex: 2 },
      { entityId: "fern", role: "companion", appearanceNote: "a green sparrow", firstBeatIndex: 1 },
    ];
    const res = await generateArc(continuationRequest(), {
      image: spy.provider,
      llm: fakeLlm(cast),
      now: () => "2026-07-20T00:00:00Z",
    });

    // Dealt onto the pages...
    expect(res.arc.beats[0].dealtCardIds).toEqual(["pip"]);
    expect(res.arc.beats[2].dealtCardIds).toEqual(["gloom"]);
    expect(res.arc.beats[1].dealtCardIds).toEqual(["fern"]);
    // ...but only the NEW entity costs art. Pip and Gloom keep their locked faces:
    // no new card, and — crucially — no parent re-pick for a returning hero/villain.
    expect(res.newCanonCards.map((c) => c.entityId)).toEqual(["fern"]);
    expect(res.pendingCardChoices).toEqual([]);
    expect(spy.generateCardVariants).toHaveBeenCalledTimes(1);
  });

  it("counts only NEW entities against the tier cap (recurring canon is unlimited)", async () => {
    const spy = spyImageProvider();
    // Beginner's cap is 3. Two recurring + four fresh: all recurring survive, and
    // the fresh are capped — the cap must not be spent on canon that already exists.
    const cast: CastMember[] = [
      { entityId: "pip", role: "hero", appearanceNote: "", firstBeatIndex: 0 },
      { entityId: "gloom", role: "villain", appearanceNote: "", firstBeatIndex: 0 },
      ...["a", "b", "c", "d"].map((id, i) => ({
        entityId: id,
        role: "companion" as const,
        appearanceNote: "",
        firstBeatIndex: i,
      })),
    ];
    const res = await generateArc(continuationRequest(), {
      image: spy.provider,
      llm: fakeLlm(cast),
      now: () => "2026-07-20T00:00:00Z",
    });

    const dealt = res.arc.beats.flatMap((b) => b.dealtCardIds);
    expect(dealt).toContain("pip");
    expect(dealt).toContain("gloom");
    expect(res.newCanonCards).toHaveLength(3); // the beginner cap, spent on fresh only
    // No dangling refs: every dealt id is either canon or a card we just minted.
    const known = new Set([...res.newCanonCards.map((c) => c.entityId), "pip", "gloom"]);
    for (const id of dealt) expect(known.has(id)).toBe(true);
  });

  it("merges the bible append-only and resolves the continued thread", async () => {
    const spy = spyImageProvider();
    const res = await generateArc(continuationRequest(), {
      image: spy.provider,
      // A model that returns an EMPTY bible must not erase arc 1's canon.
      llm: { writeArc: fakeLlm([]).writeArc, updateBible: async () => emptyBible() },
      now: () => "2026-07-20T00:00:00Z",
    });

    expect(res.bible.entitySheets.map((s) => s.entityId)).toEqual(["pip"]);
    expect(res.bible.eventLog.map((e) => e.arcId)).toEqual(["arc-1", res.arc.id]);
    expect(res.bible.virtuesTaught).toEqual(["courage", "patience"]);
    // The springboard the parent picked is spent — never offered as new again.
    expect(res.bible.openThreads.find((t) => t.id === "t1")?.resolved).toBe(true);
  });

  it("returns the RESOLVED art style so the next arc is drawn the same way", async () => {
    const spy = spyImageProvider();
    const res = await generateArc(continuationRequest(), {
      image: spy.provider,
      llm: new StubLlmProvider(),
      now: () => "2026-07-20T00:00:00Z",
    });

    expect(res.artStyle).toEqual({
      presetId: "pencil-mvp",
      displayName: "Imaginative Pencil Sketch",
      providerStyleRef: "spy-style:from-ensure",
    });
  });

  it("stamps the arc with the continued world's id, not a fresh one", async () => {
    const spy = spyImageProvider();
    const res = await generateArc(continuationRequest(), {
      image: spy.provider,
      llm: new StubLlmProvider(),
      now: () => "2026-07-20T00:00:00Z",
    });
    expect(res.arc.worldId).toBe("world-willowmere");
  });
});

describe("generateArc — new-world style path", () => {
  it("routes the new-world style through ensureStyle (never the hardcoded stub literal)", async () => {
    const spy = spyImageProvider();
    await generateArc(newWorldRequest(), {
      image: spy.provider,
      llm: new StubLlmProvider(),
      now: () => "2026-07-17T00:00:00Z",
    });

    // The blocker: the old code hardcoded "stub-style:default" for new worlds,
    // which parseStyleRef rejects on the real Recraft provider. The fix must
    // route even the no-world case through ensureStyle and use its ref.
    expect(spy.ensureStyle).toHaveBeenCalledTimes(1);
    expect(spy.seenRefs.length).toBeGreaterThan(0);
    for (const ref of spy.seenRefs) {
      expect(ref).toBe("spy-style:from-ensure");
      expect(ref).not.toBe("stub-style:default");
    }
  });
});
