/**
 * Headless mock for `expo-constants` so the app tree can be imported under
 * vitest (plain node) without pulling in the native `expo-modules-core`.
 *
 * Mirrors the shape `config.ts` reads (`Constants.expoConfig?.extra?.…`) but
 * supplies no `proxyBaseUrl`, so PROXY_URL falls through to its default here.
 * The dedicated `config.test.ts` overrides this via `vi.doMock` per case.
 */
export default {
  expoConfig: { extra: {} },
};
