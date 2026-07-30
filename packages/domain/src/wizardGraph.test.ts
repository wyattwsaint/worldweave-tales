import { describe, expect, it } from "vitest";
import {
  AGE_BANDS,
  ARC_SHAPES,
  CURATED_VIRTUES,
  TIERS,
  type Tier,
} from "./index";
import {
  assembleRawPicks,
  getVisibleNodes,
  WIZARD_GRAPH,
  type NodeAnswers,
  type WizardNode,
} from "./wizardGraph";

const ALL_TIERS: Tier[] = ["beginner", "solid", "epic"];

describe("barrel public surface — regression for the index<->wizardGraph cycle", () => {
  // Guards against the temporal-dead-zone crash caused by the former circular
  // import (wizardGraph importing catalog consts from the ./index barrel). The
  // real failure only surfaces in the compiled ESM/CJS output; this test at
  // least pins that the barrel exposes both the catalog consts and the wizard
  // graph, non-empty, from a single import site.
  it("exposes TIERS and WIZARD_GRAPH together, both non-empty", () => {
    expect(Object.keys(TIERS).length).toBeGreaterThan(0);
    expect(WIZARD_GRAPH.length).toBeGreaterThan(0);
    expect(AGE_BANDS).toBeDefined();
    expect(ARC_SHAPES.length).toBeGreaterThan(0);
    expect(CURATED_VIRTUES.length).toBeGreaterThan(0);
  });
});

describe("WIZARD_GRAPH — well-formed schema", () => {
  it("has unique node ids", () => {
    const ids = WIZARD_GRAPH.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("single-select and dial nodes carry non-empty options", () => {
    for (const node of WIZARD_GRAPH) {
      if (node.kind === "single-select" || node.kind === "dial") {
        expect(node.options, `node ${node.id} needs options`).toBeDefined();
        expect(node.options!.length).toBeGreaterThan(0);
      }
    }
  });

  it("every node targets a real tier", () => {
    for (const node of WIZARD_GRAPH) {
      expect(node.tiers.length).toBeGreaterThan(0);
      for (const t of node.tiers) expect(ALL_TIERS).toContain(t);
    }
  });

  it("tier node is present in all three tiers and required", () => {
    const tier = WIZARD_GRAPH.find((n) => n.id === "tier")!;
    expect(tier.tiers).toEqual(ALL_TIERS);
    expect(tier.required).toBe(true);
    expect(tier.options).toEqual(Object.keys(TIERS));
  });

  it("wires the expected static option lists", () => {
    const ageBand = WIZARD_GRAPH.find((n) => n.id === "ageBand")!;
    expect(ageBand.options).toEqual(Object.keys(AGE_BANDS));
    const arcShape = WIZARD_GRAPH.find((n) => n.id === "arcShape")!;
    expect(arcShape.options).toEqual(ARC_SHAPES);
    const virtue = WIZARD_GRAPH.find((n) => n.id === "virtue")!;
    expect(virtue.options).toEqual(CURATED_VIRTUES);
    expect(virtue.default).toBe(CURATED_VIRTUES[0]);
  });
});

describe("getVisibleNodes — per tier baseline counts", () => {
  const count = (tier: Tier) => getVisibleNodes(tier, { tier }).length;

  it("beginner is within ±1 of wizardDepth", () => {
    expect(Math.abs(count("beginner") - TIERS.beginner.wizardDepth)).toBeLessThanOrEqual(1);
  });
  it("solid is within ±1 of wizardDepth", () => {
    expect(Math.abs(count("solid") - TIERS.solid.wizardDepth)).toBeLessThanOrEqual(1);
  });
  it("epic is within ±1 of wizardDepth", () => {
    expect(Math.abs(count("epic") - TIERS.epic.wizardDepth)).toBeLessThanOrEqual(1);
  });
});

describe("getVisibleNodes — inclusions / exclusions", () => {
  const ids = (tier: Tier, a: NodeAnswers = { tier }) =>
    getVisibleNodes(tier, a).map((n) => n.id);

  it("beginner excludes villain / arcShape / situation / directness / epic fillers", () => {
    const b = ids("beginner");
    expect(b).toContain("tier");
    expect(b).toContain("ageBand");
    expect(b).toContain("world");
    expect(b).toContain("hero");
    expect(b).toContain("virtue");
    expect(b).toContain("closingVerse");
    expect(b).not.toContain("villain");
    expect(b).not.toContain("arcShape");
    expect(b).not.toContain("situation");
    expect(b).not.toContain("directness");
    expect(b).not.toContain("setting");
  });

  it("solid adds villain / arcShape / situation but not directness or fillers", () => {
    const s = ids("solid");
    expect(s).toContain("villain");
    expect(s).toContain("arcShape");
    expect(s).toContain("situation");
    expect(s).not.toContain("directness");
    expect(s).not.toContain("setting");
  });

  it("epic includes directness and the epic fillers", () => {
    const e = ids("epic");
    expect(e).toContain("directness");
    for (const f of [
      "setting",
      "tone",
      "companion",
      "heroWish",
      "heroFlaw",
      "villainMotive",
      "stakes",
      "worldRule",
    ]) {
      expect(e).toContain(f);
    }
  });

  it("continueThread stays hidden unless threads were offered", () => {
    expect(ids("epic")).not.toContain("continueThread");
    expect(ids("epic", { tier: "epic", __hasThreads: true })).toContain("continueThread");
  });

  it("continuing a world hides world / hero / villain and offers newTwist (#10)", () => {
    const continuing: NodeAnswers = {
      tier: "epic",
      __continuing: true,
      __hasThreads: true,
      continueThread: "thread-7",
    };
    const v = getVisibleNodes("epic", continuing).map((n) => n.id);
    expect(v).toContain("continueThread");
    expect(v).toContain("newTwist");
    // Locked canon already answers these; re-asking invites contradictions.
    expect(v).not.toContain("world");
    expect(v).not.toContain("hero");
    expect(v).not.toContain("villain");
  });

  it("DECLINING the thread still hides the canon questions while continuing (#10)", () => {
    // The springboard is optional (SPEC #24 "never mandated") — declining it
    // must not resurrect world/hero/villain for a world that already has canon.
    const v = getVisibleNodes("epic", { tier: "epic", __continuing: true, __hasThreads: true }).map(
      (n) => n.id,
    );
    expect(v).not.toContain("world");
    expect(v).not.toContain("hero");
    expect(v).not.toContain("villain");
    expect(v).toContain("newTwist");
  });

  it("a brand-new world asks the canon questions and hides newTwist", () => {
    const v = ids("epic");
    expect(v).toContain("world");
    expect(v).toContain("hero");
    expect(v).toContain("villain");
    expect(v).not.toContain("newTwist");
  });

  it("assembles the continued world's twist into choices.newTwist", () => {
    const raw = assembleRawPicks({
      tier: "solid",
      ageBand: "toddler",
      __continuing: true,
      newTwist: "  the tiny door finally opens  ",
    });
    expect(raw.choices.newTwist).toBe("the tiny door finally opens");
    expect(raw.choices.world).toBeUndefined();
  });

  it("situation is gated by teachingFreeText", () => {
    // beginner has teachingFreeText=false → hidden even if it were tier-gated in
    expect(TIERS.beginner.teachingFreeText).toBe(false);
    expect(ids("beginner")).not.toContain("situation");
    expect(TIERS.solid.teachingFreeText).toBe(true);
    expect(ids("solid")).toContain("situation");
  });
});

describe("assembleRawPicks — routing", () => {
  it("routes field bindings (tier, ageBand, shape, closingVerse)", () => {
    const raw = assembleRawPicks({
      tier: "solid",
      ageBand: "preschool",
      arcShape: "rescue",
      closingVerse: true,
    });
    expect(raw.tier).toBe("solid");
    expect(raw.ageBand).toBe("preschool");
    expect(raw.shape).toBe("rescue");
    expect(raw.closingVerseEnabled).toBe(true);
  });

  it("routes virtue teaching binding", () => {
    const raw = assembleRawPicks({ tier: "beginner", ageBand: "toddler", virtue: "honesty" });
    expect(raw.virtue).toBe("honesty");
  });

  it("routes situation teaching binding", () => {
    const raw = assembleRawPicks({
      tier: "solid",
      ageBand: "preschool",
      situation: "starting a new school",
    });
    expect(raw.situation).toBe("starting a new school");
  });

  it("does not apply the DEFAULT virtue when a situation free-text is present (situation must win)", () => {
    // Solid/Epic parent free-texts a situation but never taps a virtue chip.
    // The virtue node's default must NOT fire, else buildWizardAnswers' virtue-wins
    // rule silently drops the situation (SPEC decision 26 — Epic free-text path).
    const solid = assembleRawPicks({
      tier: "solid",
      ageBand: "preschool",
      situation: "moving to a new town",
    });
    expect(solid.virtue).toBeUndefined();
    expect(solid.situation).toBe("moving to a new town");

    const epic = assembleRawPicks({
      tier: "epic",
      ageBand: "early-reader",
      situation: "a friend moved away",
    });
    expect(epic.virtue).toBeUndefined();
    expect(epic.situation).toBe("a friend moved away");
  });

  it("an EXPLICIT virtue still wins even when a situation is also given (locked virtue-wins rule)", () => {
    const raw = assembleRawPicks({
      tier: "epic",
      ageBand: "early-reader",
      virtue: "honesty",
      situation: "a friend moved away",
    });
    expect(raw.virtue).toBe("honesty");
  });

  it("maps directness dial to heavy boolean", () => {
    const explicit = assembleRawPicks({
      tier: "epic",
      ageBand: "early-reader",
      directness: "explicit",
    });
    expect(explicit.heavy).toBe(true);
    const subtle = assembleRawPicks({
      tier: "epic",
      ageBand: "early-reader",
      directness: "subtle",
    });
    expect(subtle.heavy).toBe(false);
    // default is 'balanced' → false
    const balanced = assembleRawPicks({ tier: "epic", ageBand: "early-reader" });
    expect(balanced.heavy).toBe(false);
  });

  it("routes choice bindings into raw.choices", () => {
    const raw = assembleRawPicks({
      tier: "epic",
      ageBand: "early-reader",
      world: "the floating isles",
      hero: "Pip the mouse",
      setting: "a windmill",
    });
    expect(raw.choices.world).toBe("the floating isles");
    expect(raw.choices.hero).toBe("Pip the mouse");
    expect(raw.choices.setting).toBe("a windmill");
  });

  it("omits blank choice/teaching values", () => {
    const raw = assembleRawPicks({
      tier: "beginner",
      ageBand: "toddler",
      world: "   ",
      hero: "",
      virtue: "  ",
    });
    expect(raw.choices.world).toBeUndefined();
    expect(raw.choices.hero).toBeUndefined();
    // an explicit blank virtue counts as answered → default does NOT re-apply
    expect(raw.virtue).toBeUndefined();
  });

  it("applies a node's default only when it is visible", () => {
    // virtue node is visible for beginner → default courage applied
    const b = assembleRawPicks({ tier: "beginner", ageBand: "toddler" });
    expect(b.virtue).toBe(CURATED_VIRTUES[0]);
    // directness node is epic-only → not applied for beginner
    expect(b.heavy).toBeUndefined();
  });

  it("carries continueThreadId and does not mint worldId", () => {
    const raw = assembleRawPicks({
      tier: "epic",
      ageBand: "early-reader",
      __hasThreads: true,
      continueThread: "thread-42",
    });
    expect(raw.continueThreadId).toBe("thread-42");
    expect(raw.worldId).toBeUndefined();
    // world/hero hidden when a thread is chosen → not carried
    expect(raw.choices.world).toBeUndefined();
    expect(raw.choices.hero).toBeUndefined();
  });

  it("produces a choices object even when empty", () => {
    const raw = assembleRawPicks({ tier: "beginner", ageBand: "toddler" });
    expect(raw.choices).toEqual({});
  });

  it("closingVerse default (false) applies when unanswered", () => {
    const raw = assembleRawPicks({ tier: "beginner", ageBand: "toddler" });
    expect(raw.closingVerseEnabled).toBe(false);
  });
});

// Type-level sanity: WizardNode shape is exported and usable.
const _sample: WizardNode = WIZARD_GRAPH[0];
void _sample;
