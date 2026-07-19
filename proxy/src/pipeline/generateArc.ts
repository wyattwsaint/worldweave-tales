import type {
  Arc,
  Beat,
  Card,
  GenerateArcRequest,
  GenerateArcResponse,
  GeneratedCardChoice,
  Storyworld,
} from "@wwt/domain";
import { ARC_SHAPES, TIERS } from "@wwt/domain";
import type { ImageProvider } from "../providers/imageProvider.js";
import type { LlmProvider } from "../providers/llmProvider.js";
import {
  capNewCast,
  deriveDealtCardIds,
  diffCastAgainstCanon,
} from "./castResolution.js";

/**
 * The up-front generation pipeline. ALL generation happens here, once, before
 * the parent ever reads the book — there is no mid-story spinning.
 *
 * Steps (SPEC.md §4):
 *   1. pick arc shape (engine auto-picks + anti-repeats for Beginner)
 *   2. write prose inside the invariant spine
 *   3. resolve entities: REUSE locked canon; only genuinely NEW ones cost
 *   4. generate cards for new entities (respecting the per-tier NEW cap)
 *      - hero/villain-class -> variants for a parent pick (canonized later)
 *      - others            -> single AI-derived card, canonized now
 *   5. update the Story Bible
 */
export async function generateArc(
  req: GenerateArcRequest,
  deps: { image: ImageProvider; llm: LlmProvider; now: () => string },
): Promise<GenerateArcResponse> {
  const { answers, world } = req;
  const tier = TIERS[answers.tier];

  // 1. Arc shape.
  const shape = answers.shape ?? pickArcShapeAvoidingRepeat(world);

  // 2. Author the arc in ONE call: prose-only beats PLUS a transient cast (every
  //    entity that appears — new OR reused canon — each declaring its firstBeatIndex).
  const { beats: proseBeats, cast } = await deps.llm.writeArc({
    answers,
    shape,
    bible: world?.bible,
  });

  // 3. Resolve the cast against canon DETERMINISTICALLY (no LLM): recurring canon
  //    is free & unlimited; fresh entities are subject to the per-tier NEW cap.
  const existingIds = (world?.deck ?? []).map((c) => c.entityId);
  const { recurring, fresh } = diffCastAgainstCanon(cast, existingIds);
  const { kept } = capNewCast(fresh, tier.newEntityCap);

  // 4. Retained cast = recurring canon + kept-fresh. Only these are ever dealt, so
  //    a beat can never reference a dropped/never-canonized card (dangling refs are
  //    structurally impossible). Derive each beat's dealtCardIds by bucketing the
  //    survivors by firstBeatIndex, promoting the prose beats to full Beats.
  const survivors = [...recurring, ...kept];
  const dealtByBeat = deriveDealtCardIds(survivors, proseBeats.length);
  const beats: Beat[] = proseBeats.map((b, i) => ({
    ...b,
    dealtCardIds: dealtByBeat[i] ?? [],
  }));

  // New cards are minted only for kept-FRESH cast (recurring canon already has art).
  const capped = kept;

  // Every world — including a brand-new one — locks its ONE art style through
  // the provider. A new world has no artStyle yet, so fall back to the MVP
  // pencil preset; routing through ensureStyle keeps the provider owning the
  // style decision (the real Recraft adapter rejects a raw "stub-style:*" ref).
  const artStyle = world?.artStyle ?? {
    presetId: "pencil-mvp",
    displayName: "Imaginative Pencil Sketch",
  };
  const providerStyleRef = (await deps.image.ensureStyle(artStyle)).providerStyleRef;

  const newCanonCards: Card[] = [];
  const pendingCardChoices: GeneratedCardChoice[] = [];

  for (const e of capped) {
    const needsParentPick = e.role === "hero" || e.role === "villain";
    const { imageRefs } = await deps.image.generateCardVariants({
      providerStyleRef,
      prompt: e.appearanceNote,
      count: needsParentPick ? 3 : 1,
    });

    if (needsParentPick) {
      // Parent taps to choose; canonization happens after the pick. Thread the
      // cast member's REAL entityId + appearanceNote so the canonized Card carries
      // the SAME id already bucketed into dealtCardIds (no dangling ref on a real
      // model whose hero entityId != "hero").
      pendingCardChoices.push({
        entityId: e.entityId,
        role: e.role,
        appearanceNote: e.appearanceNote,
        variantImageRefs: imageRefs,
      });
    } else {
      newCanonCards.push({
        entityId: e.entityId,
        role: e.role,
        canonName: e.entityId,
        traits: [],
        appearanceNote: e.appearanceNote,
        lockedImageRef: imageRefs[0], // locked forever, never regenerated
        relationships: [],
        canonizedAt: deps.now(),
      });
    }
  }

  // 5. Update bible.
  const bible = await deps.llm.updateBible({
    priorBible: world?.bible,
    beats,
    answers,
  });

  const arc: Arc = {
    id: `arc-${deps.now()}`,
    worldId: answers.worldId ?? "new-world",
    tier: answers.tier,
    ageBand: answers.ageBand,
    shape,
    teachingPoint: answers.teachingPoint,
    closingVerseEnabled: answers.closingVerseEnabled,
    beats,
    createdAt: deps.now(),
  };

  return { arc, newCanonCards, pendingCardChoices, bible };
}

/** Beginner: auto-pick a shape not used by the world's most recent arc. */
function pickArcShapeAvoidingRepeat(world?: Storyworld) {
  const recent = world?.bible.eventLog.at(-1);
  const recentShape = (recent as unknown as { shape?: string })?.shape;
  const candidates = ARC_SHAPES.filter((s) => s !== recentShape);
  // Deterministic pick for the scaffold; real code can weight by fit/variety.
  return candidates[0];
}
