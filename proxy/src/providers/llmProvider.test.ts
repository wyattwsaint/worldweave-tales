import { describe, it, expect, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import type { WizardAnswers, StoryBible, Beat } from "@wwt/domain";
import {
  ApiLlmProvider,
  anthropicClientOptions,
  type LlmClient,
} from "./llmProvider.js";

// --- helpers -------------------------------------------------------------

/** A fake Anthropic client that returns a single text block, and records the
 *  request body it was called with so tests can assert request shape. */
function fakeClient(text: string) {
  const create = vi.fn(
    async (_params: Anthropic.MessageCreateParamsNonStreaming) => ({
      content: [{ type: "text" as const, text }],
    }),
  );
  const client: LlmClient = { messages: { create } };
  return { client, create };
}

/** A fake client that returns each text in turn (last text repeats once the
 *  list is exhausted), so tests can exercise the repair-retry loop. */
function fakeClientSeq(...texts: string[]) {
  let i = 0;
  const create = vi.fn(
    async (_params: Anthropic.MessageCreateParamsNonStreaming) => {
      const text = texts[Math.min(i, texts.length - 1)];
      i += 1;
      return { content: [{ type: "text" as const, text }] };
    },
  );
  const client: LlmClient = { messages: { create } };
  return { client, create };
}

const answers: WizardAnswers = {
  tier: "beginner",
  ageBand: "preschool",
  shape: "quest",
  teachingPoint: { kind: "virtue", virtue: "courage" },
  closingVerseEnabled: false,
  choices: { hero: "a brave mouse" },
};

const bible: StoryBible = {
  entitySheets: [],
  eventLog: [],
  worldState: [],
  openThreads: [],
  virtuesTaught: [],
};

const beats: Beat[] = [
  { spineBeat: "setup", text: "Once upon a time.", dealtCardIds: [] },
];

/** All five invariant spine beats, in order — a spine-complete arc. */
const fullSpineBeats: Beat[] = [
  { spineBeat: "setup", text: "A start.", dealtCardIds: ["hero"] },
  { spineBeat: "call-to-adventure", text: "A call.", dealtCardIds: [] },
  { spineBeat: "virtue-tested", text: "A test.", dealtCardIds: [] },
  { spineBeat: "good-triumphs", text: "All safe.", dealtCardIds: [] },
  { spineBeat: "gentle-hope-hook", text: "A gentle hook.", dealtCardIds: [] },
];

// --- config knob ---------------------------------------------------------

describe("anthropicClientOptions", () => {
  it("omits baseURL when the knob is empty (uses Anthropic default)", () => {
    const opts = anthropicClientOptions({ apiKey: "k", model: "m", baseUrl: "" });
    expect(opts.apiKey).toBe("k");
    expect("baseURL" in opts).toBe(false);
  });

  it("honors LLM_BASE_URL when set (points at a local shim)", () => {
    const opts = anthropicClientOptions({
      apiKey: "k",
      model: "m",
      baseUrl: "http://localhost:9999",
    });
    expect(opts.baseURL).toBe("http://localhost:9999");
  });
});

// --- writeArc ------------------------------------------------------------

describe("ApiLlmProvider.writeArc", () => {
  it("sends the model + prompt and parses beats from the response", async () => {
    const { client, create } = fakeClient(
      JSON.stringify({ beats: fullSpineBeats }),
    );
    const provider = new ApiLlmProvider({
      client,
      model: "claude-haiku-4-5",
    });

    const result = await provider.writeArc({ answers, shape: "quest", bible });

    expect(result.beats).toHaveLength(5);
    // Beats are PROSE-ONLY now — the model no longer emits dealtCardIds
    // (the pipeline derives placement from cast.firstBeatIndex), so the fence's
    // stray dealtCardIds must be stripped, not surfaced.
    expect(result.beats[0]).toEqual({ spineBeat: "setup", text: "A start." });

    // request shape: model honored + prompt carries the shape/teaching point
    const body = create.mock.calls[0][0];
    expect(body.model).toBe("claude-haiku-4-5");
    const promptText = JSON.stringify(body.messages);
    expect(promptText).toContain("quest");
    expect(promptText).toContain("courage");
  });

  it("parses the merged {beats, cast} authoring reply (one call, not two)", async () => {
    const { client, create } = fakeClient(
      JSON.stringify({
        beats: fullSpineBeats.map(({ spineBeat, text }) => ({ spineBeat, text })),
        cast: [
          { entityId: "hero", role: "hero", appearanceNote: "a brave mouse", firstBeatIndex: 0 },
          { entityId: "dragon", role: "villain", appearanceNote: "green scales", firstBeatIndex: 2 },
        ],
      }),
    );
    const provider = new ApiLlmProvider({ client, model: "claude-haiku-4-5" });

    const result = await provider.writeArc({ answers, shape: "quest", bible });

    expect(result.beats).toHaveLength(5);
    expect(result.cast).toEqual([
      { entityId: "hero", role: "hero", appearanceNote: "a brave mouse", firstBeatIndex: 0 },
      { entityId: "dragon", role: "villain", appearanceNote: "green scales", firstBeatIndex: 2 },
    ]);
    // A SINGLE model round-trip produced both prose and cast.
    expect(create).toHaveBeenCalledTimes(1);
    // The prompt asks for both beats and cast-with-firstBeatIndex.
    const promptText = JSON.stringify(create.mock.calls[0][0].messages);
    expect(promptText).toContain("cast");
    expect(promptText).toContain("firstBeatIndex");
  });

  it("defaults an empty cast when the model omits it", async () => {
    const { client } = fakeClient(
      JSON.stringify({
        beats: fullSpineBeats.map(({ spineBeat, text }) => ({ spineBeat, text })),
      }),
    );
    const provider = new ApiLlmProvider({ client, model: "claude-haiku-4-5" });
    const result = await provider.writeArc({ answers, shape: "quest", bible });
    expect(result.cast).toEqual([]);
  });

  it("coerces a cast firstBeatIndex from a string and defaults a missing one to 0", async () => {
    const { client } = fakeClient(
      JSON.stringify({
        beats: fullSpineBeats.map(({ spineBeat, text }) => ({ spineBeat, text })),
        cast: [
          { entityId: "hero", role: "hero", appearanceNote: "mouse", firstBeatIndex: "1" },
          { entityId: "glade", role: "place", appearanceNote: "a green glade" },
        ],
      }),
    );
    const provider = new ApiLlmProvider({ client, model: "claude-haiku-4-5" });
    const result = await provider.writeArc({ answers, shape: "quest", bible });
    expect(result.cast[0].firstBeatIndex).toBe(1);
    expect(result.cast[1].firstBeatIndex).toBe(0);
    expect(result.cast[1].appearanceNote).toBe("a green glade");
  });

  it("throws on a cast member with a bad role enum", async () => {
    const { client } = fakeClient(
      JSON.stringify({
        beats: fullSpineBeats.map(({ spineBeat, text }) => ({ spineBeat, text })),
        cast: [{ entityId: "x", role: "wizard", appearanceNote: "n", firstBeatIndex: 0 }],
      }),
    );
    const provider = new ApiLlmProvider({ client, model: "claude-haiku-4-5" });
    await expect(
      provider.writeArc({ answers, shape: "quest", bible }),
    ).rejects.toThrow();
  });

  it("pins spineBeat to the exact enum literals in the prompt (no generic beat names)", async () => {
    const { client, create } = fakeClient(
      JSON.stringify({ beats: fullSpineBeats }),
    );
    const provider = new ApiLlmProvider({ client, model: "claude-haiku-4-5" });

    await provider.writeArc({ answers, shape: "quest", bible });
    const promptText = JSON.stringify(create.mock.calls[0][0].messages);
    // every allowed enum value spelled out
    expect(promptText).toContain("setup");
    expect(promptText).toContain("gentle-hope-hook");
    // and an explicit directive to use ONLY those literals — the guard against
    // the model substituting "rising-action"/"climax"/etc.
    expect(promptText).toMatch(/exactly one of these/i);
  });

  it("parses beats even when the model wraps JSON in a ```json code fence", async () => {
    const { client } = fakeClient(
      "```json\n" + JSON.stringify({ beats: fullSpineBeats }) + "\n```",
    );
    const provider = new ApiLlmProvider({ client, model: "claude-haiku-4-5" });

    const result = await provider.writeArc({ answers, shape: "quest", bible });
    expect(result.beats).toHaveLength(5);
  });

  it("throws when the arc is missing a spine beat (e.g. the safe ending)", async () => {
    const missingEnding = fullSpineBeats.filter(
      (b) => b.spineBeat !== "good-triumphs",
    );
    const { client } = fakeClient(JSON.stringify({ beats: missingEnding }));
    const provider = new ApiLlmProvider({ client, model: "claude-haiku-4-5" });
    await expect(
      provider.writeArc({ answers, shape: "quest", bible }),
    ).rejects.toThrow();
  });

  it("throws when spine beats are out of order", async () => {
    const reversed = [...fullSpineBeats].reverse();
    const { client } = fakeClient(JSON.stringify({ beats: reversed }));
    const provider = new ApiLlmProvider({ client, model: "claude-haiku-4-5" });
    await expect(
      provider.writeArc({ answers, shape: "quest", bible }),
    ).rejects.toThrow();
  });

  it("throws on a malformed (non-JSON) response", async () => {
    const { client } = fakeClient("sorry, I can't do that");
    const provider = new ApiLlmProvider({ client, model: "claude-haiku-4-5" });
    await expect(
      provider.writeArc({ answers, shape: "quest", bible }),
    ).rejects.toThrow();
  });

  it("retries and self-corrects when the first reply has a bad spineBeat enum", async () => {
    const badBeats = [
      { spineBeat: "rising-action", text: "x", dealtCardIds: [] },
    ];
    const { client, create } = fakeClientSeq(
      JSON.stringify({ beats: badBeats }),
      JSON.stringify({ beats: fullSpineBeats }),
    );
    const provider = new ApiLlmProvider({ client, model: "claude-haiku-4-5" });

    const result = await provider.writeArc({ answers, shape: "quest", bible });
    expect(result.beats).toHaveLength(5);
    // one repair round: two model calls total
    expect(create).toHaveBeenCalledTimes(2);
    // the repair turn echoes the bad reply + asks for corrected JSON
    const repairMessages = create.mock.calls[1][0].messages;
    expect(repairMessages).toHaveLength(3);
    expect(repairMessages[1].role).toBe("assistant");
    expect(JSON.stringify(repairMessages[2])).toMatch(/corrected JSON/i);
  });

  it("throws after exhausting retries when every reply is invalid", async () => {
    const { client, create } = fakeClientSeq(
      JSON.stringify({ beats: [{ spineBeat: "climax", text: "x", dealtCardIds: [] }] }),
    );
    const provider = new ApiLlmProvider({ client, model: "claude-haiku-4-5" });

    await expect(
      provider.writeArc({ answers, shape: "quest", bible }),
    ).rejects.toThrow();
    // initial attempt + 1 retry
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("throws when the JSON is shaped wrong (bad spineBeat)", async () => {
    const { client } = fakeClient(
      JSON.stringify({ beats: [{ spineBeat: "not-a-beat", text: "x", dealtCardIds: [] }] }),
    );
    const provider = new ApiLlmProvider({ client, model: "claude-haiku-4-5" });
    await expect(
      provider.writeArc({ answers, shape: "quest", bible }),
    ).rejects.toThrow();
  });
});

// --- updateBible ---------------------------------------------------------

describe("ApiLlmProvider.updateBible", () => {
  it("parses a returned StoryBible", async () => {
    const nextBible: StoryBible = {
      entitySheets: [{ entityId: "hero", facts: ["brave"], appearanceNote: "mouse", relationships: [] }],
      eventLog: [{ arcId: "arc-1", summary: "won", lessonTaught: "courage" }],
      worldState: ["peace"],
      openThreads: [],
      virtuesTaught: ["courage"],
    };
    const { client } = fakeClient(JSON.stringify(nextBible));
    const provider = new ApiLlmProvider({ client, model: "claude-haiku-4-5" });

    const result = await provider.updateBible({ priorBible: bible, beats, answers });
    expect(result).toEqual(nextBible);
  });

  it("throws on malformed bible json", async () => {
    const { client } = fakeClient(JSON.stringify({ entitySheets: "nope" }));
    const provider = new ApiLlmProvider({ client, model: "claude-haiku-4-5" });
    await expect(
      provider.updateBible({ priorBible: undefined, beats, answers }),
    ).rejects.toThrow();
  });

  it("coerces an entitySheet whose relationships came back as an object", async () => {
    const malformed = {
      entitySheets: [
        {
          entityId: "hero",
          facts: ["brave"],
          appearanceNote: "mouse",
          // model returned an object instead of the schema's string[]
          relationships: { mentor: "owl", rival: "dragon" },
        },
      ],
      eventLog: [],
      worldState: [],
      openThreads: [],
      virtuesTaught: [],
    };
    const { client } = fakeClient(JSON.stringify(malformed));
    const provider = new ApiLlmProvider({ client, model: "claude-haiku-4-5" });

    const result = await provider.updateBible({ priorBible: bible, beats, answers });
    expect(result.entitySheets[0].relationships).toEqual([
      "mentor: owl",
      "rival: dragon",
    ]);
  });

  it("coerces relationships returned as an array of objects", async () => {
    const malformed = {
      entitySheets: [
        {
          entityId: "hero",
          facts: ["brave"],
          appearanceNote: "mouse",
          relationships: [{ entityId: "owl", relation: "mentor" }],
        },
      ],
      eventLog: [],
      worldState: [],
      openThreads: [],
      virtuesTaught: [],
    };
    const { client } = fakeClient(JSON.stringify(malformed));
    const provider = new ApiLlmProvider({ client, model: "claude-haiku-4-5" });

    const result = await provider.updateBible({ priorBible: bible, beats, answers });
    expect(result.entitySheets[0].relationships).toEqual([
      JSON.stringify({ entityId: "owl", relation: "mentor" }),
    ]);
  });

  it("treats explicit null facts/appearanceNote/relationships as empty", async () => {
    const nulls = {
      entitySheets: [
        { entityId: "hero", facts: null, appearanceNote: null, relationships: null },
      ],
      eventLog: [],
      worldState: [],
      openThreads: [],
      virtuesTaught: [],
    };
    const { client } = fakeClient(JSON.stringify(nulls));
    const provider = new ApiLlmProvider({ client, model: "claude-haiku-4-5" });

    const result = await provider.updateBible({ priorBible: bible, beats, answers });
    expect(result.entitySheets[0]).toEqual({
      entityId: "hero",
      facts: [],
      appearanceNote: "",
      relationships: [],
    });
  });

  it("defaults missing facts/appearanceNote/relationships on an entitySheet", async () => {
    const sparse = {
      entitySheets: [{ entityId: "hero" }],
      eventLog: [],
      worldState: [],
      openThreads: [],
      virtuesTaught: [],
    };
    const { client } = fakeClient(JSON.stringify(sparse));
    const provider = new ApiLlmProvider({ client, model: "claude-haiku-4-5" });

    const result = await provider.updateBible({ priorBible: bible, beats, answers });
    expect(result.entitySheets[0]).toEqual({
      entityId: "hero",
      facts: [],
      appearanceNote: "",
      relationships: [],
    });
  });

  it("accepts a partial bible that omits whole top-level arrays", async () => {
    // The model frequently returns only the sections it changed; the missing
    // arrays must default to [] rather than 500 the whole generation.
    const partial = { entitySheets: [{ entityId: "hero" }] };
    const { client } = fakeClient(JSON.stringify(partial));
    const provider = new ApiLlmProvider({ client, model: "claude-haiku-4-5" });

    const result = await provider.updateBible({ priorBible: bible, beats, answers });
    expect(result.eventLog).toEqual([]);
    expect(result.worldState).toEqual([]);
    expect(result.openThreads).toEqual([]);
    expect(result.virtuesTaught).toEqual([]);
  });

  it("coerces worldState entries returned as objects/numbers into strings", async () => {
    const malformed = {
      entitySheets: [],
      eventLog: [],
      // model returned structured facts instead of the schema's string[]
      worldState: [{ fact: "the kingdom is at peace" }, 7],
      openThreads: [],
      virtuesTaught: [],
    };
    const { client } = fakeClient(JSON.stringify(malformed));
    const provider = new ApiLlmProvider({ client, model: "claude-haiku-4-5" });

    const result = await provider.updateBible({ priorBible: bible, beats, answers });
    expect(result.worldState).toEqual([
      JSON.stringify({ fact: "the kingdom is at peace" }),
      "7",
    ]);
  });

  it("defaults an eventLog row that omits lessonTaught/arcId/summary", async () => {
    const malformed = {
      entitySheets: [],
      eventLog: [{ summary: "the arc happened" }],
      worldState: [],
      openThreads: [],
      virtuesTaught: [],
    };
    const { client } = fakeClient(JSON.stringify(malformed));
    const provider = new ApiLlmProvider({ client, model: "claude-haiku-4-5" });

    const result = await provider.updateBible({ priorBible: bible, beats, answers });
    expect(result.eventLog[0]).toEqual({
      arcId: "",
      summary: "the arc happened",
      lessonTaught: "",
    });
  });

  it("drops an unknown villainResolution instead of rejecting the bible", async () => {
    const malformed = {
      entitySheets: [],
      eventLog: [
        { arcId: "a1", summary: "s", lessonTaught: "courage", villainResolution: "reformed" },
      ],
      worldState: [],
      openThreads: [],
      virtuesTaught: [],
    };
    const { client } = fakeClient(JSON.stringify(malformed));
    const provider = new ApiLlmProvider({ client, model: "claude-haiku-4-5" });

    const result = await provider.updateBible({ priorBible: bible, beats, answers });
    expect(result.eventLog[0].villainResolution).toBeUndefined();
  });

  it("defaults an openThread row that omits resolved and its ids", async () => {
    const malformed = {
      entitySheets: [],
      eventLog: [],
      worldState: [],
      openThreads: [{ teaser: "a door left ajar" }],
      virtuesTaught: [],
    };
    const { client } = fakeClient(JSON.stringify(malformed));
    const provider = new ApiLlmProvider({ client, model: "claude-haiku-4-5" });

    const result = await provider.updateBible({ priorBible: bible, beats, answers });
    expect(result.openThreads[0]).toEqual({
      id: "",
      teaser: "a door left ajar",
      originArcId: "",
      resolved: false,
    });
  });

  it("spells out the exact entitySheets field contract in the prompt", async () => {
    const nextBible: StoryBible = {
      entitySheets: [],
      eventLog: [],
      worldState: [],
      openThreads: [],
      virtuesTaught: [],
    };
    const { client, create } = fakeClient(JSON.stringify(nextBible));
    const provider = new ApiLlmProvider({ client, model: "claude-haiku-4-5" });

    await provider.updateBible({ priorBible: bible, beats, answers });
    const promptText = JSON.stringify(create.mock.calls[0][0].messages);
    // entitySheets must be pinned field-by-field, not left as "[...]"
    expect(promptText).toContain("relationships");
    expect(promptText).toContain("facts");
  });
});
