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

export default { View, Text, Pressable, ScrollView, TextInput, Image, FlatList, StyleSheet, Platform };
