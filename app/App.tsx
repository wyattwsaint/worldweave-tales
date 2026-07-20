import { StatusBar } from "expo-status-bar";
import { ThemeProvider } from "./src/theme/ThemeContext";
import { NavProvider, useNav } from "./src/nav/NavContext";
import LibraryScreen from "./src/screens/LibraryScreen";
import WizardScreen from "./src/screens/WizardScreen";
import CardPickScreen from "./src/screens/CardPickScreen";
import ViewerScreen from "./src/screens/ViewerScreen";
import type { ProxyClientLike } from "./src/api/proxyClient";

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
    // Theme resolves day/night from the system scheme (ui-direction.md §4);
    // "auto" keeps the status bar text legible against either palette.
    <ThemeProvider>
      <NavProvider>
        <CurrentScreen client={client} />
        <StatusBar style="auto" />
      </NavProvider>
    </ThemeProvider>
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
