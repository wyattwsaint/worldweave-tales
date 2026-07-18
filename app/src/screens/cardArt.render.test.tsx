import React from "react";
import TestRenderer, { act, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Arc, Card, GenerateArcResponse, StoryBible, WizardAnswers } from "@wwt/domain";
import { NavProvider } from "../nav/NavContext";
import ViewerScreen from "./ViewerScreen";
import CardPickScreen from "./CardPickScreen";
import { setBlobFs } from "../storage/store";
import type { BlobFs } from "../storage/blobStore";

/**
 * S3 render contract: card/entity art is a blob-backed <Image>, not a Text node
 * showing the raw ref. A blob-relative ref resolves through the existing blob
 * store (resolveBlobPath); an http(s) ref passes straight through; a stub /
 * absent ref degrades to the existing text placeholder.
 */

type Node = TestRenderer.ReactTestInstance;

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

function isHost(type: unknown, tag: string) {
  return type === tag;
}

function images(root: ReactTestRenderer): Node[] {
  return root.root.findAll((n) => isHost(n.type, "rn-image"));
}

function imageUris(root: ReactTestRenderer): string[] {
  return images(root).map((n) => n.props.source?.uri);
}

/** Every host-text string rendered anywhere under the tree, concatenated. */
function allText(root: ReactTestRenderer): string {
  const parts: string[] = [];
  for (const t of root.root.findAll((n) => isHost(n.type, "rn-text"))) {
    const collect = (c: unknown) => {
      if (typeof c === "string" || typeof c === "number") parts.push(String(c));
      else if (Array.isArray(c)) c.forEach(collect);
    };
    collect(t.props.children);
  }
  return parts.join(" ");
}

const bible: StoryBible = {
  entitySheets: [],
  eventLog: [],
  worldState: [],
  openThreads: [],
  virtuesTaught: [],
};

function card(entityId: string, lockedImageRef: string): Card {
  return {
    entityId,
    role: "other",
    canonName: entityId,
    traits: [],
    appearanceNote: "",
    lockedImageRef,
    relationships: [],
    canonizedAt: "",
  };
}

describe("card art renders as a blob-backed <Image> (Viewer + CardPick)", () => {
  beforeEach(() => {
    setBlobFs(fakeFs); // stand in for the on-device expo-file-system blob fs
  });
  afterEach(() => {
    setBlobFs(undefined);
  });

  it("ViewerScreen: blob ref → <Image> from the blob store; http ref → <Image>; stub/absent → text placeholder", async () => {
    const arc: Arc = {
      id: "arc-1",
      worldId: "w1",
      tier: "beginner",
      ageBand: "preschool",
      shape: "quest",
      teachingPoint: { kind: "virtue", virtue: "courage" },
      closingVerseEnabled: false,
      beats: [
        {
          spineBeat: "setup",
          text: "Once upon a time.",
          dealtCardIds: ["hero", "friend", "ghost", "stubby"],
        },
      ],
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const cards: Card[] = [
      card("hero", "blobs/hero.png"), // on-device blob → resolved file:// uri
      card("friend", "https://cdn/friend.png"), // remote art → passthrough uri
      card("ghost", ""), // absent → placeholder
      card("stubby", "stub-image:companion#0"), // stub → placeholder
    ];

    let root!: ReactTestRenderer;
    await act(async () => {
      root = TestRenderer.create(
        <NavProvider>
          <ViewerScreen params={{ arc, cards, bible }} />
        </NavProvider>,
      );
    });

    const uris = imageUris(root);
    // Blob-store-backed image resolved through resolveBlobPath.
    expect(uris).toContain("file:///doc/blobs/hero.png");
    // Remote art rendered directly.
    expect(uris).toContain("https://cdn/friend.png");
    // Exactly the two renderable refs became images; stub/absent did not.
    expect(images(root)).toHaveLength(2);

    const text = allText(root);
    // The raw blob path must NOT be printed as text (it became an <Image>).
    expect(text).not.toContain("blobs/hero.png");
    expect(text).not.toContain("https://cdn/friend.png");
    // The stub ref degrades to the existing text placeholder.
    expect(text).toContain("stub-image:companion#0");
  });

  it("CardPickScreen: http variant → <Image>; stub variant → text placeholder", async () => {
    const answers: WizardAnswers = {
      tier: "beginner",
      ageBand: "preschool",
      teachingPoint: { kind: "virtue", virtue: "courage" },
      closingVerseEnabled: false,
      choices: {},
    };
    const response: GenerateArcResponse = {
      arc: {
        id: "arc-1",
        worldId: "w1",
        tier: "beginner",
        ageBand: "preschool",
        shape: "quest",
        teachingPoint: { kind: "virtue", virtue: "courage" },
        closingVerseEnabled: false,
        beats: [],
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      newCanonCards: [],
      pendingCardChoices: [
        { role: "hero", variantImageRefs: ["https://cdn/hero-a.png", "stub-image:hero#1"] },
      ],
      bible,
    };

    let root!: ReactTestRenderer;
    await act(async () => {
      root = TestRenderer.create(
        <NavProvider>
          <CardPickScreen params={{ response, answers }} />
        </NavProvider>,
      );
    });

    const uris = imageUris(root);
    expect(uris).toContain("https://cdn/hero-a.png");
    expect(images(root)).toHaveLength(1);

    const text = allText(root);
    // The remote variant renders as art, not its raw URL string...
    expect(text).not.toContain("https://cdn/hero-a.png");
    // ...while the stub variant keeps the existing text-placeholder label.
    expect(text).toContain("stub-image:hero#1");
  });
});
