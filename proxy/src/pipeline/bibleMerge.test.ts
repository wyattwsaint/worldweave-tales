import { describe, expect, it } from "vitest";
import type { StoryBible } from "@wwt/domain";
import { mergeBible } from "./bibleMerge.js";

const empty: StoryBible = {
  entitySheets: [],
  eventLog: [],
  worldState: [],
  openThreads: [],
  virtuesTaught: [],
};

function bible(overrides: Partial<StoryBible> = {}): StoryBible {
  return { ...empty, ...overrides };
}

const prior = bible({
  entitySheets: [
    { entityId: "pip", facts: ["brave"], appearanceNote: "a mouse in a red cloak", relationships: ["gloom"] },
  ],
  eventLog: [{ arcId: "arc-1", summary: "Pip faced the shadow.", lessonTaught: "courage" }],
  worldState: ["The shadow was calmed."],
  openThreads: [{ id: "t1", teaser: "A tiny door was left ajar.", originArcId: "arc-1", resolved: false }],
  virtuesTaught: ["courage"],
});

describe("mergeBible — the model's bible is a DELTA, never a replacement", () => {
  it("keeps prior canon a model dropped entirely", () => {
    const merged = mergeBible({ prior, authored: empty, arcId: "arc-2", virtueTaught: "patience" });

    expect(merged.entitySheets.map((s) => s.entityId)).toEqual(["pip"]);
    expect(merged.eventLog.map((e) => e.arcId)).toEqual(["arc-1", "arc-2"]);
    expect(merged.worldState).toEqual(["The shadow was calmed."]);
    expect(merged.openThreads.map((t) => t.id)).toEqual(["t1"]);
  });

  it("appends new sheets and grows existing ones without losing prior facts", () => {
    const merged = mergeBible({
      prior,
      authored: bible({
        entitySheets: [
          { entityId: "pip", facts: ["patient"], appearanceNote: "REDESCRIBED", relationships: ["fern"] },
          { entityId: "fern", facts: ["loyal"], appearanceNote: "a green sparrow", relationships: [] },
        ],
      }),
      arcId: "arc-2",
      virtueTaught: "patience",
    });

    const pip = merged.entitySheets.find((s) => s.entityId === "pip")!;
    expect(pip.facts).toEqual(["brave", "patient"]);
    expect(pip.relationships).toEqual(["gloom", "fern"]);
    // The note mirrors art locked forever — the model cannot redraw it in words.
    expect(pip.appearanceNote).toBe("a mouse in a red cloak");
    expect(merged.entitySheets.map((s) => s.entityId)).toEqual(["pip", "fern"]);
  });

  it("logs exactly one row for this arc, stamped with OUR arcId", () => {
    const merged = mergeBible({
      prior,
      authored: bible({
        eventLog: [
          { arcId: "hallucinated-id", summary: "Pip waited for the door.", lessonTaught: "patience" },
        ],
      }),
      arcId: "arc-2",
      virtueTaught: "patience",
    });

    expect(merged.eventLog).toHaveLength(2);
    expect(merged.eventLog[1]).toMatchObject({
      arcId: "arc-2",
      summary: "Pip waited for the door.",
      lessonTaught: "patience",
    });
  });

  it("falls back to the wizard's virtue when the model logged no lesson", () => {
    const merged = mergeBible({ prior, authored: empty, arcId: "arc-2", virtueTaught: "patience" });
    expect(merged.eventLog.at(-1)).toMatchObject({ arcId: "arc-2", lessonTaught: "patience" });
  });

  it("records the virtue per arc, repeats included (reinforcement is signal)", () => {
    const merged = mergeBible({ prior, authored: empty, arcId: "arc-2", virtueTaught: "courage" });
    expect(merged.virtuesTaught).toEqual(["courage", "courage"]);
  });

  it("appends only genuinely new world-state facts", () => {
    const merged = mergeBible({
      prior,
      authored: bible({ worldState: ["The shadow was calmed.", "The door stands open."] }),
      arcId: "arc-2",
      virtueTaught: "patience",
    });
    expect(merged.worldState).toEqual(["The shadow was calmed.", "The door stands open."]);
  });
});

describe("mergeBible — open threads", () => {
  it("resolves the springboard the parent continued", () => {
    const merged = mergeBible({
      prior,
      authored: empty,
      arcId: "arc-2",
      virtueTaught: "patience",
      continueThreadId: "t1",
    });
    expect(merged.openThreads.find((t) => t.id === "t1")?.resolved).toBe(true);
  });

  it("leaves an un-continued thread open and adds this arc's new hook", () => {
    const merged = mergeBible({
      prior,
      authored: bible({
        openThreads: [{ id: "t2", teaser: "A lantern still burns on the hill.", originArcId: "", resolved: false }],
      }),
      arcId: "arc-2",
      virtueTaught: "patience",
    });

    expect(merged.openThreads.map((t) => [t.id, t.resolved])).toEqual([
      ["t1", false],
      ["t2", false],
    ]);
    // A model that left the origin blank still gets a real one.
    expect(merged.openThreads[1].originArcId).toBe("arc-2");
  });

  it("drops teaser-less hooks and mints ids for the rest", () => {
    const merged = mergeBible({
      prior: undefined,
      authored: bible({
        openThreads: [
          { id: "", teaser: "  ", originArcId: "", resolved: false },
          { id: "", teaser: "Someone waved from the far shore.", originArcId: "", resolved: false },
        ],
      }),
      arcId: "arc-1",
      virtueTaught: "kindness",
    });

    expect(merged.openThreads).toHaveLength(1);
    expect(merged.openThreads[0].id).toBe("arc-1-thread-0");
  });

  it("never re-opens a thread resolved in a prior arc", () => {
    const resolvedPrior = bible({
      openThreads: [{ id: "t1", teaser: "A tiny door was left ajar.", originArcId: "arc-1", resolved: true }],
    });
    const merged = mergeBible({
      prior: resolvedPrior,
      authored: bible({
        openThreads: [{ id: "t1", teaser: "A tiny door was left ajar.", originArcId: "arc-1", resolved: false }],
      }),
      arcId: "arc-2",
      virtueTaught: "patience",
    });
    expect(merged.openThreads).toHaveLength(1);
    expect(merged.openThreads[0].resolved).toBe(true);
  });
});

describe("mergeBible — a world's first arc", () => {
  it("takes the model's bible whole when there is no prior canon", () => {
    const authored = bible({
      entitySheets: [{ entityId: "pip", facts: ["brave"], appearanceNote: "a mouse", relationships: [] }],
      eventLog: [{ arcId: "whatever", summary: "It began.", lessonTaught: "courage" }],
      worldState: ["All is calm."],
    });
    const merged = mergeBible({ authored, arcId: "arc-1", virtueTaught: "courage" });

    expect(merged.entitySheets).toHaveLength(1);
    expect(merged.eventLog).toEqual([{ arcId: "arc-1", summary: "It began.", lessonTaught: "courage" }]);
    expect(merged.worldState).toEqual(["All is calm."]);
    expect(merged.virtuesTaught).toEqual(["courage"]);
  });
});
