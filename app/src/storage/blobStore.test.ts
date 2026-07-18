import { describe, expect, it } from "vitest";
import type { BlobFs, FetchLike } from "./blobStore";
import { downloadToBlob, resolveBlobPath } from "./blobStore";

/** In-memory BlobFs keyed by relative path. */
function fakeFs(documentDirectory = "file:///doc/"): BlobFs & { store: Map<string, Uint8Array>; dirs: Set<string> } {
  const store = new Map<string, Uint8Array>();
  const dirs = new Set<string>();
  return {
    documentDirectory,
    store,
    dirs,
    async ensureDir(relDir) {
      dirs.add(relDir);
    },
    async writeBytes(relPath, bytes) {
      store.set(relPath, bytes);
    },
    async readBytes(relPath) {
      const b = store.get(relPath);
      if (!b) throw new Error(`no such blob: ${relPath}`);
      return b;
    },
    async exists(relPath) {
      return store.has(relPath);
    },
  };
}

function fakeFetch(bytes: number[], ok = true, status = 200): FetchLike {
  return async () => ({
    ok,
    status,
    async arrayBuffer() {
      return new Uint8Array(bytes).buffer;
    },
  });
}

describe("blobStore", () => {
  it("downloads bytes and returns a RELATIVE path under blobs/", async () => {
    const fs = fakeFs();
    const rel = await downloadToBlob("https://cdn/img.png", "hero-1.png", {
      fetch: fakeFetch([1, 2, 3]),
      fs,
    });

    expect(rel).toBe("blobs/hero-1.png");
    // Must be relative: absolute documentDirectory can change across reinstalls.
    expect(rel.startsWith("/")).toBe(false);
    expect(rel.startsWith("file://")).toBe(false);
    expect(fs.dirs.has("blobs")).toBe(true);
  });

  it("writes the fetched bytes, readable back via the resolved path", async () => {
    const fs = fakeFs();
    const rel = await downloadToBlob("https://cdn/img.png", "villain-1.png", {
      fetch: fakeFetch([9, 8, 7, 6]),
      fs,
    });

    // Stored under the relative key...
    expect([...(await fs.readBytes(rel))]).toEqual([9, 8, 7, 6]);
    // ...and resolves to an absolute file URI for <Image>.
    expect(resolveBlobPath(rel, fs)).toBe("file:///doc/blobs/villain-1.png");
  });

  it("joins cleanly regardless of a trailing slash on documentDirectory", async () => {
    expect(resolveBlobPath("blobs/x.png", fakeFs("file:///doc/"))).toBe("file:///doc/blobs/x.png");
    expect(resolveBlobPath("blobs/x.png", fakeFs("file:///doc"))).toBe("file:///doc/blobs/x.png");
  });

  it("throws on a failed download and writes nothing", async () => {
    const fs = fakeFs();
    await expect(
      downloadToBlob("https://cdn/missing.png", "ghost.png", { fetch: fakeFetch([], false, 404), fs }),
    ).rejects.toThrow(/404/);
    expect(await fs.exists("blobs/ghost.png")).toBe(false);
  });
});
