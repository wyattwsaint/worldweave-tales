import { describe, it, expect } from "vitest";
import type { CastMember } from "@wwt/domain";
import {
  diffCastAgainstCanon,
  capNewCast,
  deriveDealtCardIds,
} from "./castResolution.js";

/** Terse cast-member factory for the tables below. */
function member(
  entityId: string,
  role: CastMember["role"],
  firstBeatIndex: number,
): CastMember {
  return { entityId, role, appearanceNote: `${entityId} note`, firstBeatIndex };
}

// --- diffCastAgainstCanon -------------------------------------------------

describe("diffCastAgainstCanon", () => {
  it("splits cast into recurring (already canon) vs fresh (new)", () => {
    const cast = [
      member("hero", "hero", 0),
      member("dragon", "villain", 2),
      member("owl", "companion", 1),
    ];
    const { recurring, fresh } = diffCastAgainstCanon(cast, ["hero", "owl"]);
    expect(recurring.map((m) => m.entityId)).toEqual(["hero", "owl"]);
    expect(fresh.map((m) => m.entityId)).toEqual(["dragon"]);
  });

  it("returns empty buckets for an empty cast", () => {
    expect(diffCastAgainstCanon([], ["hero"])).toEqual({ recurring: [], fresh: [] });
  });

  it("treats every member as fresh when there is no canon yet (new world)", () => {
    const cast = [member("hero", "hero", 0), member("dragon", "villain", 1)];
    const { recurring, fresh } = diffCastAgainstCanon(cast, []);
    expect(recurring).toEqual([]);
    expect(fresh.map((m) => m.entityId)).toEqual(["hero", "dragon"]);
  });

  it("dedupes a duplicate entityId to its earliest firstBeatIndex", () => {
    const cast = [
      member("hero", "hero", 3),
      member("hero", "hero", 1), // same entity, earlier appearance
      member("dragon", "villain", 2),
    ];
    const { fresh } = diffCastAgainstCanon(cast, []);
    expect(fresh).toHaveLength(2);
    const hero = fresh.find((m) => m.entityId === "hero");
    expect(hero?.firstBeatIndex).toBe(1);
  });
});

// --- capNewCast -----------------------------------------------------------

describe("capNewCast", () => {
  it("keeps everything when the cap is not exceeded", () => {
    const fresh = [member("owl", "companion", 1), member("glade", "place", 0)];
    const { kept, dropped } = capNewCast(fresh, 3);
    expect(kept).toHaveLength(2);
    expect(dropped).toEqual([]);
  });

  it("fills remaining slots from the rest in firstBeatIndex order", () => {
    const fresh = [
      member("late", "companion", 5),
      member("early", "place", 0),
      member("mid", "artifact", 2),
    ];
    const { kept, dropped } = capNewCast(fresh, 2);
    expect(kept.map((m) => m.entityId)).toEqual(["early", "mid"]);
    expect(dropped.map((m) => m.entityId)).toEqual(["late"]);
  });

  it("lets must-keeps (hero + villain) override the cap even when cap < 2", () => {
    const fresh = [
      member("hero", "hero", 0),
      member("villain", "villain", 1),
      member("owl", "companion", 2),
    ];
    const { kept, dropped } = capNewCast(fresh, 1);
    // both must-keeps survive despite cap=1; no room left for the companion
    expect(kept.map((m) => m.entityId).sort()).toEqual(["hero", "villain"]);
    expect(dropped.map((m) => m.entityId)).toEqual(["owl"]);
  });

  it("keeps must-keeps AND fills leftover slots from the rest", () => {
    const fresh = [
      member("hero", "hero", 0),
      member("owl", "companion", 3),
      member("glade", "place", 1),
    ];
    const { kept } = capNewCast(fresh, 2);
    // 1 must-keep (hero) + 1 leftover slot -> earliest of the rest (glade)
    expect(kept.map((m) => m.entityId)).toEqual(["hero", "glade"]);
  });

  it("returns empty for an empty fresh list", () => {
    expect(capNewCast([], 2)).toEqual({ kept: [], dropped: [] });
  });
});

// --- deriveDealtCardIds ---------------------------------------------------

describe("deriveDealtCardIds", () => {
  it("buckets survivors into per-beat dealtCardIds by firstBeatIndex", () => {
    const survivors = [
      member("hero", "hero", 0),
      member("owl", "companion", 0),
      member("dragon", "villain", 2),
    ];
    const dealt = deriveDealtCardIds(survivors, 3);
    expect(dealt).toEqual([["hero", "owl"], [], ["dragon"]]);
  });

  it("clamps a firstBeatIndex past the last beat onto the final beat (no dangling)", () => {
    const survivors = [member("straggler", "companion", 9)];
    const dealt = deriveDealtCardIds(survivors, 3);
    expect(dealt).toEqual([[], [], ["straggler"]]);
  });

  it("clamps a negative firstBeatIndex onto the first beat", () => {
    const survivors = [member("early", "place", -4)];
    const dealt = deriveDealtCardIds(survivors, 2);
    expect(dealt).toEqual([["early"], []]);
  });

  it("returns one empty array per beat for an empty survivor list", () => {
    expect(deriveDealtCardIds([], 3)).toEqual([[], [], []]);
  });

  it("returns no buckets when there are zero beats", () => {
    expect(deriveDealtCardIds([member("hero", "hero", 0)], 0)).toEqual([]);
  });

  it("does not deal the same entityId twice into one beat", () => {
    const survivors = [member("hero", "hero", 0), member("hero", "hero", 0)];
    expect(deriveDealtCardIds(survivors, 1)).toEqual([["hero"]]);
  });
});
