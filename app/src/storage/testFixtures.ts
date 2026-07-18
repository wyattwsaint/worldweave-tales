import type { Arc, Card, Storyworld } from "@wwt/domain";

/**
 * Shared, deterministic domain fixtures for storage tests. Deliberately rich
 * (nested deck, bible, beats) so round-trip tests actually exercise the JSON
 * payload, not just the indexed columns.
 */

export function sampleCard(overrides: Partial<Card> = {}): Card {
  return {
    entityId: "hero-1",
    role: "hero",
    canonName: "Pip",
    traits: ["small", "brave", "kind"],
    appearanceNote: "A tiny mouse in a red cloak.",
    lockedImageRef: "blobs/hero-1.png",
    relationships: ["villain-1"],
    canonizedAt: "2026-07-18T00:00:00.000Z",
    ...overrides,
  };
}

export function sampleWorld(overrides: Partial<Storyworld> = {}): Storyworld {
  return {
    id: "world-willowmere",
    name: "Willowmere",
    artStyle: {
      presetId: "pencil-mvp",
      displayName: "Imaginative Pencil Sketch",
      providerStyleRef: "sub:pencil-42",
    },
    defaultAgeBand: "toddler",
    deck: [
      sampleCard(),
      sampleCard({
        entityId: "villain-1",
        role: "villain",
        canonName: "Gloom",
        traits: ["shadowy"],
        appearanceNote: "A drifting shadow.",
        lockedImageRef: "blobs/villain-1.png",
        relationships: ["hero-1"],
      }),
    ],
    bible: {
      entitySheets: [
        { entityId: "hero-1", facts: ["brave"], appearanceNote: "red cloak", relationships: ["villain-1"] },
      ],
      eventLog: [
        { arcId: "arc-1", summary: "Pip faced the shadow.", lessonTaught: "courage" },
      ],
      worldState: ["The shadow was calmed."],
      openThreads: [
        { id: "t1", teaser: "What lies past the hill?", originArcId: "arc-1", resolved: false },
      ],
      virtuesTaught: ["courage"],
    },
    arcIds: ["arc-1"],
    createdAt: "2026-07-18T00:00:00.000Z",
    ...overrides,
  };
}

export function sampleArc(overrides: Partial<Arc> = {}): Arc {
  return {
    id: "arc-1",
    worldId: "world-willowmere",
    tier: "beginner",
    ageBand: "toddler",
    shape: "quest",
    teachingPoint: { kind: "virtue", virtue: "courage" },
    closingVerseEnabled: false,
    beats: [
      { spineBeat: "setup", text: "Once upon a time...", dealtCardIds: ["hero-1"] },
      { spineBeat: "good-triumphs", text: "Good won the day.", dealtCardIds: ["hero-1", "villain-1"] },
    ],
    createdAt: "2026-07-18T00:00:00.000Z",
    ...overrides,
  };
}
