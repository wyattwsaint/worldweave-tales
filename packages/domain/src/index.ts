/**
 * Worldweave Tales — shared domain model.
 *
 * This file is the single source of truth for the locked design (see SPEC.md).
 * It is imported by BOTH the Expo app and the proxy so the two can never drift.
 *
 * Nothing here does I/O. These are the *nouns and rules* of the product.
 */

// ---------------------------------------------------------------------------
// Tiers — scale STORY DEPTH (not art). Also cap NEW entities per arc.
// Reused canon is unlimited and free; only new cards cost money + a pick.
// ---------------------------------------------------------------------------

export type Tier = "beginner" | "solid" | "epic";

export interface TierConfig {
  /** Max NEW (non-reused) entities that may be introduced in a single arc. */
  newEntityCap: number;
  /** Roughly how many story-shaping questions the wizard asks. */
  wizardDepth: number;
  /** Whether the parent explicitly picks the arc shape (vs engine auto-picks + anti-repeats). */
  parentPicksArcShape: boolean;
  /** Whether the teaching point free-text box is offered. */
  teachingFreeText: boolean;
}

export const TIERS: Record<Tier, TierConfig> = {
  beginner: { newEntityCap: 3, wizardDepth: 5, parentPicksArcShape: false, teachingFreeText: false },
  solid: { newEntityCap: 6, wizardDepth: 10, parentPicksArcShape: true, teachingFreeText: true },
  epic: { newEntityCap: 10, wizardDepth: 18, parentPicksArcShape: true, teachingFreeText: true },
};

// ---------------------------------------------------------------------------
// Age — a per-story dial. Flexes reading level, length, card count AND the
// peril ceiling (age raises suspense; never breaches the bedtime-safe floor).
// ---------------------------------------------------------------------------

export type AgeBand = "toddler" | "preschool" | "early-reader";

export interface AgeConfig {
  approxAges: string;
  /** Target read-aloud minutes (10 min is the anchor default at preschool). */
  targetMinutes: number;
  /** Beats/cards the story is built from (flexes length). */
  beatCount: number;
  /** ~words per beat page, tuned to reading level. */
  wordsPerBeat: number;
  /**
   * How much suspense the story may carry before its guaranteed safe landing.
   * 1 = gentle wobbles, 3 = real (but always resolved) menace. Floor is always
   * "bedtime-safe" — no nightmare fuel, no unresolved scare at lights-out.
   */
  perilCeiling: 1 | 2 | 3;
}

export const AGE_BANDS: Record<AgeBand, AgeConfig> = {
  toddler: { approxAges: "2–3", targetMinutes: 5, beatCount: 7, wordsPerBeat: 45, perilCeiling: 1 },
  preschool: { approxAges: "4–6", targetMinutes: 10, beatCount: 12, wordsPerBeat: 95, perilCeiling: 2 },
  "early-reader": { approxAges: "7–8", targetMinutes: 12, beatCount: 15, wordsPerBeat: 130, perilCeiling: 3 },
};

// ---------------------------------------------------------------------------
// Arc shapes — variability inside a fixed invariant SPINE.
// Every shape resolves safely and lands the lesson; only the middle differs.
// ---------------------------------------------------------------------------

export type ArcShape =
  | "quest"
  | "rescue"
  | "mystery"
  | "lost-and-found-home"
  | "rivalry-to-friendship"
  | "overcoming-a-fear";

export const ARC_SHAPES: ArcShape[] = [
  "quest",
  "rescue",
  "mystery",
  "lost-and-found-home",
  "rivalry-to-friendship",
  "overcoming-a-fear",
];

/**
 * The invariant spine every arc shape must express, in order. The prose engine
 * fills these beats; pacing and the happy/safe ending are enforced structurally.
 */
export const INVARIANT_SPINE = [
  "setup",
  "call-to-adventure",
  "virtue-tested", // the chosen teaching point IS the test
  "good-triumphs", // resolves safe, lesson earned
  "gentle-hope-hook", // forward teaser — NEVER a peril cliffhanger
] as const;
export type SpineBeat = (typeof INVARIANT_SPINE)[number];

/** How a villain is resolved — FOLLOWS THE LESSON. Never killed*, never cruel. */
export type VillainResolution = "redeemed" | "defeated" | "banished" | "befriended";

// ---------------------------------------------------------------------------
// Cards — the canonical art. Drawn ONCE, locked FOREVER, reused everywhere.
// ---------------------------------------------------------------------------

export type CardRole = "hero" | "villain" | "companion" | "place" | "artifact" | "other";

export interface Card {
  entityId: string;
  role: CardRole;
  canonName: string;
  /** Short factual traits used in prose so the words never contradict the art. */
  traits: string[];
  /** Description that matches the locked image (kept in sync, never redrawn). */
  appearanceNote: string;
  /** Local reference to the locked image blob. Immutable once set. */
  lockedImageRef: string;
  /** Other entityIds this card relates to. */
  relationships: string[];
  /** When the art was canonized. A card is never regenerated after this. */
  canonizedAt: string;
}

// ---------------------------------------------------------------------------
// Story Bible — narrative canon (the twin of the card deck). LLM-maintained,
// parent-correctable, stored locally, injected into generation as HARD facts.
// ---------------------------------------------------------------------------

export interface EntitySheet {
  entityId: string;
  facts: string[];
  /** Mirrors Card.appearanceNote so prose stays consistent with the picture. */
  appearanceNote: string;
  relationships: string[];
}

export interface ArcSummary {
  arcId: string;
  /** 2–4 sentence recency-compressed summary of what happened. */
  summary: string;
  lessonTaught: string;
  villainResolution?: VillainResolution;
}

export interface OpenThread {
  id: string;
  /** The gentle hook seeded by a prior arc's ending. */
  teaser: string;
  originArcId: string;
  resolved: boolean;
}

export interface StoryBible {
  entitySheets: EntitySheet[];
  eventLog: ArcSummary[];
  /** Standing facts / current relationships ("the villain was redeemed in Arc 3"). */
  worldState: string[];
  openThreads: OpenThread[];
  /** Virtues taught per arc — drives variety or deliberate reinforcement. */
  virtuesTaught: string[];
}

// ---------------------------------------------------------------------------
// Storyworld — THE UNIT OF CANON. Owns the deck + the bible + many arcs.
// A parent may have several. The recurring hero grows with the kid here.
// ---------------------------------------------------------------------------

/** The one locked art style for a whole world (Recraft named-style handle). */
export interface ArtStyle {
  presetId: string;
  displayName: string; // e.g. "Imaginative Pencil-Sketch"
  /** Provider-side style handle (e.g. a Recraft style id) once created. */
  providerStyleRef?: string;
}

export interface Storyworld {
  id: string;
  name: string;
  artStyle: ArtStyle;
  defaultAgeBand: AgeBand;
  deck: Card[];
  bible: StoryBible;
  arcIds: string[];
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Arc — one finished ~10-min book. A sequence of beats that DEAL the cards.
// ---------------------------------------------------------------------------

export interface Beat {
  spineBeat: SpineBeat;
  text: string;
  /** entityIds whose cards are dealt onto this page. */
  dealtCardIds: string[];
}

export type TeachingPoint =
  | { kind: "virtue"; virtue: string } // from the curated list
  | { kind: "situation"; description: string; heavy: boolean }; // free-text real-life analog

export interface Arc {
  id: string;
  worldId: string;
  tier: Tier;
  ageBand: AgeBand;
  shape: ArcShape;
  teachingPoint: TeachingPoint;
  /** Scripture is woven by default; optional closing verse is off by default. */
  closingVerseEnabled: boolean;
  beats: Beat[];
  /** Populated after export. */
  pdfRef?: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Guardrails — the values contract. See SPEC.md §7. Referenced by prose/art
// prompt builders and by the free-text refusal logic.
// ---------------------------------------------------------------------------

export const GUARDRAILS = {
  identity:
    "Explicitly Christian, woven with taste, age-scaled, denomination-neutral (broadly biblical; " +
    "avoid divisive doctrine).",
  invariants: [
    "Good triumphs; ending is safe, warm, resolved.",
    "Lessons and faith are EARNED, never preachy or tacked-on.",
    "Christian ethics shown through character and choice, never a sermon.",
    "No profanity, slang, crude humor, or innuendo.",
    "No romance/sexuality, substances, or gambling.",
    "No gore, graphic injury, or gratuitous cruelty.",
    "No real public figures, branded/IP characters, or real-person likenesses.",
    "No politics; no denomination-dividing doctrine.",
    "No stereotyping; respectful, inclusive depiction.",
    "Art obeys the same content ceiling as the prose.",
    "Parent free-text may shape the lesson but never override an invariant.",
  ],
  bedtimeSafeFloor:
    "Even the highest age/peril tier: no nightmare fuel, no graphic menace, no unresolved scare " +
    "at lights-out. Suspense always lands safe.",
  villains: "Changed, beaten, or banished — never killed (unless the parent opened the loss door), never defeated cruelly.",
  loss: "Never gratuitous or uninvited; only gentle, parent-initiated, hope-anchored, always lands safe.",
  scripture: "Woven by default (no chapter-and-verse in narrative); optional parent-toggled closing verse only.",
} as const;

/** The curated virtue list offered to Beginner (and as chips for higher tiers). */
export const CURATED_VIRTUES = [
  "courage",
  "honesty",
  "kindness",
  "forgiveness",
  "patience",
  "generosity",
  "humility",
  "perseverance",
  "gratitude",
  "obedience",
  "compassion",
  "trusting God",
] as const;

// ---------------------------------------------------------------------------
// Generation request/response contracts (app <-> proxy). Pure data.
// ---------------------------------------------------------------------------

export interface WizardAnswers {
  worldId?: string; // set when continuing an existing Storyworld
  tier: Tier;
  ageBand: AgeBand;
  shape?: ArcShape; // omitted for Beginner (engine picks)
  teachingPoint: TeachingPoint;
  closingVerseEnabled: boolean;
  /** Free-form story choices the parent made (world, hero, villain, stakes...). */
  choices: Record<string, string>;
  /** An open thread the parent chose to continue, if any. */
  continueThreadId?: string;
}

export interface GenerateArcRequest {
  /** App-attestation token (App Attest / Play Integrity). Verified by the proxy. */
  attestationToken: string;
  /** Stable device id (DeviceCheck / Play Integrity) for per-device quota. */
  deviceId: string;
  answers: WizardAnswers;
  /** Existing world state so the proxy can reuse canon + honor the bible. */
  world?: Storyworld;
}

export interface GeneratedCardChoice {
  role: CardRole;
  /** A few variants for hero/villain-class NEW cards; parent taps to pick. */
  variantImageRefs: string[];
}

export interface GenerateArcResponse {
  arc: Arc;
  /** New cards already canonized (AI-derived, single option). */
  newCanonCards: Card[];
  /** New hero/villain-class cards awaiting a parent pick before canonizing. */
  pendingCardChoices: GeneratedCardChoice[];
  /** Updated bible to persist locally. */
  bible: StoryBible;
}

// ---------------------------------------------------------------------------
// Wizard question-tree (pure data + pure functions). See wizardGraph.ts.
// ---------------------------------------------------------------------------

export {
  WIZARD_GRAPH,
  getVisibleNodes,
  assembleRawPicks,
  resolveValue,
  type WizardNode,
  type NodeAnswers,
  type NodeBinding,
  type RawWizardPicks,
} from "./wizardGraph";
