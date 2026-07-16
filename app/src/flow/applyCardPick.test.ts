import { describe, it, expect } from "vitest";
import type { Card } from "@wwt/domain";
import { applyCardPick } from "./applyCardPick.js";

const baseCard: Card = {
  entityId: "hero-pip",
  role: "hero",
  canonName: "Pip",
  traits: ["small", "brave"],
  appearanceNote: "a small mouse in a red scarf",
  lockedImageRef: "",
  relationships: [],
  canonizedAt: "",
};

describe("applyCardPick", () => {
  it("locks the chosen image and stamps canonizedAt from now", () => {
    const now = new Date("2026-07-16T12:00:00.000Z");
    const picked = applyCardPick(baseCard, "stub-image:hero#1", now);
    expect(picked.lockedImageRef).toBe("stub-image:hero#1");
    expect(picked.canonizedAt).toBe("2026-07-16T12:00:00.000Z");
    expect(picked.entityId).toBe("hero-pip");
  });

  it("returns a new card and leaves the original unchanged", () => {
    const now = new Date("2026-07-16T12:00:00.000Z");
    const picked = applyCardPick(baseCard, "stub-image:hero#2", now);
    expect(picked).not.toBe(baseCard);
    expect(baseCard.lockedImageRef).toBe("");
    expect(baseCard.canonizedAt).toBe("");
    // nested arrays are copied, not shared
    picked.traits.push("mutated");
    expect(baseCard.traits).toEqual(["small", "brave"]);
  });

  it("throws when the chosen image ref is empty or whitespace", () => {
    const now = new Date();
    expect(() => applyCardPick(baseCard, "", now)).toThrow();
    expect(() => applyCardPick(baseCard, "   ", now)).toThrow();
  });
});
