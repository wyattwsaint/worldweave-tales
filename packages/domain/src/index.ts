/**
 * Worldweave Tales — shared domain model.
 *
 * This file is the single source of truth for the locked design (see SPEC.md).
 * It is imported by BOTH the Expo app and the proxy so the two can never drift.
 *
 * Nothing here does I/O. These are the *nouns and rules* of the product.
 */

// ---------------------------------------------------------------------------
// Catalog — tier / age / arc-shape definitions + curated virtues.
//
// These live in the LEAF module `./catalog` (not here) to break the
// index <-> wizardGraph circular import that otherwise TDZ-crashes the compiled
// output ("Cannot access 'TIERS' before initialization"). The barrel re-exports
// them below so the public API is unchanged, and imports the types it needs
// locally for the interfaces further down this file.
// ---------------------------------------------------------------------------

export * from "./catalog";
import type { Tier, AgeBand, ArcShape } from "./catalog";

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
// Cast — TRANSIENT authoring placement, on the LLM-provider return boundary ONLY.
//
// The authoring LLM emits a `cast` array alongside prose-only beats. Each member
// declares WHERE it first appears (`firstBeatIndex`) — the single source of truth
// for placement (ADR-0002 amendment). The pipeline then DERIVES each
// `beat.dealtCardIds` by bucketing *retained* cast by `firstBeatIndex`, so dangling
// refs are structurally impossible. `cast` is NOT persisted on Arc/Beat: recurring
// cast lives in the canon deck (`Storyworld.deck`). A retained member is canonized
// into a `Card`, which is why its identity fields mirror Card's.
// ---------------------------------------------------------------------------

export interface CastMember {
  entityId: string;
  role: CardRole;
  /** Mirrors Card.appearanceNote so the drawn art and the prose never contradict. */
  appearanceNote: string;
  /**
   * 0-based index of the earliest beat this entity appears in — the placement
   * bucket the pipeline uses to derive `beat.dealtCardIds` for retained cast.
   */
  firstBeatIndex: number;
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
  /**
   * The retained cast member's REAL entityId — the SAME id the pipeline bucketed
   * into `beat.dealtCardIds`. The canonized Card MUST carry this id (not the role)
   * or the viewer's `dealtCardIds -> card` lookup misses for any real-model run
   * whose hero entityId differs from its role (e.g. "prince-alden" vs "hero").
   */
  entityId: string;
  role: CardRole;
  /** Mirrors the cast member's appearanceNote (what the variants were drawn from)
   *  so the canonized Card's note stays consistent with its locked art. */
  appearanceNote: string;
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
