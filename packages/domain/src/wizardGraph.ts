/**
 * Wizard question-tree — the DOMAIN layer.
 *
 * Pure data + pure functions only. This describes the ordered question graph the
 * parent walks through, which nodes are visible for a given tier + partial
 * answers, and how a completed set of answers reduces to the loose
 * {@link RawWizardPicks} shape the app's `buildWizardAnswers` validates.
 *
 * NO I/O, NO randomness, NO app/UI concerns. Minting of worldId and anti-repeat
 * of virtues live in the app/engine layers by design.
 */

import {
  AGE_BANDS,
  ARC_SHAPES,
  CURATED_VIRTUES,
  TIERS,
  type AgeBand,
  type ArcShape,
  type Tier,
} from "./index";

// ---------------------------------------------------------------------------
// RawWizardPicks — mirrors app/src/flow/buildWizardAnswers.ts. Domain cannot
// import from the app (dependency direction), so the shape is re-declared here
// as the single source of truth; the assembler below produces exactly this.
// ---------------------------------------------------------------------------

export interface RawWizardPicks {
  tier: Tier;
  ageBand: AgeBand;
  shape?: ArcShape;
  /** Curated-virtue path (mutually exclusive with `situation`). */
  virtue?: string;
  /** Real-life-analog path (mutually exclusive with `virtue`). */
  situation?: string;
  /** Whether the situation is a heavier theme; ignored on the virtue path. */
  heavy?: boolean;
  closingVerseEnabled?: boolean;
  /** Free-text story choices (world, hero, villain, ...); may be blank. */
  choices: Record<string, string>;
  worldId?: string;
  continueThreadId?: string;
}

// ---------------------------------------------------------------------------
// Node model
// ---------------------------------------------------------------------------

/** Answers collected so far, keyed by node id. */
export type NodeAnswers = Record<string, string | boolean | undefined>;

/** Where a node's answer is routed inside {@link RawWizardPicks}. */
export type NodeBinding =
  | { target: "field"; field: "tier" | "ageBand" | "shape" | "closingVerseEnabled" | "continueThreadId" }
  | { target: "teaching"; part: "virtue" | "situation" | "directness" }
  | { target: "choice"; key: string };

export interface WizardNode {
  id: string;
  kind: "single-select" | "text" | "toggle" | "dial" | "thread-pick";
  /** Which tiers this node appears in. */
  tiers: Tier[];
  required: boolean;
  /** Value used when the node is visible but left unanswered. */
  default?: string | boolean;
  /** Static option list for single-select / dial. thread-pick options are dynamic. */
  options?: readonly string[];
  /** Branching predicate; when omitted the node is always visible for its tiers. */
  visibleWhen?: (answers: NodeAnswers) => boolean;
  binding: NodeBinding;
}

// ---------------------------------------------------------------------------
// Predicates (pure functions of NodeAnswers)
// ---------------------------------------------------------------------------

/** A saved thread was offered to the parent (app sets the `__hasThreads` flag). */
const hasThreadsOffered = (a: NodeAnswers): boolean => a.__hasThreads === true;

/** No open thread has been chosen to continue. */
const noThreadChosen = (a: NodeAnswers): boolean => !a.continueThread;

/** The current tier offers the free-text teaching box. */
const teachingFreeText = (a: NodeAnswers): boolean => {
  const tier = a.tier as Tier | undefined;
  return tier !== undefined && TIERS[tier]?.teachingFreeText === true;
};

// ---------------------------------------------------------------------------
// The master ordered graph
// ---------------------------------------------------------------------------

const ALL_TIERS: Tier[] = ["beginner", "solid", "epic"];

/** Epic-only filler nodes: all bind to a choice keyed by their own id. */
const EPIC_FILLERS: WizardNode[] = [
  { id: "setting", kind: "text", tiers: ["epic"], required: false, binding: { target: "choice", key: "setting" } },
  {
    id: "tone",
    kind: "single-select",
    tiers: ["epic"],
    required: false,
    options: ["cozy", "adventurous", "mysterious", "heroic"],
    binding: { target: "choice", key: "tone" },
  },
  { id: "companion", kind: "text", tiers: ["epic"], required: false, binding: { target: "choice", key: "companion" } },
  { id: "heroWish", kind: "text", tiers: ["epic"], required: false, binding: { target: "choice", key: "heroWish" } },
  { id: "heroFlaw", kind: "text", tiers: ["epic"], required: false, binding: { target: "choice", key: "heroFlaw" } },
  { id: "villainMotive", kind: "text", tiers: ["epic"], required: false, binding: { target: "choice", key: "villainMotive" } },
  { id: "stakes", kind: "text", tiers: ["epic"], required: false, binding: { target: "choice", key: "stakes" } },
  { id: "worldRule", kind: "text", tiers: ["epic"], required: false, binding: { target: "choice", key: "worldRule" } },
];

export const WIZARD_GRAPH: readonly WizardNode[] = [
  // --- Core spine ---
  {
    id: "tier",
    kind: "single-select",
    tiers: ALL_TIERS,
    required: true,
    options: Object.keys(TIERS),
    binding: { target: "field", field: "tier" },
  },
  {
    id: "continueThread",
    kind: "thread-pick",
    tiers: ALL_TIERS,
    required: false,
    visibleWhen: hasThreadsOffered,
    binding: { target: "field", field: "continueThreadId" },
  },
  {
    id: "ageBand",
    kind: "single-select",
    tiers: ALL_TIERS,
    required: true,
    options: Object.keys(AGE_BANDS),
    binding: { target: "field", field: "ageBand" },
  },
  {
    id: "world",
    kind: "text",
    tiers: ALL_TIERS,
    required: false,
    default: "", // "surprise me"
    visibleWhen: noThreadChosen,
    binding: { target: "choice", key: "world" },
  },
  {
    id: "hero",
    kind: "text",
    tiers: ALL_TIERS,
    required: false,
    default: "",
    visibleWhen: noThreadChosen,
    binding: { target: "choice", key: "hero" },
  },
  {
    id: "villain",
    kind: "text",
    tiers: ["solid", "epic"],
    required: false,
    visibleWhen: noThreadChosen,
    binding: { target: "choice", key: "villain" },
  },
  {
    id: "arcShape",
    kind: "single-select",
    tiers: ["solid", "epic"],
    required: false,
    options: ARC_SHAPES, // the shape names themselves
    binding: { target: "field", field: "shape" },
  },
  {
    id: "virtue",
    kind: "single-select",
    tiers: ALL_TIERS,
    required: false,
    default: CURATED_VIRTUES[0], // anti-repeat is engine-side later; static default here
    options: CURATED_VIRTUES,
    binding: { target: "teaching", part: "virtue" },
  },
  {
    id: "situation",
    kind: "text",
    tiers: ["solid", "epic"],
    required: false,
    visibleWhen: teachingFreeText,
    binding: { target: "teaching", part: "situation" },
  },
  {
    id: "directness",
    kind: "dial",
    tiers: ["epic"],
    required: false,
    options: ["subtle", "balanced", "explicit"],
    default: "balanced",
    binding: { target: "teaching", part: "directness" },
  },
  {
    id: "closingVerse",
    kind: "toggle",
    tiers: ALL_TIERS,
    required: false,
    default: false,
    binding: { target: "field", field: "closingVerseEnabled" },
  },
  // --- Epic fillers ---
  ...EPIC_FILLERS,
];

// ---------------------------------------------------------------------------
// Visibility
// ---------------------------------------------------------------------------

/**
 * The visible, ordered subset of the graph for a tier + partial answers:
 * node.tiers includes `tier` AND (visibleWhen ? visibleWhen(answers) : true).
 */
export function getVisibleNodes(tier: Tier, answers: NodeAnswers): WizardNode[] {
  return WIZARD_GRAPH.filter(
    (node) => node.tiers.includes(tier) && (node.visibleWhen ? node.visibleWhen(answers) : true),
  );
}

// ---------------------------------------------------------------------------
// Assembler
// ---------------------------------------------------------------------------

/** Resolve a node's effective value: explicit answer, else its default when visible. */
function resolveValue(node: WizardNode, answers: NodeAnswers): string | boolean | undefined {
  const answer = answers[node.id];
  if (answer !== undefined) return answer;
  return node.default;
}

/** Trim a string value; returns undefined for non-strings or blanks. */
function nonEmptyString(value: string | boolean | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Reduce collected {@link NodeAnswers} into the exact {@link RawWizardPicks}
 * shape `buildWizardAnswers` consumes. Pure + deterministic.
 *
 * - Only *visible* nodes contribute; a node's `default` applies only when the
 *   node is visible AND unanswered.
 * - directness dial → `heavy`: 'explicit' => true, 'subtle'/'balanced' => false.
 * - worldId is never minted here (app supplies thread.worldId or mints a new id);
 *   continueThreadId is faithfully carried through.
 */
export function assembleRawPicks(answers: NodeAnswers): RawWizardPicks {
  const tier = answers.tier as Tier;
  const raw: RawWizardPicks = { tier, ageBand: answers.ageBand as AgeBand, choices: {} };

  const visible = getVisibleNodes(tier, answers);

  // A present situation must win over a merely-DEFAULT virtue: buildWizardAnswers'
  // teaching resolution is "virtue wins if non-empty", so if the virtue node's
  // static default fired it would silently drop a Solid/Epic parent's free-text
  // situation (SPEC decision 26). An EXPLICIT virtue pick still wins, per the
  // locked virtue-wins rule — only the default yields.
  const situationNode = visible.find(
    (n) => n.binding.target === "teaching" && n.binding.part === "situation",
  );
  const situationPresent =
    situationNode !== undefined && nonEmptyString(resolveValue(situationNode, answers)) !== undefined;

  for (const node of visible) {
    const value = resolveValue(node, answers);
    if (value === undefined) continue;

    switch (node.binding.target) {
      case "field": {
        switch (node.binding.field) {
          case "tier":
            raw.tier = value as Tier;
            break;
          case "ageBand":
            raw.ageBand = value as AgeBand;
            break;
          case "shape": {
            const s = nonEmptyString(value);
            if (s) raw.shape = s as ArcShape;
            break;
          }
          case "closingVerseEnabled":
            raw.closingVerseEnabled = value === true;
            break;
          case "continueThreadId": {
            const s = nonEmptyString(value);
            if (s) raw.continueThreadId = s;
            break;
          }
        }
        break;
      }
      case "teaching": {
        switch (node.binding.part) {
          case "virtue": {
            const explicit = answers[node.id] !== undefined;
            const s = nonEmptyString(value);
            // Default virtue yields to a present situation; explicit pick wins.
            if (s && (explicit || !situationPresent)) raw.virtue = s;
            break;
          }
          case "situation": {
            const s = nonEmptyString(value);
            if (s) raw.situation = s;
            break;
          }
          case "directness":
            // Map the 3-way dial onto RawWizardPicks' boolean `heavy`.
            raw.heavy = value === "explicit";
            break;
        }
        break;
      }
      case "choice": {
        const s = nonEmptyString(value);
        if (s) raw.choices[node.binding.key] = s;
        break;
      }
    }
  }

  return raw;
}
