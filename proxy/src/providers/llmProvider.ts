import type {
  Beat,
  StoryBible,
  WizardAnswers,
  ArcShape,
  CardRole,
} from "@wwt/domain";
import { AGE_BANDS, INVARIANT_SPINE } from "@wwt/domain";
import { usingStubLlm } from "../config.js";

/**
 * Provider-agnostic LLM interface for prose + bible maintenance. Exact model
 * is TBD (SPEC.md §8) — pick a small/fast model at build time.
 */
export interface LlmProvider {
  /** Write the arc's beats inside the invariant spine, honoring bible + guardrails. */
  writeArc(input: {
    answers: WizardAnswers;
    shape: ArcShape;
    bible?: StoryBible;
  }): Promise<{ beats: Beat[] }>;

  /** Identify card-worthy NEW entities the story introduced (capped by caller). */
  extractNewEntities(input: {
    beats: Beat[];
    existingEntityIds: string[];
  }): Promise<Array<{ entityId: string; role: CardRole; appearanceNote: string }>>;

  /** After a book, summarize the arc + update the bible (returns the new bible). */
  updateBible(input: {
    priorBible: StoryBible | undefined;
    beats: Beat[];
    answers: WizardAnswers;
  }): Promise<StoryBible>;
}

/** STUB — deterministic placeholder prose so the pipeline runs end-to-end. */
export class StubLlmProvider implements LlmProvider {
  async writeArc(input: { answers: WizardAnswers; shape: ArcShape }): Promise<{ beats: Beat[] }> {
    const age = AGE_BANDS[input.answers.ageBand];
    // One beat per spine step; pad to the age's beat count with journey beats.
    const beats: Beat[] = INVARIANT_SPINE.map((spineBeat) => ({
      spineBeat,
      text: `[stub ${spineBeat}] a ${input.shape} story for ages ${age.approxAges}.`,
      dealtCardIds: [],
    }));
    return { beats };
  }
  async extractNewEntities() {
    return [
      { entityId: "hero", role: "hero" as CardRole, appearanceNote: "[stub hero]" },
      { entityId: "villain", role: "villain" as CardRole, appearanceNote: "[stub villain]" },
    ];
  }
  async updateBible(input: { priorBible: StoryBible | undefined }): Promise<StoryBible> {
    const b = input.priorBible ?? {
      entitySheets: [],
      eventLog: [],
      worldState: [],
      openThreads: [],
      virtuesTaught: [],
    };
    return b;
  }
}

/** Real LLM adapter — TODO wire once model + key are chosen. */
export class ApiLlmProvider implements LlmProvider {
  async writeArc(): Promise<{ beats: Beat[] }> {
    throw new Error("ApiLlmProvider.writeArc not implemented yet");
  }
  async extractNewEntities(): Promise<
    Array<{ entityId: string; role: CardRole; appearanceNote: string }>
  > {
    throw new Error("ApiLlmProvider.extractNewEntities not implemented yet");
  }
  async updateBible(): Promise<StoryBible> {
    throw new Error("ApiLlmProvider.updateBible not implemented yet");
  }
}

export function makeLlmProvider(): LlmProvider {
  return usingStubLlm() ? new StubLlmProvider() : new ApiLlmProvider();
}
