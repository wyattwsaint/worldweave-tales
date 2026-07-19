# Single-pass arc authoring: one source of truth for cast + placement

**Status:** accepted (2026-07-18)

**Amended 2026-07-18** — the shapes below reflect the *locked, as-built* design. The original pre-implementation shape (beats carried `dealtCardIds`) was superseded during build; the original decision context (Why / Considered options) is preserved intact. See the **Amendment (2026-07-18) — review decisions** section for the two build-time findings that hardened it.

The authoring LLM call returns the arc's **beats and its cast in one structured response**, using consistent entity ids across both: `{ beats: [{ text, spineBeat }], cast: [{ entityId, role, appearanceNote, firstBeatIndex }] }`. Beats are **prose-only** — the model emits `cast` but does **not** emit `dealtCardIds`; card placement is derived by the pipeline from `cast.firstBeatIndex` (see Consequences). That call is the single source of truth for both prose and card placement. Entity resolution becomes a **deterministic diff** of the cast against existing canon — not a second, independently-hallucinating LLM call.

## Why

Today there are two independent LLM sources of entity ids with no reconciliation: `writeArc` emits `beat.dealtCardIds` inline, while a separate `extractNewEntities` call returns the canonical cast. When they disagree (prose says `dragon`, extraction canonizes `green-dragon`), the card is generated but **dealt onto no beat → never rendered**. That mismatch is the bug class behind "only hero/villain art shows" (#2) and "no inline images" (#3). Merging into one pass also generates the whole arc coherently, which is the structural fix for choppy, disconnected-beat prose (#7) — so #2, #3, and #7 share one refactor.

## Considered options

- **Two-pass + fuzzy reconciliation** — rejected: a new fragile matching layer and failure surface.
- **Entity-first (fix cast before prose)** — rejected: entities naturally emerge while writing; fixing them up front handcuffs the prose.
- **Single-pass authoring (chosen).**

## Consequences

- `beat.dealtCardIds` is **pipeline-derived**, not authored: the pipeline buckets the **retained** cast onto beats by `firstBeatIndex` — the single source of placement. Because every dealt id comes from a cast member the pipeline chose to keep, dangling card refs are **structurally impossible**.
- Cap handling: `{hero, villain}` are **must-keep** and **override** the new-entity cap (they survive even when the cap is < 2); remaining slots fill by `firstBeatIndex` order. **Dropped** entities are never bucketed onto any beat, so no dangling refs. "Parent explicit picks survive" is a **forward-compat no-op** for MVP — no picks exist at authoring time, so it is documented but nothing is built for it. (SPEC §2.20.)
- MVP simplification: because continuation is deferred, each Storyworld has exactly one arc, so there is no reused-canon dealing to reconcile yet — the response shape only needs to *accommodate* it later.

## Amendment (2026-07-18) — review decisions

Two build-time review findings hardened the as-built design:

- **F1 — entityId threading.** `GeneratedCardChoice` carries `entityId` + `appearanceNote`, threaded **cast → pick → canonized Card**, so the Card's `entityId` matches the beat's derived `dealtCardIds`. Without this, real-LLM hero/villain cards dangle (the stub only worked because its cast used `entityId === role`).
- **F2 — updateBible merge.** Tolerant Zod (omitted sections → `undefined`, explicit `[]` respected); `updateBible` merges `parsed.X ?? prior?.X ?? []` against `priorBible`, so a partial model reply no longer wipes prior canon. This also fixed the prior HTTP-500 (relationships-as-object / missing `entityId`·`facts`·`appearanceNote`).
