import React, { createContext, useContext, useMemo } from "react";
import { useColorScheme } from "react-native";
import { palettes, typography, type Palette, type ThemeMode } from "./tokens";

/**
 * Theme plumbing (ui-direction.md §4): app-wide day/night driven by the SYSTEM
 * color scheme — no manual toggle in MVP. Both palettes come first-class from
 * tokens.ts; screens read colors/type ONLY through {@link useTheme} and never
 * hardcode either palette (enforced by the one-token-system tripwire test).
 *
 * `mode` on the provider is an explicit override — the seam tests use to pin a
 * palette. Outside a provider the hook still resolves from the system scheme,
 * so a screen can never render un-themed.
 */

export interface Theme {
  mode: ThemeMode;
  colors: Palette;
  type: typeof typography;
}

const ThemeContext = createContext<Theme | null>(null);

function themeFor(mode: ThemeMode): Theme {
  return { mode, colors: palettes[mode], type: typography };
}

export function ThemeProvider({
  mode,
  children,
}: {
  /** Explicit day/night override (tests, previews). Omit to follow the system. */
  mode?: ThemeMode;
  children: React.ReactNode;
}) {
  const scheme = useColorScheme();
  const resolved: ThemeMode = mode ?? (scheme === "dark" ? "night" : "day");
  const value = useMemo(() => themeFor(resolved), [resolved]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  // Unconditional (rules of hooks); the system scheme is the no-provider fallback.
  const scheme = useColorScheme();
  const fallback: ThemeMode = scheme === "dark" ? "night" : "day";
  return useMemo(() => ctx ?? themeFor(fallback), [ctx, fallback]);
}
