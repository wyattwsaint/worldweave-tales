# Single-pass arc authoring: one source of truth for cast + placement

**Status:** accepted (2026-07-18)

The authoring LLM call returns the arc's **beats and its cast in one structured response**, using consistent entity ids across both: `{ beats: [{ text, spineBeat, dealtCardIds }], cast: [{ entityId, role, appearanceNote, firstBeatIndex }] }`. That call is the single source of truth for both prose and card placement. Entity resolution becomes a **deterministic diff** of the cast against existing canon — not a second, independently-hallucinating LLM call.

## Why

Today there are two independent LLM sources of entity ids with no reconciliation: `writeArc` emits `beat.dealtCardIds` inline, while a separate `extractNewEntities` call returns the canonical cast. When they disagree (prose says `dragon`, extraction canonizes `green-dragon`), the card is generated but **dealt onto no beat → never rendered**. That mismatch is the bug class behind "only hero/villain art shows" (#2) and "no inline images" (#3). Merging into one pass also generates the whole arc coherently, which is the structural fix for choppy, disconnected-beat prose (#7) — so #2, #3, and #7 share one refactor.

## Considered options

- **Two-pass + fuzzy reconciliation** — rejected: a new fragile matching layer and failure surface.
- **Entity-first (fix cast before prose)** — rejected: entities naturally emerge while writing; fixing them up front handcuffs the prose.
- **Single-pass authoring (chosen).**

## Consequences

- `dealtCardIds` are populated from the authoring pass; "order of appearance" is authoritative via `firstBeatIndex` / the first beat that lists an id.
- If the cast exceeds the tier's new-entity cap, capped-out ids are **stripped from `dealtCardIds`** (no dangling refs); hero/villain and the parent's explicit picks always survive the cap (SPEC §2.20).
- MVP simplification: because continuation is deferred, each Storyworld has exactly one arc, so there is no reused-canon dealing to reconcile yet — the response shape only needs to *accommodate* it later.
