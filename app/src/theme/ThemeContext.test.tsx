import React from "react";
import TestRenderer, { act, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it } from "vitest";
// The vitest alias points "react-native" at this same module, so the scheme
// setter below drives the exact useColorScheme() the code under test calls.
// (Imported by path: the real react-native has no such test hook to type.)
import { __setColorScheme } from "../../test/react-native.mock";
import { ThemeProvider, useTheme, type Theme } from "./ThemeContext";
import { palettes, typography } from "./tokens";

/**
 * Theme plumbing (ui-direction.md §4): app-wide day/night resolved from the
 * SYSTEM scheme (`useColorScheme()`), both palettes first-class from tokens.ts,
 * components never hardcode either. `mode` on the provider is the test/override
 * seam; outside a provider the hook still resolves from the system scheme so a
 * screen can never render un-themed.
 */

let seen: Theme | undefined;
function Probe() {
  seen = useTheme();
  return null;
}

async function mount(node: React.ReactElement): Promise<ReactTestRenderer> {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = TestRenderer.create(node);
  });
  return root;
}

afterEach(() => {
  seen = undefined;
  __setColorScheme("light");
});

describe("ThemeContext", () => {
  it("resolves day from a light system scheme", async () => {
    __setColorScheme("light");
    await mount(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(seen?.mode).toBe("day");
    expect(seen?.colors).toBe(palettes.day);
  });

  it("resolves night from a dark system scheme", async () => {
    __setColorScheme("dark");
    await mount(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(seen?.mode).toBe("night");
    expect(seen?.colors).toBe(palettes.night);
  });

  it("an explicit mode prop overrides the system scheme (the test seam)", async () => {
    __setColorScheme("light");
    await mount(
      <ThemeProvider mode="night">
        <Probe />
      </ThemeProvider>,
    );
    expect(seen?.mode).toBe("night");
    expect(seen?.colors).toBe(palettes.night);
  });

  it("useTheme outside a provider still resolves from the system scheme", async () => {
    __setColorScheme("dark");
    await mount(<Probe />);
    expect(seen?.mode).toBe("night");
    expect(seen?.colors).toBe(palettes.night);
  });

  it("re-themes a MOUNTED tree when the system scheme flips", async () => {
    // The real hook subscribes to Appearance: a parent flipping the phone to
    // dark mode mid-story must repaint the open screen, not just the next one.
    __setColorScheme("light");
    await mount(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(seen?.mode).toBe("day");

    await act(async () => {
      __setColorScheme("dark");
    });
    expect(seen?.mode).toBe("night");
    expect(seen?.colors).toBe(palettes.night);
  });

  it("an explicit mode prop keeps a mounted tree pinned across a scheme flip", async () => {
    __setColorScheme("light");
    await mount(
      <ThemeProvider mode="day">
        <Probe />
      </ThemeProvider>,
    );
    await act(async () => {
      __setColorScheme("dark");
    });
    expect(seen?.mode).toBe("day");
  });

  it("exposes the token typography scale", async () => {
    await mount(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(seen?.type).toBe(typography);
  });
});
