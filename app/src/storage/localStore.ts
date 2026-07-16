import type { Storyworld } from "@wwt/domain";

/**
 * Local-first storage. The library, canon, and finished books live ON-DEVICE
 * (no accounts, no server-side user data). This interface will be backed by
 * SQLite + a local blob store; here it's an in-memory stub so the app runs.
 *
 * Reminder: the emailed PDF is the ONLY backup for now (SPEC.md §5).
 */
export interface LocalStore {
  listWorlds(): Promise<Storyworld[]>;
  getWorld(id: string): Promise<Storyworld | undefined>;
  saveWorld(world: Storyworld): Promise<void>;
}

export class InMemoryStore implements LocalStore {
  private worlds = new Map<string, Storyworld>();
  async listWorlds() {
    return [...this.worlds.values()];
  }
  async getWorld(id: string) {
    return this.worlds.get(id);
  }
  async saveWorld(world: Storyworld) {
    this.worlds.set(world.id, world);
  }
}
