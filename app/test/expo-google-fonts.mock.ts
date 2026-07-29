/**
 * Headless stand-in for the three `@expo-google-fonts/*` packages (all aliased
 * here). The real packages export a bundler asset handle per weight; under
 * vitest there is no Metro to resolve `.ttf`, so each is a sentinel string.
 *
 * Only the weights the token scale actually uses are exported — an import of
 * anything else fails loudly rather than silently resolving to `undefined`.
 * `app/src/theme/fonts.contract.test.ts` checks these names against the real
 * installed packages, so the stub can never drift into fiction.
 */

export const Alegreya_400Regular = "asset:Alegreya_400Regular";
export const Alegreya_500Medium = "asset:Alegreya_500Medium";
export const Alegreya_800ExtraBold = "asset:Alegreya_800ExtraBold";
export const AlegreyaSC_500Medium = "asset:AlegreyaSC_500Medium";
export const AlegreyaSC_700Bold = "asset:AlegreyaSC_700Bold";
export const AlegreyaSans_500Medium = "asset:AlegreyaSans_500Medium";
