# MVP scope and build sequence for closing the issue board

**Status:** accepted (2026-07-18)

The target for this push is a **durable, polished, re-readable core experience** — create a Storyworld → persist it → re-read it — **not** a store-submittable release. We build **9 of the 10 open issues** and **defer #10 (arc continuation)** to v1.1, designing the persistence schema (ADR-0001) to hold many-arcs-per-world so continuation is additive rather than a rewrite.

## Explicitly out of scope for this push

Two SPEC-mandated *ship* requirements are **not** on the issue board and are deliberately excluded here, tracked separately so "wrap up the 10 issues" is not mistaken for "store-ready":

- **PDF export + email** (SPEC §4.7, §1) — the stated ownership artifact.
- **Abuse / attestation layers** (SPEC §6) — App Attest / Play Integrity / global kill-switch.

Rationale: both are monetization/ship-gating and separable from *proving the core experience*. Continuation (#10) is franchise depth not required for a first create/keep/re-read loop.

## Build sequence (forced by the dependency graph)

1. **#1 — split.** Cherry-pick the durable *proxy* unblock (`27765f3`, route new-world art through `ensureStyle`) now; fold the app-side `<Image>` render into Phase 2 (the Viewer is reworked there anyway, so it isn't written twice).
2. **#4 persistence** — keystone; gates everything below.
3. **#2 + #3** — all-entity art + inline placement; share the authoring pass (ADR-0002) and the Viewer surface, so built together.
4. **#8 library** — makes create → keep → re-read real.
5. **#5 UI overhaul** → **#9 loading** → **#6 icon** — #5 begins with a design-direction pass that locks tokens + motif; #9 and #6 inherit them.
- **#7 prose** floats — proxy-only, independent; landed as part of the ADR-0002 authoring pass plus voice-craft prompt guidance.

## Approach decisions locked during grilling

- Persistence: hybrid SQLite + blob store (ADR-0001).
- Authoring: single-pass, one source of truth for cast + placement (ADR-0002).
- Loading (#9): estimated timer, tier-scaled, phrases mapped to real pipeline stages; real SSE deferred to v1.1.
- UI (#5): in-house tokens + a small reusable component set (no heavy UI-library dependency); design-direction pass first.
