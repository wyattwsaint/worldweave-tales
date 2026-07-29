import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { StyleSheet, View } from "react-native";
import { ThemeProvider, useTheme } from "./src/theme/ThemeContext";
import { useAppFonts } from "./src/theme/fonts";
import { NavProvider, useNav } from "./src/nav/NavContext";
import LibraryScreen from "./src/screens/LibraryScreen";
import WizardScreen from "./src/screens/WizardScreen";
import CardPickScreen from "./src/screens/CardPickScreen";
import ViewerScreen from "./src/screens/ViewerScreen";
import type { ProxyClientLike } from "./src/api/proxyClient";

// Hold the native splash past the first frame: the brand faces load async, and
// the one thing worse than a slightly longer splash is a frame of the story in
// the system font. Released in Shell once the faces are in (or have failed).
// Rejection is ignored on purpose — it only means the splash is already gone.
void SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * App root. Wraps the hand-rolled navigator and renders the current screen.
 * Starts on the Library shelf (the home surface, #8); ＋ New Story runs
 * Wizard -> Card-Pick -> Viewer, and the Viewer's ‹ Shelf returns home.
 *
 * `client` is an optional proxy-client seam: production leaves it undefined so
 * the wizard uses the real ProxyClient; tests inject a network-free fake.
 */
export default function App({ client }: { client?: ProxyClientLike } = {}) {
  return (
    // Theme resolves day/night from the system scheme (ui-direction.md §4).
    <ThemeProvider>
      <NavProvider>
        <Shell client={client} />
      </NavProvider>
    </ThemeProvider>
  );
}

/**
 * Themed nav shell (§6 final sweep): the container behind whichever screen the
 * navigator shows carries the theme's ground, so a screen swap never flashes
 * an unthemed frame; and the status bar follows the THEME — dark ink glyphs
 * over day parchment, light lamplight glyphs over the night sky — rather than
 * being left to the raw system default.
 */
function Shell({ client }: { client?: ProxyClientLike }) {
  const { mode, colors } = useTheme();
  const fontsReady = useAppFonts();

  // Hand the splash off only when the app can paint in its own faces — see
  // the module-scope hold above. The themed ground below is already mounted
  // behind the splash, so the handoff is parchment-to-parchment.
  useEffect(() => {
    // Rejection ignored for the same reason as the hold: it only means the
    // splash is already gone.
    if (fontsReady) void SplashScreen.hideAsync().catch(() => {});
  }, [fontsReady]);

  return (
    <View style={[styles.shell, { backgroundColor: colors.bg }]}>
      {fontsReady ? <CurrentScreen client={client} /> : null}
      <StatusBar style={mode === "night" ? "light" : "dark"} />
    </View>
  );
}

function CurrentScreen({ client }: { client?: ProxyClientLike }) {
  const { state } = useNav();
  switch (state.screen) {
    case "library":
      return <LibraryScreen />;
    case "wizard":
      return <WizardScreen client={client} />;
    case "cardpick":
      return <CardPickScreen params={state.params} />;
    case "viewer":
      return <ViewerScreen params={state.params} />;
  }
}

const styles = StyleSheet.create({
  shell: { flex: 1 },
});
