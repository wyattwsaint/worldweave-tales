import type { Arc, Storyworld } from "@wwt/domain";
import type { LocalStore } from "./localStore";
import { arcTitle } from "./persistence";

/**
 * The slice of expo-sqlite's `SQLiteDatabase` this store uses. Declaring it
 * structurally (a) keeps SqliteStore free of any native import, so the whole
 * storage layer is unit-testable in plain Node, and (b) lets a real
 * `openDatabaseAsync(...)` handle be passed in directly — it satisfies this
 * shape as-is.
 */
export type SqlBindValue = string | number | null;

export interface SqlRunResult {
  lastInsertRowId: number;
  changes: number;
}

export interface SqlDatabase {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params?: SqlBindValue[]): Promise<SqlRunResult>;
  getFirstAsync<T>(sql: string, params?: SqlBindValue[]): Promise<T | null>;
  getAllAsync<T>(sql: string, params?: SqlBindValue[]): Promise<T[]>;
}

interface Migration {
  version: number;
  up: string;
}

/**
 * Forward-only migration ladder, keyed on `PRAGMA user_version`. NEVER
 * drop-and-recreate — durability is the whole point of #4. Add a new entry
 * with the next version; never edit a shipped one.
 */
const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    up: `
      CREATE TABLE storyworlds (
        id           TEXT PRIMARY KEY,
        name         TEXT NOT NULL,
        created_at   TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );
      CREATE TABLE arcs (
        id           TEXT PRIMARY KEY,
        world_id     TEXT NOT NULL,
        created_at   TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );
    `,
  },
  {
    version: 2,
    // Library (#8) summary columns + the world index the arc-list query uses.
    up: `
      ALTER TABLE storyworlds ADD COLUMN cover_ref TEXT;
      ALTER TABLE arcs ADD COLUMN title TEXT;
      CREATE INDEX idx_arcs_world ON arcs(world_id);
    `,
  },
];

/**
 * Production `LocalStore` backed by SQLite. Hybrid rows (ADR-0001): a few
 * indexed columns for the Library / arc-list queries plus a `payload_json`
 * column that serializes the whole domain object, so reads reconstruct the
 * rich nested types without a shred/reassemble mapping.
 */
export class SqliteStore implements LocalStore {
  static readonly LATEST_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

  private constructor(private readonly db: SqlDatabase) {}

  /** Open a store over a DB handle, running any pending migrations first. */
  static async open(db: SqlDatabase): Promise<SqliteStore> {
    await SqliteStore.migrate(db);
    return new SqliteStore(db);
  }

  private static async migrate(db: SqlDatabase): Promise<void> {
    const row = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
    const current = row?.user_version ?? 0;
    for (const m of MIGRATIONS) {
      if (m.version > current) {
        await db.execAsync(m.up);
        // PRAGMA can't be parameterized; the version is a trusted integer literal.
        await db.execAsync(`PRAGMA user_version = ${m.version}`);
      }
    }
  }

  async saveWorld(world: Storyworld): Promise<void> {
    const coverRef = world.deck[0]?.lockedImageRef ?? null;
    await this.db.runAsync(
      `INSERT INTO storyworlds (id, name, created_at, cover_ref, payload_json)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name         = excluded.name,
         created_at   = excluded.created_at,
         cover_ref    = excluded.cover_ref,
         payload_json = excluded.payload_json`,
      [world.id, world.name, world.createdAt, coverRef, JSON.stringify(world)],
    );
  }

  async getWorld(id: string): Promise<Storyworld | undefined> {
    const row = await this.db.getFirstAsync<{ payload_json: string }>(
      "SELECT payload_json FROM storyworlds WHERE id = ?",
      [id],
    );
    return row ? (JSON.parse(row.payload_json) as Storyworld) : undefined;
  }

  async listWorlds(): Promise<Storyworld[]> {
    const rows = await this.db.getAllAsync<{ payload_json: string }>(
      "SELECT payload_json FROM storyworlds ORDER BY created_at DESC",
    );
    return rows.map((r) => JSON.parse(r.payload_json) as Storyworld);
  }

  async saveArc(arc: Arc): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO arcs (id, world_id, created_at, title, payload_json)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         world_id     = excluded.world_id,
         created_at   = excluded.created_at,
         title        = excluded.title,
         payload_json = excluded.payload_json`,
      [arc.id, arc.worldId, arc.createdAt, arcTitle(arc), JSON.stringify(arc)],
    );
  }

  async getArc(id: string): Promise<Arc | undefined> {
    const row = await this.db.getFirstAsync<{ payload_json: string }>(
      "SELECT payload_json FROM arcs WHERE id = ?",
      [id],
    );
    return row ? (JSON.parse(row.payload_json) as Arc) : undefined;
  }

  async listArcs(worldId: string): Promise<Arc[]> {
    const rows = await this.db.getAllAsync<{ payload_json: string }>(
      "SELECT payload_json FROM arcs WHERE world_id = ? ORDER BY created_at DESC",
      [worldId],
    );
    return rows.map((r) => JSON.parse(r.payload_json) as Arc);
  }
}
