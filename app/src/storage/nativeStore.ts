import * as SQLite from "expo-sqlite";
import { Directory, File, Paths } from "expo-file-system";
import type { ArtDownloader } from "./persistence";
import { downloadToBlob, type BlobFs } from "./blobStore";
import { SqliteStore, type SqlDatabase } from "./sqliteStore";

/**
 * The ONLY module that imports the native storage packages. It is loaded
 * exclusively through `initStore()`'s dynamic `import()`, so plain-Node tests
 * (and any module they reach) never pull in `expo-sqlite` / `expo-file-system`.
 *
 * Nothing here is exercised by unit tests — this is the on-device seam and must
 * be verified in Expo Go (see PR notes).
 */

const DB_NAME = "worldweave.db";

/** Adapt expo's SQLiteDatabase to the structural {@link SqlDatabase} the store needs. */
function adapt(db: SQLite.SQLiteDatabase): SqlDatabase {
  return {
    execAsync: (sql) => db.execAsync(sql),
    runAsync: (sql, params = []) => db.runAsync(sql, params),
    getFirstAsync: <T>(sql: string, params: (string | number | null)[] = []) =>
      db.getFirstAsync<T>(sql, params),
    getAllAsync: <T>(sql: string, params: (string | number | null)[] = []) =>
      db.getAllAsync<T>(sql, params),
  };
}

export async function openSqliteStore(): Promise<SqliteStore> {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  return SqliteStore.open(adapt(db));
}

/** Production {@link BlobFs} over expo-file-system's SDK-54 File/Directory API. */
function expoBlobFs(): BlobFs {
  const base = Paths.document;
  return {
    documentDirectory: base.uri,
    async ensureDir(relDir) {
      const dir = new Directory(base, relDir);
      if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    },
    async writeBytes(relPath, bytes) {
      new File(base, relPath).write(bytes);
    },
    async readBytes(relPath) {
      return new File(base, relPath).bytes();
    },
    async exists(relPath) {
      return new File(base, relPath).exists;
    },
  };
}

/** A real art downloader: fetch bytes → local blob, returns the relative path. */
export function makeArtDownloader(): ArtDownloader {
  const fs = expoBlobFs();
  return (url, name) => downloadToBlob(url, name, { fetch: (u) => fetch(u), fs });
}
