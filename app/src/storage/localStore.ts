import type { Arc, Storyworld } from "@wwt/domain";

/**
 * Local-first storage. The library, canon, and finished books live ON-DEVICE
 * (no accounts, no server-side user data). Backed in production by SQLite + a
 * local blob store ({@link SqliteStore}); {@link InMemoryStore} is the test
 * double and the pre-persistence fallback.
 *
 * Reminder: the emailed PDF is the ONLY backup for now (SPEC.md §5).
 */
export interface LocalStore {
  listWorlds(): Promise<Storyworld[]>;
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

  async listWorlds() {
    return [...this.worlds.values()];
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
    return [...this.arcs.values()].filter((a) => a.worldId === worldId);
  }
}
