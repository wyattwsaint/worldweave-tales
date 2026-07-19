# Worldweave Tales

A parent-led children's bedtime-story app: the parent directs by choosing, the AI writes prose and makes the art. This glossary is the shared language for the domain. It is a glossary only — no implementation details. See `SPEC.md` for the product design and `docs/adr/` for architectural decisions.

## Language

### Canon (the persistent world)

**Storyworld**:
The unit of canon. Owns exactly one canonical deck, one Story Bible, and many arcs. A parent may have several.
_Avoid_: World, universe, project.

**Arc**:
One finished ~10-minute book — a sequence of beats that deal the Storyworld's cards. In the MVP a Storyworld has exactly one arc; multiple arcs per world arrive with continuation (deferred).
_Avoid_: Book, story, chapter, episode.

**Canonical Deck**:
The set of all locked cards in a Storyworld.
_Avoid_: Gallery, collection.

**Card**:
The canonical art for one entity, drawn once and locked forever, then reused everywhere it appears. Identity lives in the fixed card; interaction lives in the words.
_Avoid_: Picture, illustration, image (as the noun for a card).

**Story Bible**:
The per-Storyworld narrative canon — entity sheets, event log, world state, open threads, virtues taught. Injected into each generation as hard constraints so continuity holds.
_Avoid_: Lore doc, notes, memory.

**Open thread**:
A gentle, hopeful end-of-arc hook saved in the Bible. A future wizard *offers* it as an optional springboard — never mandated, never a peril cliffhanger.
_Avoid_: Cliffhanger, sequel hook, to-do.

### An arc's structure

**Beat**:
One page of an arc: a spine beat, its prose text, and the cards dealt onto it.
_Avoid_: Page (page is the rendered form), paragraph, scene.

**Spine**:
The invariant beat skeleton every arc must follow: conflict → virtue tested → good triumphs + lesson earned + safe → gentle hook. Always enforced.
_Avoid_: Plot, structure, outline.

**Arc shape**:
A curated story-type template laid over the spine (Quest, Rescue, Mystery, Lost & Found Home, Rivalry→Friendship, Overcoming a Fear...). Beginner auto-picks; Solid/Epic the parent picks.
_Avoid_: Genre, template, plot type.

**Dealt**:
A card is *dealt* onto a beat when it is placed on that page and rendered there. A card is dealt at its first appearance, in reading order.
_Avoid_: Attached, shown, placed.

### Cast and entities

**Cast**:
The set of card-worthy entities in an arc — new ones plus reused canon. Produced by the single authoring pass alongside the beats (see ADR-0002).
_Avoid_: Characters (too narrow — includes places and artifacts), entities (use for the broader set).

**Card-worthy entity**:
An entity that earns a card — a hero, villain, companion, place, or artifact of narrative weight — as opposed to incidental nouns that get no art.
_Avoid_: Character, object, thing.

**Parent-pick**:
Hero and villain art the parent chooses by tapping one of a few variants. All other cards are AI-derived and locked without a pick.
_Avoid_: Selection, vote.

### Dials

**Tier**:
Beginner / Solid / Epic. Scales story depth (how many questions, how much co-direction) and the new-entity cap. Art handling is uniform across tiers.
_Avoid_: Level, difficulty, plan.

**New-entity cap**:
The per-tier limit on how many *new* cards an arc may add (Beginner ~3, Solid ~6, Epic ~10). Reused canon is free and unlimited.
_Avoid_: Limit, quota, budget.

**Age band**:
The per-story age dial (toddler / preschool / early-reader) that flexes reading level, length, and card count so the hero can grow with the kid.
_Avoid_: Age group, reading level.

**Teaching point**:
The virtue (from a curated list) or real-life situation (free-text) that drives the arc's "test" beat and is logged in the Bible.
_Avoid_: Lesson (acceptable loosely, but "teaching point" is the model term), moral, theme.
