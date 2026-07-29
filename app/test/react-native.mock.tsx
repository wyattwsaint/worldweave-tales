import React from "react";

/**
 * Minimal headless stand-in for `react-native`, used only by the acceptance
 * render harness under vitest (node env, no jsdom, no Metro).
 *
 * Each primitive is a plain host component (a lowercase string tag) so
 * react-test-renderer materializes it as a host instance whose props
 * (onPress / onChangeText / value / style / …) are directly inspectable and
 * callable from tests. StyleSheet.create is the identity. FlatList is a tiny
 * pass-through that maps `data` through `renderItem`.
 */

export const View = "rn-view" as unknown as React.ComponentType<any>;
export const Text = "rn-text" as unknown as React.ComponentType<any>;
export const Pressable = "rn-pressable" as unknown as React.ComponentType<any>;
export const ScrollView = "rn-scrollview" as unknown as React.ComponentType<any>;
export const TextInput = "rn-textinput" as unknown as React.ComponentType<any>;
export const Image = "rn-image" as unknown as React.ComponentType<any>;

export function FlatList<T>({
  data,
  renderItem,
  keyExtractor,
  ...rest
}: {
  data: readonly T[];
  renderItem: (info: { item: T; index: number }) => React.ReactNode;
  keyExtractor?: (item: T, index: number) => string;
  [k: string]: unknown;
}) {
  return React.createElement(
    "rn-flatlist",
    rest,
    (data ?? []).map((item, index) =>
      React.createElement(
        React.Fragment,
        { key: keyExtractor ? keyExtractor(item, index) : index },
        renderItem({ item, index }),
      ),
    ),
  );
}

export const StyleSheet = {
  create: <T,>(styles: T): T => styles,
  flatten: (style: unknown) => style,
  hairlineWidth: 1,
  absoluteFill: {},
};

export const Platform = { OS: "ios", select: (o: Record<string, unknown>) => o.ios ?? o.default };

// ---- useColorScheme -------------------------------------------------------
// The theme plumbing resolves day/night from the system scheme. Tests drive it
// through `__setColorScheme` (imported by path from this mock — the alias makes
// it the very module the code under test sees). Like the real hook this one
// SUBSCRIBES: setting the scheme after mount re-renders the mounted tree, so a
// mid-story flip to dark mode is testable (wrap the set in `act`).

let colorScheme: "light" | "dark" | null = "light";
const schemeListeners = new Set<() => void>();

const subscribeToScheme = (onChange: () => void) => {
  schemeListeners.add(onChange);
  return () => {
    schemeListeners.delete(onChange);
  };
};

export function useColorScheme(): "light" | "dark" | null {
  return React.useSyncExternalStore(
    subscribeToScheme,
    () => colorScheme,
    () => colorScheme,
  );
}

/** Test hook (not part of react-native): set what useColorScheme reports. */
export function __setColorScheme(scheme: "light" | "dark" | null): void {
  if (scheme === colorScheme) return;
  colorScheme = scheme;
  schemeListeners.forEach((listener) => listener());
}

// ---- BackHandler ----------------------------------------------------------
// Just enough of the Android hardware-Back contract: `addEventListener`
// registers a handler and returns a `{ remove }` subscription. Tests fire the
// event through `__fireBackPress`, which (like the real BackHandler) asks the
// most recently added handler first and stops at the first one returning true.

type BackPressHandler = () => boolean | null | undefined;
const backPressHandlers: BackPressHandler[] = [];

export const BackHandler = {
  addEventListener: (_event: "hardwareBackPress", handler: BackPressHandler) => {
    backPressHandlers.push(handler);
    return {
      remove: () => {
        const i = backPressHandlers.indexOf(handler);
        if (i >= 0) backPressHandlers.splice(i, 1);
      },
    };
  },
};

/** Test hook (not part of react-native): fire hardware Back; true if consumed. */
export function __fireBackPress(): boolean {
  for (let i = backPressHandlers.length - 1; i >= 0; i--) {
    if (backPressHandlers[i]()) return true;
  }
  return false;
}

/**
 * Test hook (not part of react-native): drop every registered handler. Call
 * between tests — mounted trees are rarely unmounted under the render harness,
 * so effect cleanups that would remove subscriptions may never run.
 */
export function __resetBackPressHandlers(): void {
  backPressHandlers.length = 0;
}

// ---- Animated -------------------------------------------------------------
// Just enough of the built-in Animated API for fade/scale-in entrances:
// timing() completes synchronously so tests see the settled state, and
// Animated.View is a host tag ("rn-animated-view") tests can find. Style props
// keep the Animated.Value / interpolation objects, so a test can also assert
// that a style is animated rather than static.

class AnimatedValue {
  _value: number;
  constructor(value: number) {
    this._value = value;
  }
  setValue(value: number): void {
    this._value = value;
  }
  interpolate(config: unknown): { __interpolation: unknown; parent: AnimatedValue } {
    return { __interpolation: config, parent: this };
  }
  stopAnimation(callback?: (value: number) => void): void {
    callback?.(this._value);
  }
}

export const Animated = {
  Value: AnimatedValue,
  View: "rn-animated-view" as unknown as React.ComponentType<any>,
  timing: (value: AnimatedValue, config: { toValue: number }) => ({
    start: (callback?: (result: { finished: boolean }) => void) => {
      value.setValue(config.toValue);
      callback?.({ finished: true });
    },
  }),
  parallel: (animations: Array<{ start: (cb?: (r: { finished: boolean }) => void) => void }>) => ({
    start: (callback?: (result: { finished: boolean }) => void) => {
      animations.forEach((a) => a.start());
      callback?.({ finished: true });
    },
  }),
};

export default {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  Image,
  FlatList,
  StyleSheet,
  Platform,
  useColorScheme,
  Animated,
  BackHandler,
};
