# Worldweave Tales — MVP AFK Execution Spec

**Origin:** grilling session 2026-07-18 (`/grill-with-docs`). This spec turns that
session into an autonomous (AFK) build plan. It is self-contained: an agent should
be able to execute a phase end-to-end from this document plus the linked ADRs.

**Read first:** `SPEC.md` (product design), `CONTEXT.md` (domain glossary),
`docs/adr/0001-on-device-persistence.md`, `docs/adr/0002-single-pass-arc-authoring.md`,
`docs/adr/0003-mvp-scope-and-sequence.md`.

**Target:** a durable, polished, **re-readable core experience** (create a Storyworld →
persist → re-read). NOT store-submittable. Build 9 of 10 open issues; **defer #10**
(arc continuation) to v1.1.

**Out of scope (tracked separately, do NOT build here):** PDF export + email (SPEC §4.7);
abuse/attestation layers (SPEC §6).

---

## How to work (applies to every phase)

- **Branch per phase** off `main` (e.g. `feat/persistence-4`); never commit straight to `main`.
- **TDD** (the `tdd` skill is installed): write the failing test first, then the code. Every
  phase below lists its red tests.
- **Definition of done for a phase:** its issue's acceptance met, `npm test` green across
  affected packages, `npm run typecheck` clean, and — where the phase has a runtime surface —
  on-device or smoke verification performed and noted in the PR.
- **Commit trailer:** end commit messages with the repo's Co-Authored-By trailer.
- **Proxy smoke:** `npm run dev:proxy` then `POST /v1/generate` (stub mode needs no key; the
  non-stub path needs `LLM_API_KEY` on the proxy — note: `LLM_API_KEY`, not `ANTHROPIC_API_KEY`).
- **On-device:** Expo Go, physical phone on the same Wi-Fi; `app.json` `extra.proxyBaseUrl`
  points at the dev machine LAN IP; `cd app && npx expo start`, scan QR.

## Phase order (forced by the dependency graph)

`#1 (split)` → `#4` → `#2 + #3` → `#8` → `#5` → `#9` → `#6`, with `#7` floating (proxy-only).
Each phase's precondition is the prior phase merged, except #7 which may run anytime.

---

## Phase 0 — #1 Card art renders (split)

**Decision (ADR-0003):** land only the durable *proxy* half now; the app-side `<Image>`
render is deferred into Phase 2, where the Viewer is rebuilt anyway (don't write it twice).

**Task:** bring the proxy commit `27765f3` ("route new-world card art through `ensureStyle`")
from branch `feat/real-art-card-generation` onto `main`.

**Steps:**
1. Branch `fix/proxy-ensurestyle-1` off `main`.
2. `git cherry-pick 27765f3`. Expect a conflict in `proxy/src/pipeline/generateArc.ts` — it has
   moved on `main` since the branch (TDZ catalog extraction + repair-retry). Resolve by keeping
   `main`'s structure and re-applying only the `ensureStyle` routing for the new-world path.
3. Do **not** cherry-pick `6378006` (the app `<Image>` commit) — that work moves to Phase 2.

**Tests (red first):** port/keep the relevant assertions from `proxy/src/pipeline/generateArc.test.ts`
proving new-world card generation calls `ensureStyle` and uses the returned `providerStyleRef`.

**Acceptance:** proxy tests green; `POST /v1/generate` for a new world routes art through
`ensureStyle` (not the stub default) when a real image provider is configured.

**Verify:** proxy smoke — boot proxy, generate, confirm no regression (HTTP 200, valid arc).

**Closes:** #1 is *partially* addressed; it fully closes when Phase 2 renders the images. Note
this in the #1 issue.

---

## Phase 1 — #4 Persistence (keystone)  ·  ADR-0001

**Precondition:** Phase 0 merged.

**Goal:** stories, worlds/bibles, and locked art survive app restart. Replace `InMemoryStore`
with a real on-device store; download card image bytes to a local blob and point
`lockedImageRef` at the blob, not the ephemeral Recraft URL.

**Decisions (ADR-0001):** hybrid SQLite rows (indexed columns + JSON `payload_json`) for
`storyworlds` and `arcs`; images as files under a blob dir referenced by **relative** path;
`PRAGMA user_version` forward-migration ladder; extend the existing `LocalStore` seam, keep
`InMemoryStore` as the test double.

**Files:**
- `app/package.json` — add `expo-sqlite`, `expo-file-system` (SDK 54-compatible versions).
- `app/src/storage/localStore.ts` — extend `LocalStore` with `saveArc(arc)`, `getArc(id)`,
  `listArcs(worldId)`.
- `app/src/storage/sqliteStore.ts` — **new** `SqliteStore implements LocalStore`; schema
  `storyworlds(id, name, created_at, cover_ref, payload_json)`,
  `arcs(id, world_id, created_at, title, payload_json)`; migration runner keyed on `user_version`.
- `app/src/storage/blobStore.ts` — **new**: download a remote image URL → file under
  `documentDirectory/blobs/`, return the relative path; resolve relative→absolute for rendering.
- `app/src/storage/store.ts` — production singleton switches to `SqliteStore`; tests keep `InMemoryStore`.
- Persist call site: after a successful generation (where the world/arc are assembled in the app
  flow — see `app/src/screens/ViewerScreen.tsx` / `NavContext.tsx`), download each new card's art
  to a blob, rewrite `lockedImageRef`, then `saveWorld` + `saveArc`.

**Tests (red first):**
- `SqliteStore` round-trips a `Storyworld` and an `Arc` (save → get → deep-equal), across a fresh
  DB handle (proves durability, not just in-memory).
- `listWorlds`/`listArcs(worldId)` return the indexed summary rows.
- migration runner: opening an old `user_version` applies migrations forward without data loss.
- `blobStore`: given a fake fetch returning bytes, writes a file and returns a **relative** path;
  a returning read resolves it to a readable absolute path.

**Acceptance:** create a story, kill the app, relaunch → the world, its arc, and its locked art
are still present and the images still render (from the blob, not a dead URL). Satisfies SPEC §2.22
(art locked forever) and §5 (local-first).

**Verify:** on-device — generate, force-quit Expo Go, reopen, confirm persistence + art survives.

**Closes:** #4.

---

## Phase 2 — #2 all-entity art + #3 inline images  ·  ADR-0002

**Precondition:** Phase 1 merged.

**Goal:** every card-worthy entity (not just hero/villain) gets a card, and each card renders
**inline** in the story at the beat where its entity first appears, in reading order.

**Decision (ADR-0002):** single-pass authoring. The authoring LLM call returns
`{ beats: [{ text, spineBeat, dealtCardIds }], cast: [{ entityId, role, appearanceNote, firstBeatIndex }] }`
in one response with **consistent ids**. `dealtCardIds` come from that call; entity resolution
becomes a deterministic diff of `cast` against existing canon. Capped-out entities are stripped
from `dealtCardIds` (no dangling refs); hero/villain + explicit parent picks always survive the cap.
MVP: one arc per world, so all cast is new.

**Files:**
- `packages/domain/src/index.ts` — extend the authoring response type with `cast` (+ `firstBeatIndex`).
- `proxy/src/providers/llmProvider.ts` — merge `writeArc` + `extractNewEntities` into one authoring
  call returning `{ beats, cast }`; `extractNewEntities` (or its replacement) becomes a pure diff.
- `proxy/src/pipeline/generateArc.ts` — populate each `beat.dealtCardIds` from the cast's
  first-appearance; enforce the cap by **selecting** cast (hero/villain/explicit picks first) and
  **stripping** dropped ids from `dealtCardIds`; generate a card for every retained cast entity
  (loop already exists for `capped`).
- `app/src/screens/ViewerScreen.tsx` — render each beat's `dealtCardIds` as inline `<Image>`
  (blob-backed, from Phase 1), in beat order; this is where the deferred #1 app render lands.
- `app/src/screens/CardPickScreen.tsx` — render hero/villain variant `<Image>`s (deferred #1 part).

**Tests (red first):**
- authoring pass returns beats whose `dealtCardIds` ids all exist in `cast` (no dangling ids).
- pipeline: given a cast of 5 with `newEntityCap` 3, exactly 3 cards generated, hero+villain
  retained, and no `dealtCardIds` references a dropped entity.
- pipeline: a non-hero/villain entity (e.g. a `place`) gets a card and is dealt onto its
  first-appearance beat.
- Viewer render test: a beat with N `dealtCardIds` renders N images in order.

**Acceptance:** generated story shows art for companions/places/artifacts, each appearing inline
at first mention in order; no card is generated-but-unshown.

**Verify:** on-device — generate an Epic-tier story; confirm multiple entity cards appear inline
in the right order.

**Closes:** #2, #3, and the remainder of #1.

---

## Phase 3 — #8 Library

**Precondition:** Phase 1 merged (Phase 2 recommended, for thumbnails).

**Goal:** a persistent bookshelf to browse and re-open past stories.

**Files:**
- `app/src/screens/LibraryScreen.tsx` — **new**: `store.listWorlds()` → grid/list (title +
  cover thumb from `cover_ref` + date); tap → open that world's arc in the Viewer; empty state.
- `app/src/nav/` — make the Library the **home** surface; "＋ New Story" launches the Wizard
  (bookshelf-first, per the design-pass note).

**Tests (red first):** Library lists saved worlds from the store; selecting one navigates to the
Viewer with that arc; empty state renders when the store is empty.

**Acceptance:** create two stories, return to the shelf, re-open either → full prose + art re-render
with no network. Satisfies SPEC §2.14 ("library lives on the device").

**Verify:** on-device — create, navigate home, re-open, confirm re-read works offline.

**Closes:** #8.

---

## Phase 4 — #5 UI overhaul → #9 loading → #6 icon

**Precondition:** Phases 1–3 merged (data shapes frozen).

### 4a · #5 UI overhaul
- **Design-direction pass first** (use `frontend-design` + `the-10k-checklist` skills): lock
  palette (incl. night variant), type pairing (display + read-aloud body), spacing/shape/elevation,
  and the recurring **motif**. Output: `app/src/theme/tokens.ts` + one proof screen (Viewer) rebuilt.
- Then rebuild each screen (Wizard, CardPick, Viewer, Library) against tokens + a small component
  set (`Screen`, `Text`, `Button`, `Card`, `Thumb`). No heavy UI-library dependency.
- **Acceptance:** every screen on one token system; accessible (contrast, touch targets, dynamic
  type, reduce-motion); reads premium, not default-RN.
- **Closes:** #5.

### 4b · #9 Loading experience
- Timer-based, **tier-scaled** ETA (Epic ≫ Beginner by card count); rotating phrases mapped to the
  real pipeline stages; on-brand animation (quill/stars/pages); reduce-motion + night palette.
- Real SSE progress is **deferred to v1.1** (ADR-0003).
- **Acceptance:** during generation the parent sees an animated graphic, rotating phrases, and a
  bounded progress/ETA. **Closes:** #9.

### 4c · #6 App icon + splash
- Design icon + adaptive icon + splash sharing #5's motif/palette; export the asset set into
  `app/assets/`; wire `expo.icon`/`expo.splash`/`expo.android.adaptiveIcon`/`expo.ios` in `app.json`;
  keep an editable master (SVG/layered) in-repo.
- **Verify:** on-device — icon on home screen, splash on launch. **Closes:** #6.

---

## Floating — #7 Prose quality (proxy-only, anytime)

Largely **absorbed by ADR-0002** (single coherent pass fixes choppy per-beat concatenation).
Residual work: layer **voice craft** into the authoring prompt — read-aloud cadence, sentence-length
variety, warm connected transitions, age-appropriate imagery, few-shot exemplars; discourage listy
output. Add a small set of read-aloud golden checks.
**Files:** `proxy/src/providers/llmProvider.ts` (prompt builder), a golden-sample test.
**Acceptance:** stories read smoothly aloud with connected beats and consistent voice; no obvious
AI cadence. **Closes:** #7.

---

## Deferred / tracked separately (not built here)

- **#10 Arc continuation** — v1.1. The Phase 1 schema already holds many-arcs-per-world, so this is
  additive (diff cast against existing deck; deal reused canon; offer open threads).
- **PDF export + email** (SPEC §4.7) — file as an issue.
- **Abuse/attestation** (SPEC §6) — file as an issue.
