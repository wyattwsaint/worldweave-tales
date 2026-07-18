import { registerRootComponent } from "expo";
import App from "./App";
import { initStore } from "./src/storage/store";

// Open persistent (SQLite + blob) storage at boot. Fire-and-forget: the store
// starts in-memory and swaps to the durable impl once ready, well before the
// user reaches the Viewer's persist step. Only the production entry calls this;
// tests render <App client={fake} /> directly and stay in-memory.
void initStore();

// Wrap so App's optional injectable `client` prop stays off the root-component
// signature registerRootComponent expects. Production uses the default (real
// ProxyClient); tests render <App client={fake} /> directly.
registerRootComponent(() => App());
