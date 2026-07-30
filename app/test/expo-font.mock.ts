import React from "react";

/**
 * Headless stand-in for `expo-font`. The real `useFonts` kicks off an async
 * load and re-renders when it settles; this one is driven by the test through
 * `__setFontsLoaded` / `__setFontError` and, like the real hook, SUBSCRIBES —
 * so a load settling after mount repaints the mounted tree (wrap the set in
 * `act`). `__requestedFonts` records the map the app asked for.
 */

type State = { loaded: boolean; error: Error | null };

/**
 * Default: the faces are already in. Every other test in the suite is about
 * some screen, not about boot, and would otherwise sit behind the font gate
 * forever. Tests that care about the gate call `__setFontsLoaded(false)` first.
 */
const SETTLED: State = { loaded: true, error: null };

let state: State = SETTLED;
const listeners = new Set<() => void>();
let requested: Record<string, unknown> | undefined;

const subscribe = (onChange: () => void) => {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
};

function set(next: State): void {
  state = next;
  listeners.forEach((l) => l());
}

export function useFonts(map: Record<string, unknown>): [boolean, Error | null] {
  requested = map;
  const s = React.useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
  return [s.loaded, s.error];
}

/** Test hook: report the fonts as loaded (or back to still-loading). */
export function __setFontsLoaded(loaded: boolean): void {
  set({ loaded, error: null });
}

/** Test hook: report a font-load failure. */
export function __setFontError(error: Error): void {
  set({ loaded: false, error });
}

/** Test hook: the font map the app last passed to `useFonts`. */
export function __requestedFonts(): Record<string, unknown> | undefined {
  return requested;
}

/** Test hook: back to the default settled state (call between tests). */
export function __resetFonts(): void {
  requested = undefined;
  set(SETTLED);
}

export default { useFonts };
