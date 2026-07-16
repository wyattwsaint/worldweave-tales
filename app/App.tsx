import { StatusBar } from "expo-status-bar";
import { NavProvider, useNav } from "./src/nav/NavContext";
import WizardScreen from "./src/screens/WizardScreen";
import CardPickScreen from "./src/screens/CardPickScreen";
import ViewerScreen from "./src/screens/ViewerScreen";

/**
 * App root. Wraps the hand-rolled navigator and renders the current screen.
 * Starts on the wizard; the happy path is Wizard -> Card-Pick -> Viewer.
 */
export default function App() {
  return (
    <NavProvider>
      <CurrentScreen />
      <StatusBar style="auto" />
    </NavProvider>
  );
}

function CurrentScreen() {
  const { state } = useNav();
  switch (state.screen) {
    case "wizard":
      return <WizardScreen />;
    case "cardpick":
      return <CardPickScreen params={state.params} />;
    case "viewer":
      return <ViewerScreen params={state.params} />;
  }
}
