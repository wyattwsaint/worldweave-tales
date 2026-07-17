/**
 * Worldweave Tales — catalog leaf module.
 *
 * The foundational tier / age / arc-shape catalog and the curated virtue list.
 * This module is a LEAF: it imports from NEITHER `./index` (the barrel) NOR
 * `./wizardGraph`. Keeping these definitions here — instead of in the barrel —
 * breaks the `index` <-> `wizardGraph` circular import that otherwise crashes
 * the compiled ESM/CJS output with a temporal-dead-zone
 * "Cannot access 'TIERS' before initialization" error at load time.
 *
 * The barrel re-exports everything here, so the public API of `@wwt/domain` is
 * unchanged: every `import { TIERS, ... } from "@wwt/domain"` still resolves.
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
