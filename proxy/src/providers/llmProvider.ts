import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type {
  Beat,
  CastMember,
  StoryBible,
  WizardAnswers,
  ArcShape,
  CardRole,
} from "@wwt/domain";
import { AGE_BANDS, INVARIANT_SPINE, GUARDRAILS } from "@wwt/domain";
import { config, usingStubLlm } from "../config.js";

/**
 * A prose-only beat as authored by the model. Placement (`dealtCardIds`) is
 * DERIVED by the pipeline from `cast.firstBeatIndex` — never model-emitted — so
 * a beat can never reference a card that was dropped or never canonized.
 */
export type ProseBeat = Pick<Beat, "spineBeat" | "text">;

/** The single authoring call's output: prose beats + a transient cast. */
export interface AuthoredArc {
  beats: ProseBeat[];
  cast: CastMember[];
}

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
  /**
   * Author the arc in ONE call: prose-only beats inside the invariant spine PLUS
   * a transient `cast` (every entity that appears — new OR reused canon — each
   * declaring its `firstBeatIndex`). This merges the old writeArc + extractNewEntities
   * calls; the pipeline then diffs cast vs canon and DERIVES `dealtCardIds`.
   */
  writeArc(input: {
    answers: WizardAnswers;
    shape: ArcShape;
    bible?: StoryBible;
  }): Promise<AuthoredArc>;

  /** After a book, summarize the arc + update the bible (returns the new bible). */
  updateBible(input: {
    priorBible: StoryBible | undefined;
    beats: Beat[];
    answers: WizardAnswers;
  }): Promise<StoryBible>;
}

/** STUB — deterministic placeholder prose so the pipeline runs end-to-end. */
export class StubLlmProvider implements LlmProvider {
  async writeArc(input: { answers: WizardAnswers; shape: ArcShape }): Promise<AuthoredArc> {
    const age = AGE_BANDS[input.answers.ageBand];
    // One beat per spine step; pad to the age's beat count with journey beats.
    const beats: ProseBeat[] = INVARIANT_SPINE.map((spineBeat) => ({
      spineBeat,
      text: `[stub ${spineBeat}] a ${input.shape} story for ages ${age.approxAges}.`,
    }));
    // A hero (beat 0) and a villain (entering when the virtue is tested) so the
    // downstream diff/cap/derivation has representative cast to work with.
    const virtueTestedIndex = Math.max(0, INVARIANT_SPINE.indexOf("virtue-tested"));
    const cast: CastMember[] = [
      { entityId: "hero", role: "hero", appearanceNote: "[stub hero]", firstBeatIndex: 0 },
      { entityId: "villain", role: "villain", appearanceNote: "[stub villain]", firstBeatIndex: virtueTestedIndex },
    ];
    return { beats, cast };
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

/** A PROSE-ONLY beat — no dealtCardIds (the pipeline derives placement). Extra
 *  keys the model may still emit (e.g. a stray dealtCardIds) are stripped. */
const proseBeatSchema = z.object({
  spineBeat: z.enum(INVARIANT_SPINE),
  text: z.string(),
});

const cardRoleSchema = z.enum([
  "hero",
  "villain",
  "companion",
  "place",
  "artifact",
  "other",
]);

/** A transient cast member. `firstBeatIndex` is coerced tolerantly (number,
 *  numeric string, or missing → 0); the pipeline clamps it to a real beat. */
const castMemberSchema = z.object({
  entityId: z.string(),
  role: cardRoleSchema,
  appearanceNote: z
    .string()
    .nullish()
    .transform((v) => v ?? ""),
  firstBeatIndex: z.unknown().transform((v) => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : 0;
  }),
});

/**
 * The single authoring reply: prose beats + a transient cast. Beats must cover
 * the whole invariant spine, in order — completeness guarantees the safe,
 * resolved ending ("good-triumphs") is present; order-preservation keeps the
 * spine structural rather than a suggestion the model can shuffle. (Multiple
 * beats may map to the same spine step, so we check non-decreasing order +
 * presence, not exact one-per-step equality.) `cast` defaults to [] when the
 * model omits it. SPEC.md §8.
 */
const authoredArcSchema = z
  .object({
    beats: z.array(proseBeatSchema),
    cast: z
      .array(castMemberSchema)
      .nullish()
      .transform((v) => v ?? []),
  })
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

/** One relationship as a string: pass strings through, JSON-stringify anything
 *  else (the model sometimes returns `{entityId, relation}` objects). */
const relToString = (x: unknown): string =>
  typeof x === "string" ? x : JSON.stringify(x);

/** Coerce `relationships` to the schema's `string[]`. The model variously
 *  returns a `string[]`, an array of objects, or a role→who map — accept all,
 *  and treat null/missing as empty. */
const relationshipsSchema = z
  .union([
    z.array(z.unknown()).transform((arr) => arr.map(relToString)),
    z
      .record(z.unknown())
      .transform((obj) =>
        Object.entries(obj).map(([k, v]) => `${k}: ${relToString(v)}`),
      ),
  ])
  .nullish()
  .transform((v) => v ?? []);

/** Tolerant entity-sheet row: coerces object/array-shaped `relationships` and
 *  treats the fields the model tends to omit (or null out) as empty.
 *  `entityId` stays required (it can't be invented). */
const entitySheetSchema = z.object({
  entityId: z.string(),
  facts: z
    .array(z.string())
    .nullish()
    .transform((v) => v ?? []),
  appearanceNote: z
    .string()
    .nullish()
    .transform((v) => v ?? ""),
  relationships: relationshipsSchema,
});

/** A tolerant `string` field: pass strings through, coerce anything else the
 *  model returns (a number, or a structured object) to a stable string, and
 *  treat null/missing as empty. Mirrors `relToString`. */
const toStringEntry = (x: unknown): string =>
  x == null ? "" : typeof x === "string" ? x : JSON.stringify(x);

/** A tolerant `string[]`: coerce each present entry to a string. An OMITTED (or
 *  null) section stays `undefined` — NOT [] — so updateBible can fall back to the
 *  prior bible's value instead of erasing it. The model sometimes returns
 *  worldState/virtuesTaught as arrays of objects. */
const stringArraySchema = z
  .array(z.unknown())
  .nullish()
  .transform((arr) => (arr == null ? undefined : arr.map(toStringEntry)));

/** Tolerant eventLog row — the model omits or renames fields freely. Only the
 *  villainResolution enum is validated (unknown values are dropped rather than
 *  rejecting the whole bible). */
const eventLogSchema = z.array(
  z.object({
    arcId: z
      .string()
      .nullish()
      .transform((v) => v ?? ""),
    summary: z
      .string()
      .nullish()
      .transform((v) => v ?? ""),
    lessonTaught: z
      .string()
      .nullish()
      .transform((v) => v ?? ""),
    villainResolution: z
      .enum(["redeemed", "defeated", "banished", "befriended"])
      .nullish()
      .catch(undefined)
      .transform((v) => v ?? undefined),
  }),
);

/** Tolerant openThread row — ids default to empty, `resolved` coerces to a bool
 *  (null/missing → false). */
const openThreadSchema = z.array(
  z.object({
    id: z
      .string()
      .nullish()
      .transform((v) => v ?? ""),
    teaser: z
      .string()
      .nullish()
      .transform((v) => v ?? ""),
    originArcId: z
      .string()
      .nullish()
      .transform((v) => v ?? ""),
    resolved: z
      .unknown()
      .transform((v) => v === true),
  }),
);

/** Tolerant against real model output: an OMITTED top-level section parses to
 *  `undefined` (NOT []) so updateBible can fall back to the prior bible's value
 *  rather than erasing prior canon; each present section still coerces the shapes
 *  the model tends to return (see the per-field schemas above). This keeps
 *  updateBible from HTTP-500ing while never silently wiping accumulated canon. */
const storyBibleSchema = z.object({
  entitySheets: z.array(entitySheetSchema).nullish(),
  eventLog: eventLogSchema.nullish(),
  worldState: stringArraySchema,
  openThreads: openThreadSchema.nullish(),
  virtuesTaught: stringArraySchema,
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

  /**
   * Call the model and return the parsed JSON validated against `schema`.
   *
   * On a JSON-parse or schema-validation failure, feed the invalid reply and
   * the error back to the model and re-ask (`opts.retries` extra attempts) —
   * a plain re-ask tends to repeat the mistake, so we show it what was wrong.
   * The last error is rethrown once attempts are exhausted.
   */
  private async complete<S extends z.ZodTypeAny>(
    prompt: string,
    schema: S,
    opts: { retries?: number } = {},
  ): Promise<z.output<S>> {
    const maxAttempts = (opts.retries ?? 0) + 1;
    const messages: Array<{
      role: "user" | "assistant";
      content: string;
    }> = [{ role: "user", content: prompt }];
    let lastErr: unknown;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages,
      });
      const text = response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("");
      try {
        // JSON.parse throws on non-JSON; zod throws on a wrong shape.
        const parsed: unknown = JSON.parse(extractJson(text));
        return schema.parse(parsed);
      } catch (err) {
        lastErr = err;
        const detail = err instanceof Error ? err.message : String(err);
        messages.push(
          { role: "assistant", content: text },
          {
            role: "user",
            content:
              `That response was not valid: ${detail}.\n` +
              `Reply with ONLY corrected JSON that matches the required shape ` +
              `exactly — no prose, no code fences.`,
          },
        );
      }
    }
    throw lastErr;
  }

  async writeArc(input: {
    answers: WizardAnswers;
    shape: ArcShape;
    bible?: StoryBible;
  }): Promise<AuthoredArc> {
    const age = AGE_BANDS[input.answers.ageBand];
    const prompt =
      `Write the beats of a "${input.shape}" story for ages ${age.approxAges} ` +
      `(~${age.beatCount} beats, ~${age.wordsPerBeat} words each, peril ceiling ` +
      `${age.perilCeiling}). Fill this invariant spine in order: ` +
      `${INVARIANT_SPINE.join(", ")}.\n` +
      `Wizard answers: ${JSON.stringify(input.answers)}\n` +
      `Story Bible (canon to honor): ${JSON.stringify(input.bible ?? null)}\n` +
      `Also list the CAST: every character, place, or artifact that appears — ` +
      `whether newly introduced OR reused from the Story Bible canon above. For ` +
      `each, give its "entityId" (reuse the SAME id for a canon entity), "role", ` +
      `a short "appearanceNote", and "firstBeatIndex" = the 0-based index of the ` +
      `EARLIEST beat it appears in.\n` +
      `Return JSON: { "beats": [ { "spineBeat": <label>, "text": string } ], ` +
      `"cast": [ { "entityId": string, "role": ` +
      `"hero"|"villain"|"companion"|"place"|"artifact"|"other", ` +
      `"appearanceNote": string, "firstBeatIndex": number } ] }.\n` +
      `Do NOT put card placement on the beats — the app derives which cards are ` +
      `dealt from each cast member's "firstBeatIndex".\n` +
      `Each beat's "spineBeat" MUST be exactly one of these literal values: ` +
      `${INVARIANT_SPINE.map((s) => `"${s}"`).join(", ")}. Do NOT use any ` +
      `other names (e.g. NOT "rising-action", "climax", "resolution", ` +
      `"conflict"). Cover all ${INVARIANT_SPINE.length} spine values in the ` +
      `order listed; if you write extra beats between milestones, tag each ` +
      `with the most recent spine value it belongs to (so the "spineBeat" ` +
      `values are non-decreasing along the spine).`;
    return this.complete(prompt, authoredArcSchema, { retries: 1 });
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
      `Return JSON matching the StoryBible shape: { "entitySheets": [ { ` +
      `"entityId": string, "facts": string[], "appearanceNote": string, ` +
      `"relationships": string[] } ], "eventLog": [ { "arcId": string, ` +
      `"summary": string, "lessonTaught": string, "villainResolution"?: ` +
      `"redeemed"|"defeated"|"banished"|"befriended" } ], "worldState": ` +
      `string[], "openThreads": [ { "id": string, "teaser": string, ` +
      `"originArcId": string, "resolved": boolean } ], "virtuesTaught": ` +
      `string[] }. "relationships" MUST be an array of strings (e.g. ` +
      `["mentor: owl"]), never an object. Every entitySheet MUST include ` +
      `its "entityId".`;
    // MERGE onto the prior bible: a section the model omitted (parsed as
    // `undefined`) falls back to prior canon, so returning only the changed
    // sections never wipes accumulated entitySheets/eventLog/etc. to [].
    const parsed = await this.complete(prompt, storyBibleSchema, { retries: 1 });
    const prior = input.priorBible;
    return {
      entitySheets: parsed.entitySheets ?? prior?.entitySheets ?? [],
      eventLog: parsed.eventLog ?? prior?.eventLog ?? [],
      worldState: parsed.worldState ?? prior?.worldState ?? [],
      openThreads: parsed.openThreads ?? prior?.openThreads ?? [],
      virtuesTaught: parsed.virtuesTaught ?? prior?.virtuesTaught ?? [],
    };
  }
}

export function makeLlmProvider(): LlmProvider {
  return usingStubLlm() ? new StubLlmProvider() : new ApiLlmProvider();
}
