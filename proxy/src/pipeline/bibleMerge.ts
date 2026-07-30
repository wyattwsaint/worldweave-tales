import type { ArcSummary, EntitySheet, OpenThread, StoryBible } from "@wwt/domain";

/**
 * Deterministic (non-LLM) maintenance of the Story Bible across arcs — the
 * continuation twin of {@link ./castResolution.ts}.
 *
 * The authoring model returns a WHOLE bible, which means on arc 4 it can quietly
 * drop arcs 1–3: a summarized-away entity sheet or a shortened event log is
 * indistinguishable from a deliberate edit, and the parent would only find out
 * when arc 5's prose forgets who someone is. So the model's bible is treated as
 * a DELTA and merged APPEND-ONLY onto prior canon here. Prior canon can never be
 * lost; the model can only add.
 *
 * The bookkeeping the pipeline already knows for certain — this arc's id, the
 * virtue it taught, which springboard thread the parent continued — is stamped
 * deterministically rather than trusted to the model.
 */

export interface BibleMergeInput {
  /** Canon as it stood before this arc. Absent for a world's first arc. */
  prior?: StoryBible;
  /** What the model returned. Treated as additions, never as a replacement. */
  authored: StoryBible;
  /** This arc's id — stamps the new event-log row and any new thread's origin. */
  arcId: string;
  /** The virtue/lesson this arc taught, from the wizard answers. */
  virtueTaught: string;
  /** The open thread the parent chose as a springboard, if any. */
  continueThreadId?: string;
}

export function mergeBible(input: BibleMergeInput): StoryBible {
  const { prior, authored, arcId, virtueTaught, continueThreadId } = input;

  return {
    entitySheets: mergeSheets(prior?.entitySheets ?? [], authored.entitySheets ?? []),
    eventLog: appendArcSummary(prior?.eventLog ?? [], authored.eventLog ?? [], arcId, virtueTaught),
    worldState: appendMissing(prior?.worldState ?? [], authored.worldState ?? []),
    openThreads: resolveContinued(
      appendNewThreads(prior?.openThreads ?? [], authored.openThreads ?? [], arcId),
      continueThreadId,
    ),
    // Deliberately a per-arc APPEND (not a set union): a virtue taught twice is
    // reinforcement, and collapsing it would hide that from the anti-repeat logic.
    virtuesTaught: [...(prior?.virtuesTaught ?? []), virtueTaught],
  };
}

/**
 * Merge sheets by entityId. A prior sheet keeps its facts and gains any new
 * ones; its `appearanceNote` WINS while non-empty because it mirrors art that is
 * already locked forever (SPEC #22) — a re-described entity would drift from its
 * own picture. Genuinely new entities are appended.
 */
function mergeSheets(prior: EntitySheet[], authored: EntitySheet[]): EntitySheet[] {
  const merged = prior.map((sheet) => ({ ...sheet }));
  const byId = new Map(merged.map((s) => [s.entityId, s]));

  for (const next of authored) {
    if (!next.entityId) continue; // an id-less sheet can't be attached to canon
    const existing = byId.get(next.entityId);
    if (!existing) {
      const copy = { ...next };
      merged.push(copy);
      byId.set(copy.entityId, copy);
      continue;
    }
    existing.facts = appendMissing(existing.facts, next.facts ?? []);
    existing.relationships = appendMissing(existing.relationships, next.relationships ?? []);
    if (!existing.appearanceNote) existing.appearanceNote = next.appearanceNote ?? "";
  }
  return merged;
}

/**
 * Append exactly ONE row for this arc. The model's matching row supplies the
 * prose (summary / lesson / villain resolution); the arcId is always ours. A
 * model that returned no usable row still gets a row, so the event log never
 * skips an arc — a gap there reads to the next generation as "nothing happened".
 */
function appendArcSummary(
  prior: ArcSummary[],
  authored: ArcSummary[],
  arcId: string,
  virtueTaught: string,
): ArcSummary[] {
  const priorIds = new Set(prior.map((e) => e.arcId));
  const candidate =
    authored.find((e) => e.arcId === arcId) ??
    [...authored].reverse().find((e) => !priorIds.has(e.arcId)) ??
    authored.at(-1);

  const row: ArcSummary = {
    arcId,
    summary: candidate?.summary ?? "",
    lessonTaught: candidate?.lessonTaught || virtueTaught,
    ...(candidate?.villainResolution ? { villainResolution: candidate.villainResolution } : {}),
  };
  return [...prior, row];
}

/**
 * Carry every prior thread through UNCHANGED (including its `resolved` flag —
 * only {@link resolveContinued} may flip that) and append the model's genuinely
 * new hooks. A hook with no teaser is dropped: an empty springboard is worse
 * than none, because the wizard would offer the parent a blank choice.
 */
function appendNewThreads(
  prior: OpenThread[],
  authored: OpenThread[],
  arcId: string,
): OpenThread[] {
  const seen = new Set(prior.map((t) => t.id));
  const merged = prior.map((t) => ({ ...t }));
  let n = 0;
  for (const next of authored) {
    const teaser = next.teaser?.trim();
    if (!teaser) continue;
    // A model that omitted the id still gets a stable, arc-derived one.
    const id = next.id || `${arcId}-thread-${n++}`;
    if (seen.has(id)) continue;
    seen.add(id);
    merged.push({
      id,
      teaser,
      originArcId: next.originArcId || arcId,
      resolved: next.resolved === true,
    });
  }
  return merged;
}

/**
 * Mark the springboard the parent actually continued as resolved. Deterministic
 * on purpose: asked to do this in prose, a model forgets, and a thread that
 * never resolves keeps being offered as a fresh idea arc after arc.
 */
function resolveContinued(threads: OpenThread[], continueThreadId?: string): OpenThread[] {
  if (!continueThreadId) return threads;
  return threads.map((t) => (t.id === continueThreadId ? { ...t, resolved: true } : t));
}

/** `prior` order preserved; each `next` entry appended only if not already there. */
function appendMissing(prior: readonly string[], next: readonly string[]): string[] {
  const out = [...prior];
  for (const value of next) {
    if (!out.includes(value)) out.push(value);
  }
  return out;
}
