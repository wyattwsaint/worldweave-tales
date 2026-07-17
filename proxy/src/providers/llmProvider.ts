import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type {
  Beat,
  StoryBible,
  WizardAnswers,
  ArcShape,
  CardRole,
} from "@wwt/domain";
import { AGE_BANDS, INVARIANT_SPINE, GUARDRAILS } from "@wwt/domain";
import { config, usingStubLlm } from "../config.js";

/** Fallback model if LLM_MODEL is not configured. A small/fast model (SPEC §8). */
const DEFAULT_MODEL = "claude-haiku-4-5";

/**
 * Output-token ceiling. Sized so a full arc or an accumulated StoryBible does
 * not truncate mid-JSON (a truncated body fails JSON.parse and drops the whole
 * generation). Well within Haiku 4.5's output limit.
 */
const MAX_TOKENS = 16384;

/**
 * Pull the JSON body out of a model reply, tolerating a ```json … ``` (or bare
 * ```` ``` ````) code fence — models wrap JSON in fences fairly often despite
 * the "no code fences" instruction, and an un-stripped fence fails JSON.parse.
 */
function extractJson(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

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

// ---------------------------------------------------------------------------
// Real LLM adapter — Anthropic Messages API.
// ---------------------------------------------------------------------------

/**
 * The narrow slice of the Anthropic client the provider actually uses. Declared
 * structurally so tests can inject a hermetic fake with no network. The real
 * `Anthropic` client satisfies this via the wrapper in `defaultClient()`.
 */
export interface LlmClient {
  messages: {
    create(
      params: Anthropic.MessageCreateParamsNonStreaming,
    ): Promise<{ content: Array<{ type: string; text?: string }> }>;
  };
}

/** Config slice the provider needs. */
interface LlmConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
}

/** Build the Anthropic constructor options, honoring the base-URL knob. */
export function anthropicClientOptions(
  cfg: LlmConfig,
): { apiKey: string; baseURL?: string } {
  return {
    apiKey: cfg.apiKey,
    // Omit baseURL entirely when unset so the SDK uses Anthropic's default host.
    ...(cfg.baseUrl ? { baseURL: cfg.baseUrl } : {}),
  };
}

function defaultClient(cfg: LlmConfig): LlmClient {
  const anthropic = new Anthropic(anthropicClientOptions(cfg));
  return {
    messages: {
      create: (params) => anthropic.messages.create(params),
    },
  };
}

// --- response schemas (also the malformed-response guard) ------------------

const beatSchema = z.object({
  spineBeat: z.enum(INVARIANT_SPINE),
  text: z.string(),
  dealtCardIds: z.array(z.string()),
});
/**
 * Beats must cover the whole invariant spine, in order. Completeness guarantees
 * the safe, resolved ending ("good-triumphs") is present; order-preservation
 * keeps the spine structural rather than a suggestion the model can shuffle.
 * (Multiple beats may map to the same spine step, so we check non-decreasing
 * order + presence, not exact one-per-step equality.) SPEC.md §8.
 */
const writeArcSchema = z
  .object({ beats: z.array(beatSchema) })
  .superRefine((val, ctx) => {
    for (const step of INVARIANT_SPINE) {
      if (!val.beats.some((b) => b.spineBeat === step)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `arc is missing the "${step}" spine beat`,
        });
      }
    }
    const order = val.beats.map((b) => INVARIANT_SPINE.indexOf(b.spineBeat));
    for (let i = 1; i < order.length; i++) {
      if (order[i] < order[i - 1]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "spine beats are out of order",
        });
        break;
      }
    }
  });

const cardRoleSchema = z.enum([
  "hero",
  "villain",
  "companion",
  "place",
  "artifact",
  "other",
]);
const extractSchema = z.object({
  entities: z.array(
    z.object({
      entityId: z.string(),
      role: cardRoleSchema,
      appearanceNote: z.string(),
    }),
  ),
});

const storyBibleSchema = z.object({
  entitySheets: z.array(
    z.object({
      entityId: z.string(),
      facts: z.array(z.string()),
      appearanceNote: z.string(),
      relationships: z.array(z.string()),
    }),
  ),
  eventLog: z.array(
    z.object({
      arcId: z.string(),
      summary: z.string(),
      lessonTaught: z.string(),
      villainResolution: z
        .enum(["redeemed", "defeated", "banished", "befriended"])
        .optional(),
    }),
  ),
  worldState: z.array(z.string()),
  openThreads: z.array(
    z.object({
      id: z.string(),
      teaser: z.string(),
      originArcId: z.string(),
      resolved: z.boolean(),
    }),
  ),
  virtuesTaught: z.array(z.string()),
});

const SYSTEM_PROMPT =
  "You are the prose + canon engine for an explicitly-Christian children's " +
  "bedtime storytelling app. Honor these guardrails as HARD rules:\n" +
  GUARDRAILS.invariants.join("\n") +
  "\nRespond with ONLY a single JSON object — no markdown, no prose, no code fences.";

export class ApiLlmProvider implements LlmProvider {
  private readonly client: LlmClient;
  private readonly model: string;

  constructor(opts?: { client?: LlmClient; model?: string; config?: LlmConfig }) {
    const cfg = opts?.config ?? config.llm;
    this.model = opts?.model ?? (cfg.model || DEFAULT_MODEL);
    this.client = opts?.client ?? defaultClient(cfg);
  }

  /** Call the model and return the parsed JSON validated against `schema`. */
  private async complete<T>(
    prompt: string,
    schema: z.ZodType<T>,
  ): Promise<T> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    });
    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("");
    // JSON.parse throws on non-JSON; zod throws on a wrong shape.
    const parsed: unknown = JSON.parse(extractJson(text));
    return schema.parse(parsed);
  }

  async writeArc(input: {
    answers: WizardAnswers;
    shape: ArcShape;
    bible?: StoryBible;
  }): Promise<{ beats: Beat[] }> {
    const age = AGE_BANDS[input.answers.ageBand];
    const prompt =
      `Write the beats of a "${input.shape}" story for ages ${age.approxAges} ` +
      `(~${age.beatCount} beats, ~${age.wordsPerBeat} words each, peril ceiling ` +
      `${age.perilCeiling}). Fill this invariant spine in order: ` +
      `${INVARIANT_SPINE.join(", ")}.\n` +
      `Wizard answers: ${JSON.stringify(input.answers)}\n` +
      `Story Bible (canon to honor): ${JSON.stringify(input.bible ?? null)}\n` +
      `Return JSON: { "beats": [ { "spineBeat": <one of the spine beats>, ` +
      `"text": string, "dealtCardIds": string[] } ] }`;
    return this.complete(prompt, writeArcSchema);
  }

  async extractNewEntities(input: {
    beats: Beat[];
    existingEntityIds: string[];
  }): Promise<Array<{ entityId: string; role: CardRole; appearanceNote: string }>> {
    const prompt =
      `Identify card-worthy NEW entities introduced by this story that are NOT ` +
      `already canon. Existing (reused, do NOT list) entityIds: ` +
      `${JSON.stringify(input.existingEntityIds)}.\n` +
      `Beats: ${JSON.stringify(input.beats)}\n` +
      `Return JSON: { "entities": [ { "entityId": string, "role": ` +
      `"hero"|"villain"|"companion"|"place"|"artifact"|"other", ` +
      `"appearanceNote": string } ] }`;
    const { entities } = await this.complete(prompt, extractSchema);
    // Defense in depth: the prompt asks the model to exclude canon entities, but
    // a disobedient reply must not reintroduce a locked entity as "new" (that
    // would mint a duplicate card and pay image cost for existing canon).
    const existing = new Set(input.existingEntityIds);
    return entities.filter((e) => !existing.has(e.entityId));
  }

  async updateBible(input: {
    priorBible: StoryBible | undefined;
    beats: Beat[];
    answers: WizardAnswers;
  }): Promise<StoryBible> {
    const prompt =
      `Update the Story Bible after this arc. Summarize the arc, log the event, ` +
      `advance world state and open threads, and record the virtue taught.\n` +
      `Prior Bible: ${JSON.stringify(input.priorBible ?? null)}\n` +
      `Wizard answers: ${JSON.stringify(input.answers)}\n` +
      `Beats: ${JSON.stringify(input.beats)}\n` +
      `Return JSON matching the StoryBible shape: { "entitySheets": [...], ` +
      `"eventLog": [...], "worldState": string[], "openThreads": [...], ` +
      `"virtuesTaught": string[] }`;
    return this.complete(prompt, storyBibleSchema);
  }
}

export function makeLlmProvider(): LlmProvider {
  return usingStubLlm() ? new StubLlmProvider() : new ApiLlmProvider();
}
