import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Vitest config for the app workspace.
 *
 * - Aliases `react-native` and `expo-status-bar` to tiny headless mocks so the
 *   REAL screen components + hand-rolled navigator can be mounted under
 *   react-test-renderer in a plain node environment (no jsdom, no Metro).
 * - Keeps `environment: node` so the existing pure-logic flow tests are
 *   unaffected.
 */
const r = (p: string) => fileURLToPath(new URL(p, import.meta.url).href);

export default defineConfig({
  // App.tsx (and other screens) rely on the automatic JSX runtime — no explicit
  // `import React`. Match that so esbuild doesn't emit classic React.createElement.
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "react-native": r("./test/react-native.mock.tsx"),
      "expo-status-bar": r("./test/expo-status-bar.mock.tsx"),
      "expo-constants": r("./test/expo-constants.mock.ts"),
      "expo-font": r("./test/expo-font.mock.ts"),
      "expo-splash-screen": r("./test/expo-splash-screen.mock.ts"),
      // All three font packages share one stub — each import picks the names it
      // needs, and fonts.contract.test.ts checks those names against the real
      // installed packages so the stub cannot drift.
      "@expo-google-fonts/alegreya": r("./test/expo-google-fonts.mock.ts"),
      "@expo-google-fonts/alegreya-sc": r("./test/expo-google-fonts.mock.ts"),
      "@expo-google-fonts/alegreya-sans": r("./test/expo-google-fonts.mock.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
