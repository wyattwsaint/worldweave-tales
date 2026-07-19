import { describe, expect, it } from "vitest";
import type { Beat, Card, CardRole, CastMember } from "./index";

/**
 * CastMember is the TRANSIENT authoring-placement type on the LLM-provider return
 * boundary (Phase 2, ADR-0002 amendment). The model emits a `cast` array; the
 * pipeline (S2) later derives each `beat.dealtCardIds` by bucketing *retained*
 * cast by `firstBeatIndex`. It is NOT persisted on Arc/Beat — recurring cast
 * lives in the canon deck. This slice pins the type only; the bucketing/derivation
 * and Card creation belong to S2.
 */
describe("CastMember — transient LLM-boundary placement type (Phase 2 S1)", () => {
  const sample: CastMember = {
    entityId: "hero-1",
    role: "hero",
    appearanceNote: "a small brave field mouse in a red scarf",
    firstBeatIndex: 0,
  };

  it("carries exactly entityId, role, appearanceNote, firstBeatIndex", () => {
    expect(Object.keys(sample).sort()).toEqual([
      "appearanceNote",
      "entityId",
      "firstBeatIndex",
      "role",
    ]);
  });

  it("firstBeatIndex is the authored earliest-appearance bucket (a number)", () => {
    expect(typeof sample.firstBeatIndex).toBe("number");
    expect(sample.firstBeatIndex).toBe(0);
  });

  it("role reuses the canonical CardRole vocabulary", () => {
    const roles: CardRole[] = ["hero", "villain", "companion", "place", "artifact", "other"];
    for (const role of roles) {
      const member: CastMember = { entityId: "e", role, appearanceNote: "n", firstBeatIndex: 1 };
      expect(member.role).toBe(role);
    }
  });

  it("structurally seeds the canon Card it becomes (entityId/role/appearanceNote align)", () => {
    // S2 canonizes each retained cast member into a Card; the shared fields must line up.
    const seed: Pick<Card, "entityId" | "role" | "appearanceNote"> = {
      entityId: sample.entityId,
      role: sample.role,
      appearanceNote: sample.appearanceNote,
    };
    expect(seed).toEqual({
      entityId: "hero-1",
      role: "hero",
      appearanceNote: "a small brave field mouse in a red scarf",
    });
  });
});

// Compile-time sanity (mirrors wizardGraph.test.ts' _sample pattern). Beat already
// carries the derived `dealtCardIds`; S1 adds no Arc/Beat schema change.
const _castSanity: CastMember = {
  entityId: "villain-1",
  role: "villain",
  appearanceNote: "a shadow that forgets how to be kind",
  firstBeatIndex: 2,
};
void _castSanity;
const _beatDerivesFromCast: Pick<Beat, "dealtCardIds"> = {
  dealtCardIds: [_castSanity.entityId],
};
void _beatDerivesFromCast;
