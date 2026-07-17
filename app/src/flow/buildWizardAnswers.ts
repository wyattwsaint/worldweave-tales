import type { AgeBand, ArcShape, TeachingPoint, Tier, WizardAnswers } from "@wwt/domain";

/**
 * Raw picks collected by the wizard UI. This is intentionally looser than
 * {@link WizardAnswers}: teaching point is captured as a chosen virtue OR a
 * free-text situation, and free-text choices may contain empty strings the
 * parent never filled in.
 */
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

/**
 * Normalize raw wizard picks into a valid {@link WizardAnswers}:
 * - resolves the correct {@link TeachingPoint} union variant,
 * - drops empty/whitespace free-text choices (trimming the rest),
 * - applies defaults (closingVerseEnabled = false).
 */
export function buildWizardAnswers(raw: RawWizardPicks): WizardAnswers {
  const teachingPoint = toTeachingPoint(raw);
  const choices = cleanChoices(raw.choices);

  const answers: WizardAnswers = {
    tier: raw.tier,
    ageBand: raw.ageBand,
    teachingPoint,
    closingVerseEnabled: raw.closingVerseEnabled ?? false,
    choices,
  };

  if (raw.shape !== undefined) answers.shape = raw.shape;
  if (raw.worldId !== undefined) answers.worldId = raw.worldId;
  if (raw.continueThreadId !== undefined) answers.continueThreadId = raw.continueThreadId;

  return answers;
}

function toTeachingPoint(raw: RawWizardPicks): TeachingPoint {
  const virtue = raw.virtue?.trim();
  if (virtue) return { kind: "virtue", virtue };

  const description = raw.situation?.trim();
  if (description) return { kind: "situation", description, heavy: raw.heavy ?? false };

  throw new Error("buildWizardAnswers: a virtue or a situation is required for the teaching point");
}

function cleanChoices(choices: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(choices)) {
    const trimmed = value?.trim();
    if (trimmed) out[key] = trimmed;
  }
  return out;
}
