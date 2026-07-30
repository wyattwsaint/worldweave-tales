import React from "react";
import TestRenderer, { act, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __requestedFonts,
  __resetFonts,
  __setFontError,
  __setFontsLoaded,
} from "../test/expo-font.mock";
import { __resetSplash, __splashCalls } from "../test/expo-splash-screen.mock";
import { __setColorScheme } from "../test/react-native.mock";
import App from "../App";
import LibraryScreen from "./screens/LibraryScreen";
import { FakeProxyClient } from "./api/fakeProxyClient";
import { palettes, typography } from "./theme/tokens";
import { setBlobFs, store } from "./storage/store";
import type { BlobFs } from "./storage/blobStore";

/**
 * Font gate (#5 follow-up). The brand faces load asynchronously, so there is a
 * window where the app CAN paint but would paint in the system font — the one
 * frame that makes a storybook look like a default RN app. The gate closes it:
 *
 * - the native splash is held past the first frame (`preventAutoHideAsync`) and
 *   dropped only once the app can paint in its own faces;
 * - behind the splash the shell still carries the themed ground, so the handoff
 *   is parchment-to-parchment (or night-to-night), never a white flash;
 * - a font load that FAILS must not trap the child in a splash forever — the
 *   app comes up in the fallback face instead.
 */

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

// Trees are unmounted between tests: this file drives a MODULE-level store (the
// font mock's subscribers), so a left-over tree from an earlier test would also
// wake up on `__setFontsLoaded` and hide the splash a second time.
const mounted: ReactTestRenderer[] = [];

async function mountApp(): Promise<ReactTestRenderer> {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = TestRenderer.create(<App client={new FakeProxyClient()} />);
  });
  mounted.push(root);
  return root;
}

async function unmountAll(): Promise<void> {
  await act(async () => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
}

const bag = store as unknown as { worlds: Map<string, unknown>; arcs: Map<string, unknown> };

beforeEach(() => {
  bag.worlds.clear();
  bag.arcs.clear();
  setBlobFs(fakeFs);
  __setColorScheme("light");
  __resetFonts();
  // This file is the one that cares about the boot window, so it opts INTO the
  // still-loading state the rest of the suite skips past.
  __setFontsLoaded(false);
  __resetSplash();
});
afterEach(async () => {
  await unmountAll();
  setBlobFs(undefined);
  __setColorScheme("light");
  __resetFonts();
  __resetSplash();
});

describe("font gate", () => {
  it("asks expo-font for exactly the token scale's families", async () => {
    await mountApp();
    // Against the TOKENS, not against `appFonts` — comparing the request to the
    // map it was built from would pass even if the app loaded nothing the
    // screens actually render in.
    const wanted = [
      ...new Set(
        Object.values(typography)
          .map((t) => (t as { fontFamily?: string }).fontFamily)
          .filter((f): f is string => typeof f === "string"),
      ),
    ].sort();
    expect(Object.keys(__requestedFonts() ?? {}).sort()).toEqual(wanted);
  });

  it("holds the splash and paints no screen until the faces are in", async () => {
    const root = await mountApp();
    expect(root.root.findAllByType(LibraryScreen)).toHaveLength(0);
    expect(__splashCalls().prevented).toBeGreaterThanOrEqual(1);
    expect(__splashCalls().hidden).toBe(0);
  });

  it("keeps the themed ground behind the held splash", async () => {
    const root = await mountApp();
    const grounds = root.root
      .findAll((n) => (n.type as unknown) === "rn-view")
      .flatMap((n) => (n.props.style as { backgroundColor?: string }[] | undefined) ?? [])
      .map((s) => s?.backgroundColor);
    expect(grounds).toContain(palettes.day.bg);
  });

  it("drops the splash and paints the shelf once the faces are in", async () => {
    const root = await mountApp();
    await act(async () => {
      __setFontsLoaded(true);
    });
    expect(root.root.findAllByType(LibraryScreen)).toHaveLength(1);
    expect(__splashCalls().hidden).toBe(1);
  });

  it("comes up anyway when the faces fail to load (never traps)", async () => {
    const root = await mountApp();
    await act(async () => {
      __setFontError(new Error("no network"));
    });
    expect(root.root.findAllByType(LibraryScreen)).toHaveLength(1);
    expect(__splashCalls().hidden).toBe(1);
  });
});
