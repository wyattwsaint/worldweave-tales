import { describe, it, expect } from "vitest";
import { buildWizardAnswers } from "./buildWizardAnswers.js";

describe("buildWizardAnswers", () => {
  it("builds the virtue teachingPoint variant", () => {
    const answers = buildWizardAnswers({
      tier: "beginner",
      ageBand: "preschool",
      virtue: "courage",
      closingVerseEnabled: false,
      choices: { world: "Willowmere", hero: "Pip", villain: "The Gloom" },
    });
    expect(answers.teachingPoint).toEqual({ kind: "virtue", virtue: "courage" });
    expect(answers.tier).toBe("beginner");
    expect(answers.ageBand).toBe("preschool");
    expect(answers.closingVerseEnabled).toBe(false);
    expect(answers.choices).toEqual({
      world: "Willowmere",
      hero: "Pip",
      villain: "The Gloom",
    });
  });

  it("builds the situation teachingPoint variant with heavy flag", () => {
    const answers = buildWizardAnswers({
      tier: "solid",
      ageBand: "early-reader",
      shape: "rescue",
      situation: "a new sibling arriving",
      heavy: true,
      closingVerseEnabled: true,
      choices: { hero: "Mara" },
    });
    expect(answers.teachingPoint).toEqual({
      kind: "situation",
      description: "a new sibling arriving",
      heavy: true,
    });
    expect(answers.shape).toBe("rescue");
    expect(answers.closingVerseEnabled).toBe(true);
  });

  it("omits empty/whitespace free-text choices and trims values", () => {
    const answers = buildWizardAnswers({
      tier: "beginner",
      ageBand: "toddler",
      virtue: "kindness",
      choices: { world: "  Reef  ", hero: "", villain: "   " },
    });
    expect(answers.choices).toEqual({ world: "Reef" });
  });

  it("defaults closingVerseEnabled to false and passes through worldId/continueThreadId", () => {
    const answers = buildWizardAnswers({
      tier: "epic",
      ageBand: "preschool",
      virtue: "honesty",
      worldId: "world-1",
      continueThreadId: "thread-9",
      choices: {},
    });
    expect(answers.closingVerseEnabled).toBe(false);
    expect(answers.worldId).toBe("world-1");
    expect(answers.continueThreadId).toBe("thread-9");
    expect(answers.shape).toBeUndefined();
    expect(answers.choices).toEqual({});
  });

  it("throws when neither virtue nor situation is provided", () => {
    expect(() =>
      buildWizardAnswers({
        tier: "beginner",
        ageBand: "toddler",
        choices: {},
      } as never),
    ).toThrow();
  });
});
