import { InMemoryStore, type LocalStore } from "./localStore";
import type { ArtDownloader } from "./persistence";
import type { BlobFs } from "./blobStore";

/**
 * Process-wide storage seam.
 *
 * Defaults to {@link InMemoryStore} so tests and the pre-init boot window work
 * synchronously. `initStore()` (called once from the app entry) swaps in the
 * SQLite-backed store and a real art downloader. The native modules live behind
 * a dynamic import, so importing this file never loads `expo-sqlite` /
 * `expo-file-system` — that only happens when `initStore()` actually runs on
 * device.
 *
 * `store` and `artDownloader` are live ES bindings: read them at call time
 * (not destructured at module load) to observe the post-init values.
 */
export let store: LocalStore = new InMemoryStore();
export let artDownloader: ArtDownloader | undefined;
/**
 * Render-time blob filesystem — resolves a stored blob-relative art ref to an
 * absolute `file://` URI for `<Image>`. Set by `initStore()` on device; stays
 * undefined under vitest/node (blob refs then degrade to the text placeholder).
 */
export let blobFs: BlobFs | undefined;

/** Wire the render-time blob fs (used by `initStore`; injectable in tests). */
export function setBlobFs(fs: BlobFs | undefined): void {
  blobFs = fs;
}

let ready: Promise<void> | null = null;

async function doInit(): Promise<void> {
  try {
    const native = await import(/* @vite-ignore */ "./nativeStore");
    store = await native.openSqliteStore();
    artDownloader = native.makeArtDownloader();
    setBlobFs(native.expoBlobFs());
  } catch (err) {
    // Native storage unavailable (e.g. under vitest/node) — keep the in-memory
    // store so the app still runs. On device this branch is not taken.
    // eslint-disable-next-line no-console
    console.warn("[store] persistent storage unavailable; using in-memory:", err);
  }
}

/** Idempotent: open persistent storage once. Call at app startup. */
export function initStore(): Promise<void> {
  if (!ready) ready = doInit();
  return ready;
}

/** Resolves once storage is ready (immediately if `initStore` was never called). */
export function whenStoreReady(): Promise<void> {
  return ready ?? Promise.resolve();
}
