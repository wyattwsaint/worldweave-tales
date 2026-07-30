import React from "react";
import TestRenderer, { act, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../../App";
import { FakeProxyClient } from "../api/fakeProxyClient";
import type { GenerateArcRequest, Storyworld } from "@wwt/domain";
import { NavProvider } from "../nav/NavContext";
import { ThemeProvider } from "../theme/ThemeContext";
import { sampleWorld } from "../storage/testFixtures";
import WizardScreen from "./WizardScreen";

/**
 * Focused render tests for the GENERIC, graph-driven WizardScreen.
 *
 * The screen renders whatever `getVisibleNodes(tier, answers)` returns, so these
 * assert (a) the Beginner node set, (b) tier-change reactivity revealing Epic
 * nodes, (c) a completable Beginner run reaching Card-Pick, and (d) that a
 * Solid free-text situation survives to the teaching point (the Slice-1 fix,
 * end-to-end through the UI — a default virtue must NOT clobber it).
 */

type Node = TestRenderer.ReactTestInstance;

function isHost(type: unknown, tag: string) {
  return type === tag;
}

function allText(node: Node): string {
  const parts: string[] = [];
  for (const t of node.findAll((n) => isHost(n.type, "rn-text"))) {
    const collect = (c: unknown) => {
      if (typeof c === "string" || typeof c === "number") parts.push(String(c));
      else if (Array.isArray(c)) c.forEach(collect);
    };
    collect(t.props.children);
  }
  return parts.join(" ");
}

function queryTextInput(root: ReactTestRenderer, testID: string): Node | null {
  const hits = root.root.findAll(
    (n) => isHost(n.type, "rn-textinput") && n.props.testID === testID,
  );
  return hits[0] ?? null;
}

function pressableByLabel(root: ReactTestRenderer, label: string): Node {
  const hits = root.root.findAll(
    (n) => isHost(n.type, "rn-pressable") && allText(n).includes(label),
  );
  return hits.sort((a, b) => a.findAll(() => true).length - b.findAll(() => true).length)[0];
}

/** The app opens on the Library shelf (#8); enter the wizard via its CTA. */
async function mountWizard(client?: FakeProxyClient) {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = TestRenderer.create(client ? <App client={client} /> : <App />);
  });
  await act(async () => {
    pressableByLabel(root, "New Story").props.onPress();
  });
  return root;
}

/**
 * The CONTINUE path (#10): the wizard is reached from a saved world's screen, so
 * it is mounted directly with that world as its param — the same way App wires it.
 */
async function mountContinueWizard(client?: FakeProxyClient, world: Storyworld = sampleWorld()) {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = TestRenderer.create(
      <ThemeProvider mode="day">
        <NavProvider>
          <WizardScreen client={client ?? new FakeProxyClient()} params={{ world }} />
        </NavProvider>
      </ThemeProvider>,
    );
  });
  return root;
}

describe("WizardScreen (generic graph renderer)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("(a) Beginner shows the beginner node set and NOT solid/epic-only nodes", async () => {
    const root = await mountWizard();
    const text = allText(root.root);
    // Beginner spine + free-text.
    expect(text).toContain("Tier");
    expect(text).toContain("Age band");
    expect(text).toContain("Virtue");
    expect(queryTextInput(root, "world")).toBeTruthy();
    expect(queryTextInput(root, "hero")).toBeTruthy();
    // Higher-tier-only nodes must be absent at Beginner.
    expect(queryTextInput(root, "villain")).toBeNull();
    expect(queryTextInput(root, "situation")).toBeNull();
    expect(queryTextInput(root, "setting")).toBeNull();
    expect(text).not.toContain("Arc shape");
    expect(text).not.toContain("Directness");
  });

  it("(b) switching the tier to epic reveals epic-only nodes", async () => {
    const root = await mountWizard();
    act(() => {
      pressableByLabel(root, "Epic").props.onPress();
    });
    const text = allText(root.root);
    expect(text).toContain("Directness"); // epic-only dial
    expect(queryTextInput(root, "setting")).toBeTruthy(); // epic-only filler
    expect(queryTextInput(root, "villain")).toBeTruthy(); // solid/epic
    expect(text).toContain("Arc shape"); // solid/epic
  });

  it("(c) a full Beginner run submits, calls generateArc, and reaches Card-Pick", async () => {
    const fake = new FakeProxyClient();
    const spy = vi.spyOn(fake, "generateArc");
    const root = await mountWizard(fake);
    // Beginner: tier + ageBand are seeded; leave world/hero as "surprise me".
    await act(async () => {
      await pressableByLabel(root, "Weave the tale").props.onPress();
    });
    expect(spy).toHaveBeenCalledTimes(1);
    // buildWizardAnswers did not throw (virtue default supplied the teaching point).
    const req = spy.mock.calls[0][0] as GenerateArcRequest;
    expect(req.answers.teachingPoint).toEqual({ kind: "virtue", virtue: "courage" });
    expect(allText(root.root)).toContain("Pick the Art");
  });

  it("(e) continue mode: canon questions give way to the springboard offer + one twist (#10)", async () => {
    const root = await mountContinueWizard();
    const text = allText(root.root);

    // It reads as the NEXT tale in a world the child already knows.
    expect(text).toContain("Next Tale");
    expect(text).toContain("Willowmere");
    // Locked canon already answers who everyone is.
    expect(queryTextInput(root, "world")).toBeNull();
    expect(queryTextInput(root, "hero")).toBeNull();
    // In their place: the world's unresolved hook, offered, and one steering lever.
    expect(text).toContain("What lies past the hill?");
    expect(text).toContain("Not this time");
    expect(queryTextInput(root, "newTwist")).toBeTruthy();
  });

  it("(f) continue mode sends the world (art refs blanked) and the chosen thread", async () => {
    const fake = new FakeProxyClient();
    const spy = vi.spyOn(fake, "generateArc");
    const root = await mountContinueWizard(fake);

    await act(async () => {
      pressableByLabel(root, "What lies past the hill?").props.onPress();
    });
    await act(async () => {
      queryTextInput(root, "newTwist")!.props.onChangeText("the door finally opens");
    });
    await act(async () => {
      await pressableByLabel(root, "Weave the tale").props.onPress();
    });

    const req = spy.mock.calls[0][0] as GenerateArcRequest;
    // The arc belongs to the SAME world — no fresh id, no orphaned canon.
    expect(req.answers.worldId).toBe("world-willowmere");
    expect(req.answers.continueThreadId).toBe("t1");
    expect(req.answers.choices.newTwist).toBe("the door finally opens");
    // Prior canon + bible travel so the proxy can reuse the deck...
    expect(req.world?.deck.map((c) => c.entityId)).toEqual(["hero-1", "villain-1"]);
    expect(req.world?.bible.eventLog).toHaveLength(1);
    expect(req.world?.artStyle.providerStyleRef).toBe("sub:pencil-42");
    // ...but no on-device blob path ever leaves the device.
    expect(req.world?.deck.map((c) => c.lockedImageRef)).toEqual(["", ""]);
  });

  it("(g) declining the springboard still keeps the canon questions hidden", async () => {
    const fake = new FakeProxyClient();
    const spy = vi.spyOn(fake, "generateArc");
    const root = await mountContinueWizard(fake);

    await act(async () => {
      pressableByLabel(root, "Not this time").props.onPress();
    });
    expect(queryTextInput(root, "world")).toBeNull();
    expect(queryTextInput(root, "hero")).toBeNull();

    await act(async () => {
      await pressableByLabel(root, "Weave the tale").props.onPress();
    });
    const req = spy.mock.calls[0][0] as GenerateArcRequest;
    expect(req.answers.continueThreadId).toBeUndefined();
    expect(req.answers.worldId).toBe("world-willowmere"); // still the same world
  });

  it("(h) a world whose every hook is spent offers no springboard at all", async () => {
    const world = sampleWorld({
      bible: {
        ...sampleWorld().bible,
        openThreads: [{ id: "t1", teaser: "Spent already.", originArcId: "arc-1", resolved: true }],
      },
    });
    const root = await mountContinueWizard(undefined, world);
    const text = allText(root.root);
    expect(text).not.toContain("Spent already");
    expect(text).not.toContain("Not this time");
    // The twist lever still stands in for the hidden canon questions.
    expect(queryTextInput(root, "newTwist")).toBeTruthy();
  });

  it("(d) a Solid run with a free-text situation yields a situation teaching point (virtue default does NOT clobber)", async () => {
    const fake = new FakeProxyClient();
    const spy = vi.spyOn(fake, "generateArc");
    const root = await mountWizard(fake);
    // Move to Solid (offers the free-text teaching box), then fill the situation.
    await act(async () => {
      pressableByLabel(root, "Solid").props.onPress();
    });
    await act(async () => {
      const situation = queryTextInput(root, "situation");
      expect(situation).toBeTruthy();
      situation!.props.onChangeText("sharing the last cookie when it is hard");
    });
    await act(async () => {
      await pressableByLabel(root, "Weave the tale").props.onPress();
    });
    expect(spy).toHaveBeenCalledTimes(1);
    const req = spy.mock.calls[0][0] as GenerateArcRequest;
    // The Slice-1 fix: the present situation wins over the merely-DEFAULT virtue.
    expect(req.answers.teachingPoint).toEqual({
      kind: "situation",
      description: "sharing the last cookie when it is hard",
      heavy: false,
    });
  });
});
