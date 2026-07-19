import { describe, expect, it } from "vitest";
import type { BlobFs } from "./blobStore";
import { artImageSource } from "./artSource";

/** Minimal BlobFs whose only render-relevant field is the document dir. */
const fakeFs: BlobFs = {
  documentDirectory: "file:///doc/",
  async ensureDir() {},
  async writeBytes() {},
  async readBytes() {
    return new Uint8Array();
  },
  async exists() {
    return true;
  },
};

describe("artImageSource", () => {
  it("resolves a blob-relative ref to a file:// <Image> source via the blob store", () => {
    expect(artImageSource("blobs/hero.png", fakeFs)).toEqual({
      uri: "file:///doc/blobs/hero.png",
    });
  });

  it("passes an http(s) art URL straight through as the <Image> source", () => {
    expect(artImageSource("https://cdn/x.png?sig=1", fakeFs)).toEqual({
      uri: "https://cdn/x.png?sig=1",
    });
  });

  it("returns null (→ text placeholder) for a stub-image ref", () => {
    expect(artImageSource("stub-image:hero#0", fakeFs)).toBeNull();
  });

  it("returns null (→ text placeholder) for an absent/empty ref", () => {
    expect(artImageSource("", fakeFs)).toBeNull();
  });

  it("returns null for a blob-relative ref when no fs is available (pre-init)", () => {
    expect(artImageSource("blobs/hero.png", undefined)).toBeNull();
  });
});
