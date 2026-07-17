import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * PROXY_URL is a module-level const evaluated at import time, so each case must
 * re-mock expo-constants, reset the module registry, and dynamically re-import.
 */
const ORIGINAL_ENV = process.env.EXPO_PUBLIC_PROXY_URL;

function mockConstants(proxyBaseUrl: string | undefined) {
  vi.doMock("expo-constants", () => ({
    default: {
      expoConfig: { extra: proxyBaseUrl === undefined ? {} : { proxyBaseUrl } },
    },
  }));
}

async function loadProxyUrl(): Promise<string> {
  const mod = await import("./config.js");
  return mod.PROXY_URL;
}

describe("PROXY_URL precedence", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.EXPO_PUBLIC_PROXY_URL;
  });

  afterEach(() => {
    vi.doUnmock("expo-constants");
    if (ORIGINAL_ENV === undefined) delete process.env.EXPO_PUBLIC_PROXY_URL;
    else process.env.EXPO_PUBLIC_PROXY_URL = ORIGINAL_ENV;
  });

  it("uses EXPO_PUBLIC_PROXY_URL when set, over app.json", async () => {
    process.env.EXPO_PUBLIC_PROXY_URL = "https://env.example";
    mockConstants("https://appjson.example");
    expect(await loadProxyUrl()).toBe("https://env.example");
  });

  it("uses app.json extra.proxyBaseUrl when env is unset", async () => {
    mockConstants("https://appjson.example");
    expect(await loadProxyUrl()).toBe("https://appjson.example");
  });

  it("falls back to localhost default when both are absent", async () => {
    mockConstants(undefined);
    expect(await loadProxyUrl()).toBe("http://localhost:8787");
  });
});
