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
// it the very module the code under test sees). Set BEFORE mounting: like the
// real hook the value is read at render, but this stub does not re-render
// already-mounted trees.

let colorScheme: "light" | "dark" | null = "light";

export function useColorScheme(): "light" | "dark" | null {
  return colorScheme;
}

/** Test hook (not part of react-native): set what useColorScheme reports. */
export function __setColorScheme(scheme: "light" | "dark" | null): void {
  colorScheme = scheme;
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
};
