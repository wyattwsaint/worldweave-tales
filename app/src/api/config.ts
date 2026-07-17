/**
 * Base URL for the proxy the app talks to. Overridable at build time via the
 * Expo public env convention; defaults to the proxy's local dev port (8787).
 */
export const PROXY_URL = process.env.EXPO_PUBLIC_PROXY_URL ?? "http://localhost:8787";
