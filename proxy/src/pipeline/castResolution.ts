import type { CardRole, CastMember } from "@wwt/domain";

/**
 * Deterministic (non-LLM) resolution of the authoring model's transient `cast`
 * against existing canon. This is the heart of the ADR-0002 amendment: the model
 * emits WHERE each entity first appears (`firstBeatIndex`); the pipeline decides
 * WHO survives and DERIVES each `beat.dealtCardIds` here — so a beat can never
 * reference a card that was never canonized (dangling refs are structural).
 */

/**
 * Roles that always survive cap enforcement. A story without its hero or villain
 * is broken, so these override the per-tier NEW-entity cap even when the cap is
 * smaller than the number of must-keeps.
 */
const MUST_KEEP_ROLES = new Set<CardRole>(["hero", "villain"]);

/**
 * Split the emitted cast into RECURRING (entityId already in canon — free and
 * unlimited) vs FRESH (new to this world — subject to the per-tier cap).
 *
 * A model that lists the same entityId twice is collapsed to a single member at
 * its EARLIEST appearance, so it is neither double-billed nor double-dealt.
 */
export function diffCastAgainstCanon(
  cast: CastMember[],
  existingEntityIds: readonly string[],
): { recurring: CastMember[]; fresh: CastMember[] } {
  const canon = new Set(existingEntityIds);
  const deduped = dedupeByEarliestAppearance(cast);
  const recurring: CastMember[] = [];
  const fresh: CastMember[] = [];
  for (const m of deduped) {
    (canon.has(m.entityId) ? recurring : fresh).push(m);
  }
  return { recurring, fresh };
}

/**
 * Enforce the per-tier NEW-entity cap over FRESH cast only (recurring canon is
 * free). Must-keeps (hero/villain) always survive; the remaining slots fill from
 * the rest in `firstBeatIndex` order. Dropped members are returned so the caller
 * can be sure never to bucket them — that is what keeps refs from dangling.
 */
export function capNewCast(
  fresh: CastMember[],
  cap: number,
): { kept: CastMember[]; dropped: CastMember[] } {
  const mustKeeps = fresh.filter((m) => MUST_KEEP_ROLES.has(m.role));
  const rest = fresh
    .filter((m) => !MUST_KEEP_ROLES.has(m.role))
    .sort((a, b) => a.firstBeatIndex - b.firstBeatIndex);

  const remainingSlots = Math.max(0, cap - mustKeeps.length);
  const kept = [...mustKeeps, ...rest.slice(0, remainingSlots)];

  const keptIds = new Set(kept.map((m) => m.entityId));
  const dropped = fresh.filter((m) => !keptIds.has(m.entityId));
  return { kept, dropped };
}

/**
 * Bucket the retained cast (recurring + kept-fresh) into per-beat `dealtCardIds`
 * by `firstBeatIndex`. Returns exactly `beatCount` arrays, in beat order.
 *
 * An out-of-range index is clamped into `[0, beatCount - 1]` so a retained entity
 * is always dealt onto a REAL page — a model that over-shoots the last beat can
 * never produce a card that renders nowhere. Duplicate ids within a beat collapse.
 */
export function deriveDealtCardIds(
  survivors: CastMember[],
  beatCount: number,
): string[][] {
  const buckets: string[][] = Array.from({ length: beatCount }, () => []);
  if (beatCount === 0) return buckets;
  const lastBeat = beatCount - 1;
  for (const m of survivors) {
    const idx = Math.min(Math.max(m.firstBeatIndex, 0), lastBeat);
    if (!buckets[idx].includes(m.entityId)) buckets[idx].push(m.entityId);
  }
  return buckets;
}

/** Collapse repeated entityIds to a single member at its earliest firstBeatIndex,
 *  preserving first-seen order for stable, deterministic downstream buckets. */
function dedupeByEarliestAppearance(cast: CastMember[]): CastMember[] {
  const byId = new Map<string, CastMember>();
  for (const m of cast) {
    const prev = byId.get(m.entityId);
    if (!prev || m.firstBeatIndex < prev.firstBeatIndex) {
      // Keep the original insertion position but adopt the earliest index.
      byId.set(m.entityId, prev ? { ...prev, firstBeatIndex: m.firstBeatIndex } : m);
    }
  }
  return [...byId.values()];
}
