import {
  INVARIANT_SPINE,
  type Arc,
  type Beat,
  type Card,
  type GenerateArcRequest,
  type GenerateArcResponse,
  type GeneratedCardChoice,
  type StoryBible,
  type Storyworld,
} from "@wwt/domain";

/**
 * Drop-in, network-free stand-in for {@link import("./proxyClient.js").ProxyClient}.
 *
 * Produces a deterministic, shape-realistic {@link GenerateArcResponse}: one beat
 * per {@link INVARIANT_SPINE} step, hero + villain returned as pending parent
 * picks (with variant image refs), a canonized companion + place, and a minimal
 * valid Story Bible. Determinism comes entirely from the request plus an
 * optionally injected `now` — no `Date.now()` / `Math.random()`.
 */
export class FakeProxyClient {
  private readonly canonizedAt: string;
  private readonly start: number;
  /** Arcs woven so far by THIS instance — keeps ids/timestamps distinct without a clock. */
  private arcCount = 0;

  constructor(now: Date = new Date("2026-01-01T00:00:00.000Z")) {
    this.canonizedAt = now.toISOString();
    this.start = now.getTime();
  }

  async generateArc(req: GenerateArcRequest): Promise<GenerateArcResponse> {
    const { answers, world } = req;
    this.arcCount += 1;
    // A minute per arc, so a world's arcs sort newest-first like real ones do.
    const createdAt = new Date(this.start + this.arcCount * 60_000).toISOString();
    const arcId = `arc-fake-${this.arcCount}`;
    // CONTINUING a world (#10): the whole locked deck comes back by its real
    // entityIds, so nothing needs drawing and nothing needs picking — exactly
    // the shape the pipeline produces when recurring canon covers the cast.
    if (world) {
      return this.continueWorld(req, world, arcId, createdAt);
    }

    const beats: Beat[] = INVARIANT_SPINE.map((spineBeat) => ({
      spineBeat,
      text: `[${spineBeat}] A gentle, safe telling for the "${describeTeachingPoint(answers)}" lesson.`,
      // The villain enters when the virtue is tested and is present as good triumphs.
      dealtCardIds:
        spineBeat === "virtue-tested" || spineBeat === "good-triumphs"
          ? ["hero", "villain", "companion-fern", "place-willowmere"]
          : ["hero", "companion-fern", "place-willowmere"],
    }));

    const pendingCardChoices: GeneratedCardChoice[] = [
      { entityId: "hero", role: "hero", appearanceNote: "the chosen hero", variantImageRefs: variants("hero", 3) },
      { entityId: "villain", role: "villain", appearanceNote: "the chosen villain", variantImageRefs: variants("villain", 3) },
    ];

    const newCanonCards: Card[] = [
      {
        entityId: "companion-fern",
        role: "companion",
        canonName: "Fern",
        traits: ["loyal", "curious"],
        appearanceNote: "a small green sparrow with a bright eye",
        lockedImageRef: "stub-image:companion#0",
        relationships: ["hero"],
        canonizedAt: this.canonizedAt,
      },
      {
        entityId: "place-willowmere",
        role: "place",
        canonName: "Willowmere",
        traits: ["quiet", "green"],
        appearanceNote: "a sleepy village beside a silver pond",
        lockedImageRef: "stub-image:place#0",
        relationships: [],
        canonizedAt: this.canonizedAt,
      },
    ];

    const virtue =
      answers.teachingPoint.kind === "virtue"
        ? answers.teachingPoint.virtue
        : answers.teachingPoint.description;

    const bible: StoryBible = {
      entitySheets: newCanonCards.map((c) => ({
        entityId: c.entityId,
        facts: [...c.traits],
        appearanceNote: c.appearanceNote,
        relationships: [...c.relationships],
      })),
      eventLog: [
        {
          arcId,
          summary: "A short, safe adventure that lands its lesson warmly.",
          lessonTaught: virtue,
        },
      ],
      worldState: ["The world is calm and the lesson has been learned."],
      openThreads: [
        {
          id: `thread-${arcId}`,
          teaser: "A tiny door in the old willow was left just barely ajar.",
          originArcId: arcId,
          resolved: false,
        },
      ],
      virtuesTaught: [virtue],
    };

    return {
      arc: this.arc(answers, arcId, createdAt, beats),
      artStyle: DEFAULT_ART_STYLE,
      newCanonCards,
      pendingCardChoices,
      bible,
    };
  }

  /**
   * A CONTINUED arc: every locked card comes back by its real entityId, so the
   * response has no new cards and no pending picks. The bible grows append-only
   * (this arc's event + a fresh hook) and the springboard the parent chose is
   * marked resolved — mirroring what the proxy's deterministic merge does.
   */
  private continueWorld(
    req: GenerateArcRequest,
    world: Storyworld,
    arcId: string,
    createdAt: string,
  ): GenerateArcResponse {
    const { answers } = req;
    const virtue = describeTeachingPoint(answers);
    const canonIds = world.deck.map((c) => c.entityId);
    const villainIds = world.deck.filter((c) => c.role === "villain").map((c) => c.entityId);
    const alwaysDealt = canonIds.filter((id) => !villainIds.includes(id));

    const beats: Beat[] = INVARIANT_SPINE.map((spineBeat) => ({
      spineBeat,
      text: `[${spineBeat}] Back in ${world.name}, a gentle telling of "${virtue}".`,
      // The villain returns when the virtue is tested and stays through the win.
      dealtCardIds:
        spineBeat === "virtue-tested" || spineBeat === "good-triumphs"
          ? canonIds
          : alwaysDealt,
    }));

    const prior = world.bible;
    const bible: StoryBible = {
      entitySheets: prior.entitySheets,
      eventLog: [
        ...prior.eventLog,
        { arcId, summary: `Another quiet adventure in ${world.name}.`, lessonTaught: virtue },
      ],
      worldState: prior.worldState,
      openThreads: [
        ...prior.openThreads.map((t) =>
          t.id === answers.continueThreadId ? { ...t, resolved: true } : t,
        ),
        {
          id: `thread-${arcId}`,
          teaser: "Someone left a lantern burning at the top of the hill.",
          originArcId: arcId,
          resolved: false,
        },
      ],
      virtuesTaught: [...prior.virtuesTaught, virtue],
    };

    return {
      arc: this.arc(answers, arcId, createdAt, beats),
      artStyle: world.artStyle,
      newCanonCards: [],
      pendingCardChoices: [],
      bible,
    };
  }

  private arc(
    answers: GenerateArcRequest["answers"],
    id: string,
    createdAt: string,
    beats: Beat[],
  ): Arc {
    return {
      id,
      worldId: answers.worldId ?? "new-world",
      tier: answers.tier,
      ageBand: answers.ageBand,
      shape: answers.shape ?? "quest",
      teachingPoint: answers.teachingPoint,
      closingVerseEnabled: answers.closingVerseEnabled,
      beats,
      createdAt,
    };
  }
}

/** What the proxy pipeline falls back to for a brand-new world. */
const DEFAULT_ART_STYLE = {
  presetId: "pencil-mvp",
  displayName: "Imaginative Pencil Sketch",
  providerStyleRef: "stub-style:pencil-mvp",
};

function variants(role: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `stub-image:${role}#${i}`);
}

function describeTeachingPoint(answers: GenerateArcRequest["answers"]): string {
  return answers.teachingPoint.kind === "virtue"
    ? answers.teachingPoint.virtue
    : answers.teachingPoint.description;
}
