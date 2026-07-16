import { describe, it, expect } from "vitest";
import { INVARIANT_SPINE } from "@wwt/domain";
import type { GenerateArcRequest } from "@wwt/domain";
import { FakeProxyClient } from "./fakeProxyClient.js";

function req(): GenerateArcRequest {
  return {
    attestationToken: "tok",
    deviceId: "dev-1",
    answers: {
      tier: "beginner",
      ageBand: "preschool",
      teachingPoint: { kind: "virtue", virtue: "courage" },
      closingVerseEnabled: false,
      choices: { world: "Willowmere", hero: "Pip", villain: "The Gloom" },
    },
  };
}

describe("FakeProxyClient", () => {
  it("returns pending choices for hero and villain with variant refs", async () => {
    const res = await new FakeProxyClient().generateArc(req());
    const roles = res.pendingCardChoices.map((c) => c.role).sort();
    expect(roles).toEqual(["hero", "villain"]);
    for (const choice of res.pendingCardChoices) {
      expect(choice.variantImageRefs.length).toBeGreaterThanOrEqual(2);
      expect(choice.variantImageRefs.length).toBeLessThanOrEqual(3);
      for (const ref of choice.variantImageRefs) {
        expect(ref).toContain(`stub-image:${choice.role}`);
      }
    }
  });

  it("produces one beat per INVARIANT_SPINE step, in order", async () => {
    const res = await new FakeProxyClient().generateArc(req());
    expect(res.arc.beats).toHaveLength(INVARIANT_SPINE.length);
    expect(res.arc.beats.map((b) => b.spineBeat)).toEqual([...INVARIANT_SPINE]);
  });

  it("canonizes at least one non-hero/villain card", async () => {
    const res = await new FakeProxyClient().generateArc(req());
    expect(res.newCanonCards.length).toBeGreaterThanOrEqual(1);
    for (const card of res.newCanonCards) {
      expect(card.role === "hero" || card.role === "villain").toBe(false);
      expect(card.lockedImageRef).not.toBe("");
      expect(card.canonizedAt).not.toBe("");
    }
  });

  it("returns a minimal valid StoryBible", async () => {
    const res = await new FakeProxyClient().generateArc(req());
    const b = res.bible;
    expect(Array.isArray(b.entitySheets)).toBe(true);
    expect(Array.isArray(b.eventLog)).toBe(true);
    expect(Array.isArray(b.worldState)).toBe(true);
    expect(Array.isArray(b.openThreads)).toBe(true);
    expect(b.virtuesTaught).toContain("courage");
  });

  it("is deterministic for the same input", async () => {
    const a = await new FakeProxyClient().generateArc(req());
    const b = await new FakeProxyClient().generateArc(req());
    expect(a).toEqual(b);
  });

  it("honors an injected now for canonizedAt stamps", async () => {
    const now = new Date("2020-01-02T03:04:05.000Z");
    const res = await new FakeProxyClient(now).generateArc(req());
    for (const card of res.newCanonCards) {
      expect(card.canonizedAt).toBe("2020-01-02T03:04:05.000Z");
    }
  });
});
