/**
 * Turn a card/entity art reference into a React Native `<Image>` source.
 *
 * Refs come in three shapes:
 *  - a blob-relative path (`blobs/…`) — locked art already downloaded to the
 *    on-device blob store; resolved to an absolute `file://` URI via the
 *    existing {@link resolveBlobPath} accessor (needs the render-time BlobFs);
 *  - an `http(s)` URL — freshly generated / not-yet-localized art; used directly;
 *  - anything else (`stub-image:*`, empty) — no real art, so we return `null`
 *    and the caller shows its existing text placeholder.
 *
 * Pure and dependency-injected (the BlobFs is passed in) so it runs in plain
 * Node tests. Screens pass the process-wide `blobFs` from {@link ./store}.
 */
import { BLOB_DIR, resolveBlobPath, type BlobFs } from "./blobStore";

const HTTP_REF = /^https?:\/\//i;

/**
 * @returns an `<Image>` `source` object for renderable art, or `null` when the
 * ref is absent / a non-renderable stub (caller falls back to a text placeholder).
 */
export function artImageSource(ref: string, fs: BlobFs | undefined): { uri: string } | null {
  if (!ref) return null;
  if (ref.startsWith(`${BLOB_DIR}/`)) {
    return fs ? { uri: resolveBlobPath(ref, fs) } : null;
  }
  if (HTTP_REF.test(ref)) return { uri: ref };
  return null;
}
