import { StatusBar } from "expo-status-bar";
import { NavProvider, useNav } from "./src/nav/NavContext";
import WizardScreen from "./src/screens/WizardScreen";
import CardPickScreen from "./src/screens/CardPickScreen";
import ViewerScreen from "./src/screens/ViewerScreen";
import type { ProxyClientLike } from "./src/api/proxyClient";

/**
 * App root. Wraps the hand-rolled navigator and renders the current screen.
 * Starts on the wizard; the happy path is Wizard -> Card-Pick -> Viewer.
 *
 * `client` is an optional proxy-client seam: production leaves it undefined so
 * the wizard uses the real ProxyClient; tests inject a network-free fake.
 */
export default function App({ client }: { client?: ProxyClientLike } = {}) {
  return (
    <NavProvider>
      <CurrentScreen client={client} />
      <StatusBar style="auto" />
    </NavProvider>
  );
}

function CurrentScreen({ client }: { client?: ProxyClientLike }) {
  const { state } = useNav();
  switch (state.screen) {
    case "wizard":
      return <WizardScreen client={client} />;
    case "cardpick":
      return <CardPickScreen params={state.params} />;
    case "viewer":
      return <ViewerScreen params={state.params} />;
  }
}
