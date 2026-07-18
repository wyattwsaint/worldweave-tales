# On-device persistence: hybrid SQLite rows + file blob store

**Status:** accepted (2026-07-18)

We store each Storyworld and each Arc as a **hybrid** SQLite row — a few indexed columns for the queries the app actually makes (`storyworlds(id, name, created_at, cover_ref, payload_json)`, `arcs(id, world_id, created_at, title, payload_json)`) plus a **JSON payload** holding the full domain object. Locked card images are downloaded to a **file blob directory** and referenced by a **relative** path in `Card.lockedImageRef` (absolute `documentDirectory` can change across reinstalls; resolve at render time). Local-first, single-user, no accounts (SPEC §5).

## Considered options

- **Fully normalized relational** — tables for every nested type (cards, entity sheets, arc summaries, open threads, beats, beat–card join). Rejected: heavy shred/reassemble mapping to/from the rich nested domain types, buying cross-entity query power the MVP never uses.
- **Pure JSON document store** — rejected: no cheap list/filter for the Library (#8) without a table scan + parse.
- **Hybrid (chosen)** — indexed columns serve the Library and arc-list queries; the JSON payload serializes the domain types directly, matching the existing whole-object `LocalStore` seam.

## Consequences

- The existing `LocalStore` interface (`listWorlds`/`getWorld`/`saveWorld`, returning whole `Storyworld` objects) is **extended** with `saveArc`/`getArc`/`listArcs(worldId)`; `InMemoryStore` is kept as the test double, and a new `SqliteStore` becomes the production impl.
- Schema evolution uses a `PRAGMA user_version` forward-migration ladder — not drop-and-recreate — because durability is the whole point of the issue (#4).
- The schema must accommodate **many arcs per Storyworld** from day one so arc continuation (deferred, #10) is purely additive.
