import { registerRootComponent } from "expo";
import App from "./App";

// Wrap so App's optional injectable `client` prop stays off the root-component
// signature registerRootComponent expects. Production uses the default (real
// ProxyClient); tests render <App client={fake} /> directly.
registerRootComponent(() => App());
