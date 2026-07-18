/**
 * Blob store: downloads a card's remote image (an ephemeral Recraft URL) to a
 * local file and hands back a RELATIVE path. We persist the relative path in
 * `Card.lockedImageRef` — the absolute `documentDirectory` can change across
 * reinstalls/OS updates, so it must be resolved at render time, not stored.
 *
 * The core (download + path math) is pure and dependency-injected so it runs in
 * plain Node tests; {@link expoBlobFs} is the on-device adapter over
 * expo-file-system.
 */

/** The minimal file surface the blob store needs; all paths are relative to `documentDirectory`. */
export interface BlobFs {
  /** Absolute base directory (expo's document dir), used only to resolve for rendering. */
  readonly documentDirectory: string;
  ensureDir(relDir: string): Promise<void>;
  writeBytes(relPath: string, bytes: Uint8Array): Promise<void>;
  readBytes(relPath: string): Promise<Uint8Array>;
  exists(relPath: string): Promise<boolean>;
}

export type FetchLike = (
  url: string,
) => Promise<{ ok: boolean; status: number; arrayBuffer(): Promise<ArrayBuffer> }>;

export interface BlobDeps {
  fetch: FetchLike;
  fs: BlobFs;
}

/** All locked art lives under this subdirectory of the document dir. */
export const BLOB_DIR = "blobs";

function joinUri(base: string, rel: string): string {
  return `${base.replace(/\/+$/, "")}/${rel.replace(/^\/+/, "")}`;
}

/**
 * Download `url` into `blobs/<name>` and return the relative path to store in
 * `lockedImageRef`. `name` should be a stable, unique file name (e.g. the
 * entityId plus extension).
 */
export async function downloadToBlob(url: string, name: string, deps: BlobDeps): Promise<string> {
  const res = await deps.fetch(url);
  if (!res.ok) {
    throw new Error(`blob download failed (HTTP ${res.status}) for ${url}`);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  const relPath = `${BLOB_DIR}/${name}`;
  await deps.fs.ensureDir(BLOB_DIR);
  await deps.fs.writeBytes(relPath, bytes);
  return relPath;
}

/** Resolve a stored relative blob path to an absolute `file://` URI for `<Image>`. */
export function resolveBlobPath(relPath: string, fs: BlobFs): string {
  return joinUri(fs.documentDirectory, relPath);
}

// The production BlobFs over expo-file-system lives in `nativeStore.ts` so the
// native module stays out of this module's (Node-tested) import graph.
