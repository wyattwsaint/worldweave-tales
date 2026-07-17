import Constants from "expo-constants";

/**
 * Base URL for the proxy the app talks to.
 *
 * Precedence (highest wins):
 *   1. `EXPO_PUBLIC_PROXY_URL` — explicit build/runtime env override.
 *   2. `app.json` `extra.proxyBaseUrl` — read at runtime via expo-constants.
 *   3. hardcoded local dev fallback (proxy's default port 8787).
 *
 * `Constants.expoConfig` can be null/undefined in some contexts, so guard and
 * fall through to the default rather than throwing.
 */
const DEFAULT_PROXY_URL = "http://localhost:8787";

const appJsonProxyUrl = Constants.expoConfig?.extra?.proxyBaseUrl as
  | string
  | undefined;

export const PROXY_URL =
  process.env.EXPO_PUBLIC_PROXY_URL ?? appJsonProxyUrl ?? DEFAULT_PROXY_URL;
