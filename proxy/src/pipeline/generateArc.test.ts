import { describe, it, expect, vi } from "vitest";
import type { GenerateArcRequest } from "@wwt/domain";
import type { ImageProvider } from "../providers/imageProvider.js";
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
