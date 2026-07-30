# Arc continuation: new arcs inside an existing Storyworld

**Status:** accepted (2026-07-29)

Closes the last MVP-board issue, #10, which ADR-0003 deliberately parked as franchise depth. A Storyworld is the unit of canon and owns **many** arcs (SPEC #21); this ADR records how a *second* (and fifth) arc is authored inside one without contradicting the art, the canon, or the prior tales.

ADR-0001 (many-arcs-per-world storage) and ADR-0002 (single-pass authoring, cast diffed against canon) were designed so this would be additive. It was: the pipeline already reused recurring canon for free and capped only new entities. The decisions below are the ones that had to be *made* rather than inherited.

## Decisions

### 1. The DECK, not the bible, is the id contract — and the model is told it

`diffCastAgainstCanon` matches recurring cast on exact `entityId`. Nothing in the authoring prompt told the model what those ids were: it received only the (LLM-maintained) Story Bible. A returning hero therefore came back as a *fresh* entity, was redrawn, and the child saw a second face for the same character.

`writeArc` now takes a **canon roster** (`entityId`, `role`, `canonName`, `appearanceNote`) derived from `Storyworld.deck`, with a hard instruction to reuse those exact ids and never re-describe them. The deck is the authority because the deck is what the diff compares against; the bible can drift, the locked art cannot.

### 2. The model's returned bible is a DELTA, merged append-only

`updateBible` returns a whole `StoryBible`, which means on arc 4 the model can quietly summarize arcs 1–3 out of existence — indistinguishable from an intentional edit, and only discovered when arc 5's prose forgets who somebody is.

`proxy/src/pipeline/bibleMerge.ts` now folds it onto prior canon: event log appends, entity sheets merge by id (prior facts kept; a prior `appearanceNote` **wins**, because it mirrors art already locked forever), world state and relationships append-if-missing, threads carry through untouched. Prior canon cannot be lost; the model can only add.

### 3. Bookkeeping the pipeline knows is stamped, not prompted

The arc id is minted **before** the bible call so the new event-log row and any new hook point at the real arc. The lesson comes from the wizard's teaching point, and `virtuesTaught` appends per arc (a virtue taught twice is reinforcement — a set union would hide that). The springboard the parent continued is marked `resolved` deterministically: asked in prose, models forget, and an unresolved thread is offered as a fresh idea forever.

### 4. Continue-mode gates the canon questions — not "a thread was picked"

The wizard graph previously hid world/hero/villain when a thread was *chosen*. Declining the springboard therefore re-asked "what's your world / who's the hero" for a world whose answers are locked in art. Gating is now on `__continuing`, so the springboard stays purely optional (SPEC #24 "never mandated") without that side effect. One continue-only node (`newTwist`, "what happens this time?") replaces the three hidden ones as the parent's steering lever.

### 5. A world screen, because "which arc?" is now a real question

The shelf used to open a world's newest arc directly. With many arcs per world that is a silent choice, so tapping a shelf card now opens the world itself: its tales (each re-readable), its canon deck, and ＋ Weave a new tale. The shelf keeps loading summaries only — no payload parse to reach it.

### 6. Saving a continued arc is a merge, in the persistence layer

`persistFinishedWorld` loads the stored world and folds the new arc into it: deck union by `entityId` with the **stored** card winning (art is never redrawn), `arcIds` appended, and `name` / `artStyle` / `createdAt` / `defaultAgeBand` preserved — the shelf label and "kept since" belong to the world, not to its latest arc. The merge lives behind the existing function so both call paths stay identical and the rule is unit-testable.

### 7. The resolved art style round-trips

`GenerateArcResponse` now carries the `ArtStyle` the cards were actually drawn through (including `providerStyleRef`), which is persisted and sent back with the next arc. Re-deriving it from a preset each time would let arc 5's art drift from arc 1's, which SPEC #22 forbids.

### 8. The world leaves the device with its art refs blanked

`GenerateArcRequest.world` needs entityIds, appearance notes, the bible, and the style handle. `lockedImageRef` is an on-device blob path — useless server-side — so it is blanked before sending rather than shipping the reader's filesystem layout to the proxy.

## Also fixed in passing

Card-Pick keyed the parent's picks by `role`, so two new hero/villain-class entities in one arc collided (one tapped look applied to both). Now keyed by `entityId`. Continuation makes multi-antagonist arcs likelier, and the fix sits inside code this change already touched.

## Consequences

- Recurring canon is free and unlimited; the per-tier cap is spent only on genuinely new entities — so a long-running world gets *cheaper* to extend, not more expensive.
- The Viewer must union the stored deck with the response's cards, since a continued arc deals art locked in an earlier arc.
- Verified with unit + acceptance tests against fakes (weave → continue → assert reused art, merged bible, resolved thread, both tales re-readable). A real-provider run confirming that the live model honors the roster's ids has **not** been done; that is the one continuation risk still open.
