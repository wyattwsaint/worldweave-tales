import { describe, it, expect, vi } from "vitest";
import type { CastMember, GenerateArcRequest } from "@wwt/domain";
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
