import {
  INVARIANT_SPINE,
  type Arc,
  type Beat,
  type Card,
  type GenerateArcRequest,
  type GenerateArcResponse,
  type GeneratedCardChoice,
  type StoryBible,
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

  constructor(now: Date = new Date("2026-01-01T00:00:00.000Z")) {
    this.canonizedAt = now.toISOString();
  }

  async generateArc(req: GenerateArcRequest): Promise<GenerateArcResponse> {
    const { answers } = req;

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
      { role: "hero", variantImageRefs: variants("hero", 3) },
      { role: "villain", variantImageRefs: variants("villain", 3) },
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
          arcId: "arc-fake-1",
          summary: "A short, safe adventure that lands its lesson warmly.",
          lessonTaught: virtue,
        },
      ],
      worldState: ["The world is calm and the lesson has been learned."],
      openThreads: [
        {
          id: "thread-fake-1",
          teaser: "A tiny door in the old willow was left just barely ajar.",
          originArcId: "arc-fake-1",
          resolved: false,
        },
      ],
      virtuesTaught: [virtue],
    };

    const arc: Arc = {
      id: "arc-fake-1",
      worldId: answers.worldId ?? "new-world",
      tier: answers.tier,
      ageBand: answers.ageBand,
      shape: answers.shape ?? "quest",
      teachingPoint: answers.teachingPoint,
      closingVerseEnabled: answers.closingVerseEnabled,
      beats,
      createdAt: this.canonizedAt,
    };

    return { arc, newCanonCards, pendingCardChoices, bible };
  }
}

function variants(role: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `stub-image:${role}#${i}`);
}

function describeTeachingPoint(answers: GenerateArcRequest["answers"]): string {
  return answers.teachingPoint.kind === "virtue"
    ? answers.teachingPoint.virtue
    : answers.teachingPoint.description;
}
