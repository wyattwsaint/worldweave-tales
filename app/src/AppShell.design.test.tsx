import React from "react";
import TestRenderer, { act, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StatusBar } from "expo-status-bar";
import { __setColorScheme } from "../test/react-native.mock";
import App from "../App";
import { FakeProxyClient } from "./api/fakeProxyClient";
import { palettes } from "./theme/tokens";
import { setBlobFs, store } from "./storage/store";
import type { BlobFs } from "./storage/blobStore";

/**
 * Nav shell — the §6 final sweep. The shell around the hand-rolled navigator
 * is themed like everything else:
 *
 * - the container BEHIND whichever screen the navigator shows carries the
 *   theme's ground, so a screen swap can never flash an unthemed frame;
 * - the status bar follows the THEME: dark ink glyphs over day parchment,
 *   light lamplight glyphs over the night sky — routed through the resolved
 *   theme mode, not left to the OS default.
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

/** Flattened RN style (style-functions resolved at rest, arrays merged, falsy dropped). */
function flat(style: unknown): Record<string, unknown> {
  if (!style) return {};
  if (typeof style === "function") return flat(style({ pressed: false }));
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flat));
  return style as Record<string, unknown>;
}

async function mountApp(): Promise<ReactTestRenderer> {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = TestRenderer.create(<App client={new FakeProxyClient()} />);
  });
  return root;
}

// Reset the module-singleton InMemoryStore between tests so each run is isolated.
const bag = store as unknown as { worlds: Map<string, unknown>; arcs: Map<string, unknown> };

beforeEach(() => {
  bag.worlds.clear();
  bag.arcs.clear();
  setBlobFs(fakeFs);
  __setColorScheme("light");
});
afterEach(() => {
  setBlobFs(undefined);
  __setColorScheme("light");
});

describe("nav shell — themed ground behind the screens", () => {
  /**
   * The SHELL's own container — not a screen's root — must own the ground: it
   * is the view that also hosts the status bar, sitting between the navigator
   * and whatever screen is current, so a screen swap never shows through.
   */
  function shellView(root: ReactTestRenderer): Node {
    const shell = root.root.findAll(
      (n) =>
        isHost(n.type, "rn-view") &&
        n.findAllByType(StatusBar as unknown as React.ComponentType).length === 1,
    )[0];
    expect(shell).toBeTruthy();
    return shell;
  }

  it("day: the shell's own container carries the day bg (no unthemed flash)", async () => {
    const root = await mountApp();
    const s = flat(shellView(root).props.style);
    expect(s.flex).toBe(1);
    expect(s.backgroundColor).toBe(palettes.day.bg);
  });

  it("night: the shell ground flips with the system scheme", async () => {
    __setColorScheme("dark");
    const root = await mountApp();
    expect(flat(shellView(root).props.style).backgroundColor).toBe(palettes.night.bg);
  });
});

describe("nav shell — themed status bar", () => {
  it("day parchment gets dark ink glyphs", async () => {
    const root = await mountApp();
    const bar = root.root.findAllByType(StatusBar as unknown as React.ComponentType<{ style?: string }>);
    expect(bar).toHaveLength(1);
    expect(bar[0].props.style).toBe("dark");
  });

  it("the night sky gets light lamplight glyphs", async () => {
    __setColorScheme("dark");
    const root = await mountApp();
    const bar = root.root.findAllByType(StatusBar as unknown as React.ComponentType<{ style?: string }>);
    expect(bar).toHaveLength(1);
    expect(bar[0].props.style).toBe("light");
  });
});
