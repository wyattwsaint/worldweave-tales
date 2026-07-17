import { defineConfig } from "vitest/config";

/**
 * Vitest config for the domain workspace. Pure data + pure functions only,
 * so a plain node environment with no aliases is all that's needed.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
