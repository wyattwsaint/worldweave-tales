import React from "react";
import TestRenderer, { act, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it } from "vitest";
import App from "../../App";
import { FakeProxyClient } from "../api/fakeProxyClient";
import { store } from "../storage/store";

/**
 * HEADLESS ACCEPTANCE RENDER HARNESS.
 *
 * Mounts the REAL screen components + the REAL hand-rolled navigator (via App)
 * under react-test-renderer and drives the Wizard -> Card-Pick -> Viewer flow,
 * asserting what a user would SEE at each step.
 *
 * This is VERIFICATION, not implement-to-green. Assertions express CORRECT
 * user-visible behavior. Where product code is wrong, the assertion is expected
 * to FAIL — that failure IS the deliverable finding. No product code is changed
 * to make these pass.
 */

// ---- react-test-renderer traversal helpers -------------------------------

type Node = TestRenderer.ReactTestInstance;

function isHost(type: unknown, tag: string) {
  return type === tag;
}

/** All host text rendered anywhere under `node`, concatenated. */
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

/** A text node in the graph renderer, addressed by its stable node-id testID. */
function textInputByTestID(root: ReactTestRenderer, testID: string): Node {
  return root.root.find(
    (n) => isHost(n.type, "rn-textinput") && n.props.testID === testID,
  );
}

/** A tappable Pressable whose visible label contains `label`. */
function pressableByLabel(root: ReactTestRenderer, label: string): Node {
  const hits = root.root.findAll(
    (n) => isHost(n.type, "rn-pressable") && allText(n).includes(label),
  );
  // Prefer the most specific (fewest descendants) match.
  return hits.sort((a, b) => a.findAll(() => true).length - b.findAll(() => true).length)[0];
}

// ---- the flow ------------------------------------------------------------

const results: Array<{ name: string; ok: boolean }> = [];
function check(name: string, fn: () => void | Promise<void>) {
  it(name, async () => {
    try {
      await fn();
      results.push({ name, ok: true });
    } catch (e) {
      results.push({ name, ok: false });
      throw e;
    }
  });
}

/** Run one full Wizard->CardPick->Viewer pass; returns the final render + screen text. */
async function runFlow(overrides?: { world?: string; hero?: string; villain?: string }) {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = TestRenderer.create(<App client={new FakeProxyClient()} />);
  });

  // --- SHELF: the app opens on the Library bookshelf (#8); enter the wizard. ---
  await act(async () => {
    pressableByLabel(root, "New Story").props.onPress();
  });

  // --- WIZARD: pick a tier that exposes all three story fields, fill them, submit.
  // The wizard is now a generic graph renderer: villain is a Solid/Epic node, so
  // select "solid" first to reveal it, then address each free-text node by its
  // stable node-id testID. ---
  const world = overrides?.world ?? "Willowmere";
  const hero = overrides?.hero ?? "Pip";
  const villain = overrides?.villain ?? "Gloom";
  await act(async () => {
    pressableByLabel(root, "Solid").props.onPress();
  });
  await act(async () => {
    textInputByTestID(root, "world").props.onChangeText(world);
  });
  await act(async () => {
    textInputByTestID(root, "hero").props.onChangeText(hero);
  });
  await act(async () => {
    textInputByTestID(root, "villain").props.onChangeText(villain);
  });

  const wizardText = allText(root.root);

  await act(async () => {
    await pressableByLabel(root, "Weave the tale").props.onPress();
  });

  const cardPickText = allText(root.root);

  // --- CARD-PICK: tap first variant for hero and villain, confirm ---
  await act(async () => {
    root.root
      .find((n) => isHost(n.type, "rn-pressable") && allText(n).includes("stub-image:hero#0"))
      .props.onPress();
  });
  await act(async () => {
    root.root
      .find((n) => isHost(n.type, "rn-pressable") && allText(n).includes("stub-image:villain#0"))
      .props.onPress();
  });
  await act(async () => {
    await pressableByLabel(root, "Weave the tale").props.onPress();
  });

  const viewerText = allText(root.root);
  return { root, wizardText, cardPickText, viewerText, world, hero, villain };
}

// ==========================================================================

describe("acceptance: Wizard -> Card-Pick -> Viewer render flow", () => {
  afterEach(() => {
    // Reset the module-singleton store between tests so each run is isolated.
    const bag = store as unknown as { worlds: Map<string, unknown>; arcs: Map<string, unknown> };
    bag.worlds.clear();
    bag.arcs.clear();
  });

  check("A1 App opens on the shelf; ＋ New Story shows the graph-driven wizard fields", async () => {
    // Bookshelf-first (#8): the wizard sits behind the shelf's CTA. At the
    // seeded Beginner tier the world + hero free-text nodes are visible;
    // villain is a Solid/Epic node.
    let root!: ReactTestRenderer;
    await act(async () => {
      root = TestRenderer.create(<App client={new FakeProxyClient()} />);
    });
    await act(async () => {
      pressableByLabel(root, "New Story").props.onPress();
    });
    expect(allText(root.root)).toContain("New Story");
    expect(textInputByTestID(root, "world")).toBeTruthy();
    expect(textInputByTestID(root, "hero")).toBeTruthy();
    // Reveal the Solid/Epic villain node by switching tiers.
    act(() => {
      pressableByLabel(root, "Solid").props.onPress();
    });
    expect(textInputByTestID(root, "villain")).toBeTruthy();
  });

  check("A2 After submit, Card-Pick shows 'Pick the Art' and hero+villain variant swatches", async () => {
    const { cardPickText } = await runFlow();
    expect(cardPickText).toContain("Pick the Art");
    expect(cardPickText).toContain("stub-image:hero#0");
    expect(cardPickText).toContain("stub-image:hero#2");
    expect(cardPickText).toContain("stub-image:villain#0");
  });

  check("A3 Viewer pages through the finished tale: title, all spine beats, and chosen hero/villain names", async () => {
    // The #5 rebuild shows ONE page (beat) per screen — the reader turns pages
    // with "Next page", so the whole tale is the union of what each page shows.
    const { root, viewerText } = await runFlow({ hero: "Pip", villain: "Gloom" });
    let seen = viewerText;
    for (let turns = 0; turns < 12; turns++) {
      const next = pressableByLabel(root, "Next page");
      if (!next) break;
      await act(async () => {
        next.props.onPress();
      });
      seen += " " + allText(root.root);
    }
    expect(seen).toContain("Your Tale");
    for (const beat of ["setup", "call-to-adventure", "virtue-tested", "good-triumphs", "gentle-hope-hook"]) {
      expect(seen).toContain(beat);
    }
    // Parent-chosen card names carried through canonization.
    expect(seen).toContain("Pip");
    expect(seen).toContain("Gloom");
  });

  check("A4 Viewer beat text reflects the chosen teaching virtue ('courage' default)", async () => {
    const { viewerText } = await runFlow();
    expect(viewerText).toContain("courage");
  });

  // ---- FINDINGS: assertions expected to FAIL against current product code ----

  check(
    "B1 [BUG: bible discarded at CardPick->Viewer] saved world's bible carries the generated content",
    async () => {
      await runFlow();
      const worlds = await store.listWorldSummaries();
      expect(worlds.length).toBeGreaterThan(0);
      const saved = await store.getWorld(worlds[worlds.length - 1].id);
      expect(saved).toBeTruthy();
      // FakeProxyClient.generateArc produced a real StoryBible (virtuesTaught,
      // eventLog, openThreads, entitySheets). Viewer must persist THAT bible,
      // not an empty one. Current code rebuilds an empty bible -> FAILS.
      expect(saved?.bible.virtuesTaught).toContain("courage");
      expect(saved?.bible.eventLog.length).toBeGreaterThan(0);
      expect(saved?.bible.entitySheets.length).toBeGreaterThan(0);
    },
  );

  check(
    "B2 [BUG: worldId clobber under 'new-world'] two runs persist two distinct worlds",
    async () => {
      await runFlow({ world: "Willowmere", hero: "Pip", villain: "Gloom" });
      const afterFirst = (await store.listWorldSummaries()).length;
      await runFlow({ world: "Brackenford", hero: "Bramble", villain: "Murk" });
      const worlds = await store.listWorldSummaries();
      // Each finished story is its own world; ids must be unique. Current code
      // stamps worldId = "new-world" for every run, so the second clobbers the
      // first -> the listing stays length 1 -> FAILS.
      expect(afterFirst).toBe(1);
      expect(worlds.length).toBe(2);
      const ids = new Set(worlds.map((w) => w.id));
      expect(ids.size).toBe(2);
    },
  );

  check(
    "C1 [#10] a second arc continues the SAME world: canon reused, bible grown, both tales re-readable",
    async () => {
      // Arc 1, the ordinary way.
      const { root } = await runFlow({ world: "Willowmere", hero: "Pip", villain: "Gloom" });
      await act(async () => {
        pressableByLabel(root, "‹ Shelf").props.onPress();
      });

      // Shelf -> the world's own screen. Its canon and its one tale are visible.
      await act(async () => {
        pressableByLabel(root, "courage").props.onPress();
      });
      const worldText = allText(root.root);
      expect(worldText).toContain("The canon");
      expect(worldText).toContain("One tale so far");

      // Weave a NEXT tale in that world: no canon questions, a springboard offered.
      await act(async () => {
        pressableByLabel(root, "Weave a new tale").props.onPress();
      });
      const wizardText = allText(root.root);
      expect(wizardText).toContain("Next Tale");
      expect(wizardText).toContain("A tiny door in the old willow");
      await act(async () => {
        pressableByLabel(root, "A tiny door in the old willow").props.onPress();
      });
      await act(async () => {
        await pressableByLabel(root, "Weave the tale").props.onPress();
      });

      // Every face is already drawn — nothing to pick, so Card-Pick just weaves on.
      expect(allText(root.root)).toContain("cast is already drawn");
      await act(async () => {
        await pressableByLabel(root, "Weave the tale").props.onPress();
      });

      // The returning cast still has its art on the page (locked in arc 1).
      const viewerText = allText(root.root);
      expect(viewerText).toContain("Pip");

      // ONE world on the shelf, owning BOTH arcs, with canon and bible intact.
      const worlds = await store.listWorldSummaries();
      expect(worlds).toHaveLength(1);
      const saved = (await store.getWorld(worlds[0].id))!;
      expect(saved.name).toBe("courage"); // arc 1's title stayed the shelf label
      expect(saved.arcIds).toHaveLength(2);
      expect(saved.deck.map((c) => c.canonName)).toContain("Pip");
      expect(saved.bible.eventLog).toHaveLength(2);
      expect(saved.bible.virtuesTaught).toEqual(["courage", "courage"]);
      // The springboard the parent picked up is spent; arc 2 seeded a fresh one.
      const threads = saved.bible.openThreads;
      expect(threads.find((t) => t.teaser.includes("tiny door"))?.resolved).toBe(true);
      expect(threads.some((t) => !t.resolved)).toBe(true);
      // Both tales are re-readable from the world screen.
      expect((await store.listArcs(saved.id)).map((a) => a.id)).toEqual(["arc-fake-2", "arc-fake-1"]);
    },
  );

  it("ZZ summary", () => {
    // eslint-disable-next-line no-console
    console.log(
      "\n=== ACCEPTANCE HARNESS ASSERTION MAP ===\n" +
        results.map((r) => `${r.ok ? "PASS" : "FAIL"}  ${r.name}`).join("\n") +
        "\n========================================\n",
    );
  });
});
