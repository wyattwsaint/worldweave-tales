import { createRequire } from "node:module";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { SqlDatabase } from "./sqliteStore";
import { SqliteStore } from "./sqliteStore";
import { sampleArc, sampleWorld } from "./testFixtures";

// `node:sqlite` is a newer builtin Vite's transform pipeline mis-resolves on a
// static import, so pull it in via a runtime require (Node loads it directly).
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

/**
 * A node:sqlite adapter that satisfies {@link SqlDatabase} (the same shape
 * expo-sqlite's SQLiteDatabase exposes). Backed by a REAL file so "reopen with
 * a fresh handle" proves durability, not just in-memory retention.
 */
function openNodeDb(path: string): SqlDatabase & { close(): void } {
  const db = new DatabaseSync(path);
  let closed = false;
  return {
    async execAsync(sql: string) {
      db.exec(sql);
    },
    async runAsync(sql: string, params: unknown[] = []) {
      const r = db.prepare(sql).run(...(params as never[]));
      return { lastInsertRowId: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
    async getFirstAsync<T>(sql: string, params: unknown[] = []) {
      return (db.prepare(sql).get(...(params as never[])) ?? null) as T | null;
    },
    async getAllAsync<T>(sql: string, params: unknown[] = []) {
      return db.prepare(sql).all(...(params as never[])) as T[];
    },
    close() {
      if (closed) return; // idempotent: tests close explicitly AND in afterEach
      closed = true;
      db.close();
    },
  };
}

const open: Array<{ close(): void }> = [];
function tempDbPath(): string {
  return join(mkdtempSync(join(tmpdir(), "wwt-sql-")), "worldweave.db");
}
afterEach(() => {
  for (const d of open.splice(0)) d.close();
});
async function openStore(path: string) {
  const db = openNodeDb(path);
  open.push(db);
  return { store: await SqliteStore.open(db), db };
}

describe("SqliteStore", () => {
  it("persists a Storyworld across a FRESH database handle (real durability)", async () => {
    const path = tempDbPath();
    const world = sampleWorld();

    const { store: writer, db: db1 } = await openStore(path);
    await writer.saveWorld(world);
    db1.close(); // drop the handle entirely

    // Reopen: a brand-new connection over the same file. If we only kept an
    // in-memory Map, this read would come back empty.
    const { store: reader } = await openStore(path);
    expect(await reader.getWorld(world.id)).toEqual(world);
    expect((await reader.listWorldSummaries()).map((s) => s.id)).toEqual([world.id]);
  });

  it("persists an Arc across a fresh handle and lists by world", async () => {
    const path = tempDbPath();
    const { store: writer, db: db1 } = await openStore(path);
    await writer.saveArc(sampleArc({ id: "a1", worldId: "w1" }));
    await writer.saveArc(sampleArc({ id: "a2", worldId: "w1" }));
    await writer.saveArc(sampleArc({ id: "a3", worldId: "w2" }));
    db1.close();

    const { store: reader } = await openStore(path);
    expect((await reader.getArc("a1"))?.id).toBe("a1");
    expect(await reader.getArc("nope")).toBeUndefined();
    const w1 = await reader.listArcs("w1");
    expect(w1.map((a) => a.id).sort()).toEqual(["a1", "a2"]);
    expect(await reader.listArcs("w2")).toHaveLength(1);
  });

  it("saveWorld upserts (second save with same id does not duplicate)", async () => {
    const path = tempDbPath();
    const { store } = await openStore(path);
    await store.saveWorld(sampleWorld({ name: "First" }));
    await store.saveWorld(sampleWorld({ name: "Second" }));
    const worlds = await store.listWorldSummaries();
    expect(worlds).toHaveLength(1);
    expect(worlds[0].name).toBe("Second");
  });

  it("listWorldSummaries returns newest first (created_at DESC)", async () => {
    const path = tempDbPath();
    const { store } = await openStore(path);
    await store.saveWorld(sampleWorld({ id: "old", createdAt: "2026-01-01T00:00:00.000Z" }));
    await store.saveWorld(sampleWorld({ id: "new", createdAt: "2026-07-01T00:00:00.000Z" }));
    expect((await store.listWorldSummaries()).map((w) => w.id)).toEqual(["new", "old"]);
  });

  it("listWorldSummaries projects the shelf columns — no payload parse", async () => {
    const path = tempDbPath();
    const { store, db } = await openStore(path);
    await store.saveWorld(sampleWorld()); // deck[0].lockedImageRef = "blobs/hero-1.png"
    await store.saveWorld(
      sampleWorld({
        id: "deckless",
        name: "Brackenford",
        createdAt: "2026-07-19T00:00:00.000Z",
        deck: [],
      }),
    );

    expect(await store.listWorldSummaries()).toEqual([
      { id: "deckless", name: "Brackenford", createdAt: "2026-07-19T00:00:00.000Z", coverRef: null },
      {
        id: "world-willowmere",
        name: "Willowmere",
        createdAt: "2026-07-18T00:00:00.000Z",
        coverRef: "blobs/hero-1.png",
      },
    ]);

    // Straight from the indexed columns: even a corrupted payload cannot break
    // the shelf listing, because the projection never JSON.parses it.
    await db.runAsync("UPDATE storyworlds SET payload_json = 'not json'");
    expect(await store.listWorldSummaries()).toHaveLength(2);
  });

  it("migrates an old (v1) database forward without data loss", async () => {
    const path = tempDbPath();

    // Seed a database as an OLDER app version would have left it: only the v1
    // schema (no cover_ref / title / index), user_version = 1, with real data.
    const legacy = openNodeDb(path);
    open.push(legacy);
    await legacy.execAsync(`
      CREATE TABLE storyworlds (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL, payload_json TEXT NOT NULL);
      CREATE TABLE arcs (id TEXT PRIMARY KEY, world_id TEXT NOT NULL, created_at TEXT NOT NULL, payload_json TEXT NOT NULL);
      PRAGMA user_version = 1;
    `);
    const seeded = sampleWorld({ id: "legacy-world" });
    await legacy.runAsync(
      "INSERT INTO storyworlds (id, name, created_at, payload_json) VALUES (?, ?, ?, ?)",
      [seeded.id, seeded.name, seeded.createdAt, JSON.stringify(seeded)],
    );
    (legacy as unknown as { close(): void }).close();

    // Open through SqliteStore: the migration ladder must apply v2.
    const { store, db } = await openStore(path);

    // 1. The pre-existing row survived the migration.
    expect(await store.getWorld("legacy-world")).toEqual(seeded);
    // 2. user_version advanced to the latest.
    const ver = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
    expect(ver?.user_version).toBe(SqliteStore.LATEST_VERSION);
    // 3. The v2 migration BACKFILLED cover_ref from the payload (same
    // derivation as worldSummaryOf: deck[0]?.lockedImageRef) — otherwise every
    // pre-v2 world loses its shelf thumbnail forever, because the shelf reads
    // only the indexed column.
    const row = await db.getFirstAsync<{ cover_ref: string | null }>(
      "SELECT cover_ref FROM storyworlds WHERE id = ?",
      ["legacy-world"],
    );
    expect(row?.cover_ref).toBe("blobs/hero-1.png");
    // 4. And the shelf projection itself now shows the legacy cover.
    expect(await store.listWorldSummaries()).toEqual([
      expect.objectContaining({ id: "legacy-world", coverRef: "blobs/hero-1.png" }),
    ]);
  });

  it("v2 backfill tolerates a corrupt payload: leaves cover_ref NULL, migration still completes", async () => {
    const path = tempDbPath();

    const legacy = openNodeDb(path);
    open.push(legacy);
    await legacy.execAsync(`
      CREATE TABLE storyworlds (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL, payload_json TEXT NOT NULL);
      CREATE TABLE arcs (id TEXT PRIMARY KEY, world_id TEXT NOT NULL, created_at TEXT NOT NULL, payload_json TEXT NOT NULL);
      PRAGMA user_version = 1;
    `);
    // One healthy row and one whose payload no longer parses.
    const good = sampleWorld({ id: "good-world" });
    await legacy.runAsync(
      "INSERT INTO storyworlds (id, name, created_at, payload_json) VALUES (?, ?, ?, ?)",
      [good.id, good.name, good.createdAt, JSON.stringify(good)],
    );
    await legacy.runAsync(
      "INSERT INTO storyworlds (id, name, created_at, payload_json) VALUES (?, ?, ?, ?)",
      ["corrupt-world", "Corrupt", "2026-07-17T00:00:00.000Z", "not json"],
    );
    legacy.close();

    // Opening must not throw: a corrupt row is skipped, not fatal.
    const { db } = await openStore(path);

    const rows = await db.getAllAsync<{ id: string; cover_ref: string | null }>(
      "SELECT id, cover_ref FROM storyworlds ORDER BY id",
    );
    expect(rows).toEqual([
      { id: "corrupt-world", cover_ref: null },
      { id: "good-world", cover_ref: "blobs/hero-1.png" },
    ]);
    // The ladder still advanced past v2 despite the corrupt row.
    const ver = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
    expect(ver?.user_version).toBe(SqliteStore.LATEST_VERSION);
  });

  it("re-running migrations on an up-to-date database is a no-op", async () => {
    const path = tempDbPath();
    const { store: s1, db: db1 } = await openStore(path);
    await s1.saveWorld(sampleWorld());
    db1.close();
    // Second open runs migrate() again over the already-latest DB.
    const { store: s2, db: db2 } = await openStore(path);
    const ver = await db2.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
    expect(ver?.user_version).toBe(SqliteStore.LATEST_VERSION);
    expect(await s2.listWorldSummaries()).toHaveLength(1);
  });
});
