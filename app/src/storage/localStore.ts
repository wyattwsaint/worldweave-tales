import type { Arc, Storyworld } from "@wwt/domain";

/**
 * Local-first storage. The library, canon, and finished books live ON-DEVICE
 * (no accounts, no server-side user data). Backed in production by SQLite + a
 * local blob store ({@link SqliteStore}); {@link InMemoryStore} is the test
 * double and the pre-persistence fallback.
 *
 * Reminder: the emailed PDF is the ONLY backup for now (SPEC.md §5).
 */

/**
 * The Library shelf's projection of a Storyworld — exactly the indexed columns
 * SqliteStore keeps (`id`, `name`, `created_at`, `cover_ref`), so listing the
 * shelf never parses a full payload. Opening a world fetches the real thing
 * via {@link LocalStore.getWorld}.
 */
export interface WorldSummary {
  id: string;
  name: string;
  createdAt: string;
  /** The deck's first locked art ref at save time; null for a deckless world. */
  coverRef: string | null;
}

/** The single source of the shelf projection (saveWorld indexes exactly this). */
export function worldSummaryOf(world: Storyworld): WorldSummary {
  return {
    id: world.id,
    name: world.name,
    createdAt: world.createdAt,
    coverRef: world.deck[0]?.lockedImageRef ?? null,
  };
}

export interface LocalStore {
  /** Shelf listing, newest first. Summaries only — no full payloads. */
  listWorldSummaries(): Promise<WorldSummary[]>;
  getWorld(id: string): Promise<Storyworld | undefined>;
  saveWorld(world: Storyworld): Promise<void>;

  /** Arcs are the finished ~10-min books. A world owns many (arc continuation, #10). */
  saveArc(arc: Arc): Promise<void>;
  getArc(id: string): Promise<Arc | undefined>;
  listArcs(worldId: string): Promise<Arc[]>;
}

export class InMemoryStore implements LocalStore {
  private worlds = new Map<string, Storyworld>();
  private arcs = new Map<string, Arc>();

  async listWorldSummaries() {
    // Newest first — the same contract as SqliteStore's `created_at DESC`,
    // which the Library shelf relies on.
    return [...this.worlds.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(worldSummaryOf);
  }
  async getWorld(id: string) {
    return this.worlds.get(id);
  }
  async saveWorld(world: Storyworld) {
    this.worlds.set(world.id, world);
  }

  async saveArc(arc: Arc) {
    this.arcs.set(arc.id, arc);
  }
  async getArc(id: string) {
    return this.arcs.get(id);
  }
  async listArcs(worldId: string) {
    return [...this.arcs.values()]
      .filter((a) => a.worldId === worldId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
