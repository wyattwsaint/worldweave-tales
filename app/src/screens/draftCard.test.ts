import { describe, it, expect } from "vitest";
import type { GeneratedCardChoice } from "@wwt/domain";
import { draftCard } from "./CardPickScreen";

/**
 * draftCard must carry the cast member's REAL entityId (threaded through the
 * pending choice) onto the canonized Card — NOT the role. For a real LLM whose
 * hero entityId is e.g. "prince-alden", the beat's dealtCardIds hold
 * "prince-alden", so the Card must too or ViewerScreen's byId lookup misses and
 * the art silently never renders.
 */
describe("draftCard", () => {
  it("uses the choice's real entityId (not the role) so it matches dealtCardIds", () => {
    const choice: GeneratedCardChoice = {
      entityId: "prince-alden",
      role: "hero",
      appearanceNote: "a young prince in a blue cloak",
      variantImageRefs: ["https://cdn/hero-a.png"],
    };
    const card = draftCard(choice, "Alden");
    expect(card.entityId).toBe("prince-alden");
    expect(card.role).toBe("hero");
    expect(card.canonName).toBe("Alden");
    // appearanceNote mirrors the art the variants were generated from.
    expect(card.appearanceNote).toBe("a young prince in a blue cloak");
  });
});
