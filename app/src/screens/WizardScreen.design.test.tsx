import React from "react";
import TestRenderer, { act, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it } from "vitest";
import type { GenerateArcRequest, GenerateArcResponse, WizardAnswers } from "@wwt/domain";
import { NavProvider, useNav, type NavState } from "../nav/NavContext";
import { ThemeProvider } from "../theme/ThemeContext";
import { palettes, typography, type ThemeMode } from "../theme/tokens";
import { expectPressedFeedback, flat } from "../../test/pressedFeedback";
import { FakeProxyClient } from "../api/fakeProxyClient";
import type { ProxyClientLike } from "../api/proxyClient";
import WizardScreen from "./WizardScreen";

/**
 * Wizard — #5 build-order slice 5 (the final screen), restyled to the locked
 * direction (docs/design/ui-direction.md + prototype-confirmed appendix),
 * preserving the existing graph-driven flow behavior:
 *
 * - "New Story" header in display type on the bg ground + lamp wash;
 * - every visible question sits on its own surface card (hairline `line`
 *   border, radius 14) with a spine-stage label;
 * - choice chips are labelled >=44pt buttons; the current pick carries the
 *   accent edge (recolor only — constant border width, no layout jump);
 * - free-text fields are themed inputs (ink on the bg ground, themed
 *   placeholder — never a hardcoded gray);
 * - the closing-verse toggle is a >=44pt switch with a checked state;
 * - "Weave the tale" is the single accent pill of the form state;
 * - the normal flow stays no-back (§7: escape belongs to the ERROR state);
 * - weaving (busy): the form yields to a fading wait card (built-in Animated)
 *   with skeleton page lines — "page"/story copy, never "beat";
 * - §7 failure escape, EXACTLY as locked: warm parent-facing error copy (ink
 *   on surface — no dev-speak, no harsh red, never the raw message), a
 *   "Try again" accent pill that resubmits the PRESERVED answers, and a quiet
 *   "‹ Back to the Shelf" ghost link riding the nav's existing goHome;
 * - both palettes via ThemeContext — zero hardcoded color/font in the screen;
 * - dynamic type stays bounded (maxFontSizeMultiplier) in every state.
 */

type Node = TestRenderer.ReactTestInstance;

function isHost(type: unknown, tag: string) {
  return type === tag;
}

/** Every host-text string rendered anywhere under the tree, concatenated. */
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

/** A tappable Pressable whose visible label contains `label` (most specific). */
function pressableByLabel(root: ReactTestRenderer, label: string): Node | undefined {
  const hits = root.root.findAll(
    (n) => isHost(n.type, "rn-pressable") && allText(n).includes(label),
  );
  return hits.sort((a, b) => a.findAll(() => true).length - b.findAll(() => true).length)[0];
}

function byA11yLabel(root: ReactTestRenderer, label: string): Node[] {
  return root.root.findAll((n) => n.props?.accessibilityLabel === label);
}

/** All accessibilityLabel strings anywhere in the tree. */
function allLabels(root: ReactTestRenderer): string[] {
  return root.root
    .findAll((n) => typeof n.props?.accessibilityLabel === "string")
    .map((n) => n.props.accessibilityLabel as string);
}

function textInputByTestID(root: ReactTestRenderer, testID: string): Node | undefined {
  return root.root.findAll(
    (n) => isHost(n.type, "rn-textinput") && n.props.testID === testID,
  )[0];
}

/** Every rn-text bounds its scaling (or opts fully out for positioned art). */
function expectEveryTextBounded(root: ReactTestRenderer) {
  const texts = root.root.findAll((n) => isHost(n.type, "rn-text"));
  expect(texts.length).toBeGreaterThan(0);
  for (const t of texts) {
    if (t.props.allowFontScaling === false) continue;
    expect(typeof t.props.maxFontSizeMultiplier).toBe("number");
    expect(t.props.maxFontSizeMultiplier as number).toBeLessThanOrEqual(1.6);
  }
}

let navState: NavState | undefined;
function NavProbe() {
  navState = useNav().state;
  return null;
}

/**
 * Scripted proxy client: records every request, fails the first `failures`
 * calls with a dev-speak error (which must NEVER reach the parent's eyes),
 * hangs forever when `hang`, and otherwise answers like the FakeProxyClient.
 */
class ScriptedClient implements ProxyClientLike {
  calls: GenerateArcRequest[] = [];
  private inner = new FakeProxyClient();
  constructor(
    private failures = 0,
    private hang = false,
  ) {}

  generateArc(req: GenerateArcRequest): Promise<GenerateArcResponse> {
    this.calls.push(req);
    if (this.hang) return new Promise<GenerateArcResponse>(() => {});
    if (this.failures > 0) {
      this.failures -= 1;
      return Promise.reject(new Error("ECONNREFUSED 127.0.0.1:8787 fetch failed"));
    }
    return this.inner.generateArc(req);
  }
}

async function mountWizard(
  mode: ThemeMode = "day",
  client: ProxyClientLike = new FakeProxyClient(),
): Promise<ReactTestRenderer> {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = TestRenderer.create(
      <ThemeProvider mode={mode}>
        <NavProvider>
          <NavProbe />
          <WizardScreen client={client} />
        </NavProvider>
      </ThemeProvider>,
    );
  });
  return root;
}

async function press(node: Node | undefined) {
  expect(node).toBeTruthy();
  await act(async () => {
    await node!.props.onPress();
  });
}

/** Press without awaiting settlement — for the hanging (weaving) state. */
async function pressNoSettle(node: Node | undefined) {
  expect(node).toBeTruthy();
  await act(async () => {
    void node!.props.onPress();
  });
}

beforeEach(() => {
  navState = undefined;
});

describe("Wizard header", () => {
  it("'New Story' is a display-type header in ink", async () => {
    const root = await mountWizard();
    const title = root.root
      .findAll((n) => isHost(n.type, "rn-text") && allText(n).includes("New Story"))
      .find((n) => n.props.accessibilityRole === "header");
    expect(title).toBeTruthy();
    const s = flat(title!.props.style);
    expect(s.fontFamily).toBe(typography.display.fontFamily);
    expect(s.fontSize).toBe(typography.display.fontSize);
    expect(s.color).toBe(palettes.day.ink);
  });

  it("keeps a warm guidance line, set in the supporting ink", async () => {
    const root = await mountWizard();
    const sub = root.root.find(
      (n) => isHost(n.type, "rn-text") && allText(n).includes("we weave the pages"),
    );
    expect(flat(sub.props.style).color).toBe(palettes.day.ink2);
  });
});

describe("Wizard ground + lamp wash", () => {
  it("day: the screen's ROOT container carries the day bg ground", async () => {
    const root = await mountWizard("day");
    const screenRoot = root.root.findAll((n) => isHost(n.type, "rn-view"))[0];
    const s = flat(screenRoot.props.style);
    expect(s.flex).toBe(1);
    expect(s.backgroundColor).toBe(palettes.day.bg);
  });

  it("a decorative accent lamp wash glows from the top (no touches, whisper opacity)", async () => {
    const root = await mountWizard();
    const wash = root.root.findAll((n) => {
      if (!isHost(n.type, "rn-view")) return false;
      const s = flat(n.props.style);
      return s.backgroundColor === palettes.day.accent && (s.opacity as number) <= 0.1;
    });
    expect(wash).toHaveLength(1);
    expect(wash[0].props.pointerEvents).toBe("none");
  });
});

describe("Wizard question cards", () => {
  it("every visible Beginner question sits on a surface card with a hairline border and radius 14", async () => {
    const root = await mountWizard();
    const cards = root.root.findAll((n) => {
      if (!isHost(n.type, "rn-view")) return false;
      const s = flat(n.props.style);
      return s.backgroundColor === palettes.day.surface && s.borderRadius === 14;
    });
    // Beginner node set: tier, ageBand, world, hero, virtue, closingVerse.
    expect(cards).toHaveLength(6);
    for (const card of cards) {
      const s = flat(card.props.style);
      expect(s.borderColor).toBe(palettes.day.line);
      expect(s.borderWidth).toBe(1);
    }
  });

  it("question labels are spine-stage chrome in the supporting ink", async () => {
    const root = await mountWizard();
    const label = root.root.find((n) => isHost(n.type, "rn-text") && allText(n) === "Tier");
    const s = flat(label.props.style);
    expect(s.fontFamily).toBe(typography.spineStage.fontFamily);
    expect(s.color).toBe(palettes.day.ink2);
  });
});

describe("Wizard choice chips", () => {
  it("chips are labelled >=44pt buttons; the current pick carries the accent edge", async () => {
    const root = await mountWizard();
    const beginner = pressableByLabel(root, "Beginner")!;
    expect(beginner).toBeTruthy();
    expect(beginner.props.accessibilityRole).toBe("button");
    expect(beginner.props.accessibilityState?.selected).toBe(true);
    const on = flat(beginner.props.style);
    expect(on.minHeight as number).toBeGreaterThanOrEqual(44);
    expect(on.borderColor).toBe(palettes.day.accent);

    const solid = pressableByLabel(root, "Solid")!;
    expect(solid.props.accessibilityState?.selected).toBe(false);
    const off = flat(solid.props.style);
    expect(off.borderColor).toBe(palettes.day.line);
    // Same border width in both states — selection recolors, never resizes.
    expect(off.borderWidth).toBe(on.borderWidth);
    // The chip label reads at full contrast in both states: ink on / ink2 off.
    expect(flat(beginner.findAll((n) => isHost(n.type, "rn-text"))[0].props.style).color).toBe(
      palettes.day.ink,
    );
    expect(flat(solid.findAll((n) => isHost(n.type, "rn-text"))[0].props.style).color).toBe(
      palettes.day.ink2,
    );
  });

  it("picking another chip moves the accent edge with the selection", async () => {
    const root = await mountWizard();
    await press(pressableByLabel(root, "Solid"));
    expect(pressableByLabel(root, "Solid")!.props.accessibilityState?.selected).toBe(true);
    expect(flat(pressableByLabel(root, "Solid")!.props.style).borderColor).toBe(palettes.day.accent);
    expect(pressableByLabel(root, "Beginner")!.props.accessibilityState?.selected).toBe(false);
    expect(flat(pressableByLabel(root, "Beginner")!.props.style).borderColor).toBe(palettes.day.line);
  });

  it("chip copy is humanized — hyphens become spaces, sentence case; raw graph ids never show", async () => {
    const root = await mountWizard();
    // ageBand's raw id "early-reader" reads as warm copy, not graph-speak.
    expect(pressableByLabel(root, "Early reader")).toBeTruthy();
    const text = allText(root.root);
    expect(text).not.toContain("early-reader");
    expect(text).not.toContain("beginner"); // sentence-cased to "Beginner"
  });

  it("tapping a humanized chip still stores the RAW graph id in the submitted answers", async () => {
    const client = new ScriptedClient();
    const root = await mountWizard("day", client);
    await press(pressableByLabel(root, "Early reader"));
    await press(pressableByLabel(root, "Weave the tale"));
    expect(client.calls).toHaveLength(1);
    // The domain answer bag is untouched by display humanization.
    expect(client.calls[0].answers.ageBand).toBe("early-reader");
  });
});

describe("Wizard free-text fields", () => {
  it("inputs are themed: ink text on the bg ground, hairline border, themed placeholder", async () => {
    const root = await mountWizard();
    const world = textInputByTestID(root, "world")!;
    expect(world).toBeTruthy();
    const s = flat(world.props.style);
    expect(s.color).toBe(palettes.day.ink);
    expect(s.backgroundColor).toBe(palettes.day.bg);
    expect(s.borderColor).toBe(palettes.day.line);
    expect(s.minHeight as number).toBeGreaterThanOrEqual(44);
    // The placeholder comes from the palette too — never a hardcoded gray.
    expect(world.props.placeholderTextColor).toBe(palettes.day.ink2);
  });
});

describe("Wizard closing-verse toggle", () => {
  it("is a >=44pt switch with a checked state; On carries the accent edge", async () => {
    const root = await mountWizard();
    const toggle = () =>
      root.root.find((n) => isHost(n.type, "rn-pressable") && n.props.testID === "closingVerse");
    expect(toggle().props.accessibilityRole).toBe("switch");
    expect(toggle().props.accessibilityState?.checked).toBe(false);
    expect(flat(toggle().props.style).minHeight as number).toBeGreaterThanOrEqual(44);
    expect(flat(toggle().props.style).borderColor).toBe(palettes.day.line);
    await press(toggle());
    expect(toggle().props.accessibilityState?.checked).toBe(true);
    expect(flat(toggle().props.style).borderColor).toBe(palettes.day.accent);
    expect(allText(toggle())).toContain("On");
  });

  it("carries its question's name for screen readers — 'Closing verse', never a bare Off", async () => {
    const root = await mountWizard();
    const toggle = root.root.find(
      (n) => isHost(n.type, "rn-pressable") && n.props.testID === "closingVerse",
    );
    expect(toggle.props.accessibilityLabel).toBe("Closing verse");
  });
});

describe("Wizard primary action", () => {
  it("Weave the tale is the ONE accent pill with a >=44pt target and accentInk label", async () => {
    const root = await mountWizard();
    const weave = pressableByLabel(root, "Weave the tale")!;
    expect(weave).toBeTruthy();
    expect(weave.props.accessibilityRole).toBe("button");
    const s = flat(weave.props.style);
    expect(s.backgroundColor).toBe(palettes.day.accent);
    expect(s.borderRadius).toBe(999);
    expect(s.minHeight as number).toBeGreaterThanOrEqual(44);
    const label = weave.findAll((n) => isHost(n.type, "rn-text"))[0];
    const ts = flat(label.props.style);
    expect(ts.fontFamily).toBe(typography.button.fontFamily);
    expect(ts.color).toBe(palettes.day.accentInk);
    // Accent grounds the primary action ONLY — chips never fill with accent.
    const accentGrounded = root.root.findAll(
      (n) =>
        isHost(n.type, "rn-pressable") &&
        flat(n.props.style).backgroundColor === palettes.day.accent,
    );
    expect(accentGrounded).toHaveLength(1);
  });

  it("the normal flow offers no way back — escape belongs to the error state alone (§7)", async () => {
    const root = await mountWizard();
    expect(allText(root.root)).not.toContain("Back to the Shelf");
    expect(allLabels(root)).not.toContain("Back to the Shelf");
  });
});

describe("Wizard weaving (loading) state", () => {
  it("while weaving, the form yields to a fading wait card with skeleton page lines", async () => {
    const client = new ScriptedClient(0, true); // hangs — the weave never settles
    const root = await mountWizard("day", client);
    await pressNoSettle(pressableByLabel(root, "Weave the tale"));

    // The wait card is an Animated fade-in on a surface card (built-in only).
    const waits = root.root.findAll((n) => {
      if (!isHost(n.type, "rn-animated-view")) return false;
      const s = flat(n.props.style);
      return s.backgroundColor === palettes.day.surface && s.borderRadius === 14;
    });
    expect(waits).toHaveLength(1);
    expect(typeof flat(waits[0].props.style).opacity).toBe("object"); // animated, not static

    // Skeleton page lines shimmer-quietly in the hairline tone.
    const bones = root.root.findAll((n) => {
      if (!isHost(n.type, "rn-view")) return false;
      const s = flat(n.props.style);
      return s.backgroundColor === palettes.day.line && s.borderRadius === 6;
    });
    expect(bones.length).toBeGreaterThanOrEqual(3);

    // Warm story copy — "page" language, and the form's controls step aside.
    const text = allText(root.root);
    expect(text).toContain("Weaving");
    expect(text).toContain("pages");
    expect(pressableByLabel(root, "Weave the tale")).toBeUndefined();
    expect(textInputByTestID(root, "world")).toBeUndefined();
    expectEveryTextBounded(root);
  });

  it("the wait card is a polite live region — weaving is voiced, not silent", async () => {
    const client = new ScriptedClient(0, true); // hangs — the weave never settles
    const root = await mountWizard("day", client);
    await pressNoSettle(pressableByLabel(root, "Weave the tale"));

    const wait = root.root.findAll((n) => isHost(n.type, "rn-animated-view"))[0];
    expect(wait).toBeTruthy();
    expect(wait.props.accessibilityLiveRegion).toBe("polite");
  });
});

describe("Wizard §7 failure escape (error state ONLY)", () => {
  it("a failed weave reads warm on a surface — never dev-speak, never the raw error", async () => {
    const root = await mountWizard("day", new ScriptedClient(Infinity as unknown as number));
    await press(pressableByLabel(root, "Weave the tale"));

    const err = root.root.find(
      (n) => isHost(n.type, "rn-text") && allText(n).includes("Your choices are safe"),
    );
    const s = flat(err.props.style);
    expect(s.color).toBe(palettes.day.ink);
    expect(s.backgroundColor).toBe(palettes.day.surface);
    expect(s.borderColor).toBe(palettes.day.line);
    // The exception's message stays internal — no dev-speak on the page.
    expect(allText(root.root)).not.toContain("ECONNREFUSED");
    expectEveryTextBounded(root);
  });

  it("the failure copy is announced — a polite live-region alert, not a silent swap", async () => {
    const root = await mountWizard("day", new ScriptedClient(Infinity as unknown as number));
    await press(pressableByLabel(root, "Weave the tale"));

    const err = root.root.find(
      (n) => isHost(n.type, "rn-text") && allText(n).includes("Your choices are safe"),
    );
    expect(err.props.accessibilityLiveRegion).toBe("polite");
    expect(err.props.accessibilityRole).toBe("alert");
  });

  it("Try again is the accent pill of the error state — Weave the tale steps aside", async () => {
    const root = await mountWizard("day", new ScriptedClient(Infinity as unknown as number));
    await press(pressableByLabel(root, "Weave the tale"));

    expect(pressableByLabel(root, "Weave the tale")).toBeUndefined();
    const retry = pressableByLabel(root, "Try again")!;
    expect(retry).toBeTruthy();
    expect(retry.props.accessibilityRole).toBe("button");
    const s = flat(retry.props.style);
    expect(s.backgroundColor).toBe(palettes.day.accent);
    expect(s.borderRadius).toBe(999);
    expect(s.minHeight as number).toBeGreaterThanOrEqual(44);
  });

  it("Try again resubmits the PRESERVED answers and completes the weave", async () => {
    const client = new ScriptedClient(1); // fail once, then succeed
    const root = await mountWizard("day", client);
    await act(async () => {
      textInputByTestID(root, "hero")!.props.onChangeText("Pip");
    });
    await act(async () => {
      textInputByTestID(root, "world")!.props.onChangeText("Willowmere");
    });
    await press(pressableByLabel(root, "Weave the tale"));

    // The answers survive the failure — visibly (inputs) and in state.
    expect(textInputByTestID(root, "hero")!.props.value).toBe("Pip");
    await press(pressableByLabel(root, "Try again"));

    expect(client.calls).toHaveLength(2);
    const strip = (a: WizardAnswers) => ({ ...a, worldId: "same" });
    expect(strip(client.calls[1].answers)).toEqual(strip(client.calls[0].answers));
    expect(client.calls[1].answers.choices.hero).toBe("Pip");
    expect(navState?.screen).toBe("cardpick");
  });

  it("‹ Back to the Shelf is a quiet ghost link that rides goHome", async () => {
    const root = await mountWizard("day", new ScriptedClient(Infinity as unknown as number));
    await press(pressableByLabel(root, "Weave the tale"));

    const escape = byA11yLabel(root, "Back to the Shelf")[0];
    expect(escape).toBeTruthy();
    expect(escape.props.accessibilityRole).toBe("button");
    const s = flat(escape.props.style);
    expect(s.minHeight as number).toBeGreaterThanOrEqual(44);
    // Quiet: no accent ground — the escape must not compete with Try again.
    expect(s.backgroundColor).not.toBe(palettes.day.accent);
    const label = escape.findAll((n) => isHost(n.type, "rn-text"))[0];
    expect(allText(escape)).toContain("‹ Back to the Shelf");
    const ts = flat(label.props.style);
    expect(ts.fontFamily).toBe(typography.backLink.fontFamily);
    expect(ts.color).toBe(palettes.day.ink2);

    await press(escape);
    expect(navState?.screen).toBe("library");
  });
});

describe("Wizard pressed states (§5 — Pressable style-function feedback)", () => {
  it("chips, the closing-verse toggle and the primary pill all dim under the finger", async () => {
    const root = await mountWizard();
    const controls = root.root.findAll(
      (n) =>
        isHost(n.type, "rn-pressable") &&
        (n.props.accessibilityRole === "button" || n.props.accessibilityRole === "switch"),
    );
    // Beginner form: tier chips + ageBand chips + virtue chips + toggle + Weave.
    expect(controls.length).toBeGreaterThanOrEqual(8);
    for (const c of controls) expectPressedFeedback(c);
  });

  it("the §7 error state's Try again and escape link give the same feedback", async () => {
    const root = await mountWizard("day", new ScriptedClient(Infinity as unknown as number));
    await press(pressableByLabel(root, "Weave the tale"));
    expectPressedFeedback(pressableByLabel(root, "Try again"));
    expectPressedFeedback(byA11yLabel(root, "Back to the Shelf")[0]);
  });
});

describe("Wizard copy rule — story language, never 'beat'", () => {
  it("no reader-facing text or a11y label says 'beat' — form, weaving, and error states", async () => {
    const seen: string[] = [];
    const form = await mountWizard();
    seen.push(allText(form.root), ...allLabels(form));

    const weaving = await mountWizard("day", new ScriptedClient(0, true));
    await pressNoSettle(pressableByLabel(weaving, "Weave the tale"));
    seen.push(allText(weaving.root), ...allLabels(weaving));

    const failed = await mountWizard("day", new ScriptedClient(Infinity as unknown as number));
    await press(pressableByLabel(failed, "Weave the tale"));
    seen.push(allText(failed.root), ...allLabels(failed));

    for (const s of seen) {
      expect(s).not.toMatch(/\bbeats?\b/i);
    }
  });
});

describe("Wizard palettes — day and night, tokens only", () => {
  it("night: ground, surface and ink all flip; no day-only value leaks in", async () => {
    const root = await mountWizard("night");
    const styles = root.root.findAll((n) => Boolean(n.props?.style)).map((n) => flat(n.props.style));
    const values = styles.flatMap((s) => Object.values(s));
    expect(values).toContain(palettes.night.bg);
    expect(values).toContain(palettes.night.surface);
    expect(values).toContain(palettes.night.ink);
    for (const dayOnly of [palettes.day.bg, palettes.day.surface, palettes.day.ink, palettes.day.ink2, palettes.day.line]) {
      expect(values).not.toContain(dayOnly);
    }
  });

  it("night error state: the warm copy sits night-ink on the night surface", async () => {
    const root = await mountWizard("night", new ScriptedClient(Infinity as unknown as number));
    await press(pressableByLabel(root, "Weave the tale"));
    const err = root.root.find(
      (n) => isHost(n.type, "rn-text") && allText(n).includes("Your choices are safe"),
    );
    const s = flat(err.props.style);
    expect(s.color).toBe(palettes.night.ink);
    expect(s.backgroundColor).toBe(palettes.night.surface);
  });
});

describe("Wizard dynamic type", () => {
  it("every text bounds its font scaling (maxFontSizeMultiplier)", async () => {
    const root = await mountWizard();
    expectEveryTextBounded(root);
  });
});
