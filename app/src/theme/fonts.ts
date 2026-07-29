import { useFonts } from "expo-font";
import {
  Alegreya_400Regular,
  Alegreya_500Medium,
  Alegreya_800ExtraBold,
} from "@expo-google-fonts/alegreya";
import { AlegreyaSC_500Medium, AlegreyaSC_700Bold } from "@expo-google-fonts/alegreya-sc";
import { AlegreyaSans_500Medium } from "@expo-google-fonts/alegreya-sans";

/**
 * The brand faces (#5 / ui-direction.md §3) — Alegreya superfamily, nothing
 * else. The keys ARE the `fontFamily` strings in `tokens.ts`: a token names a
 * family, this map loads a file under that exact name, and
 * `fonts.contract.test.ts` keeps the two in lockstep in both directions.
 *
 * Only the weights the scale uses are loaded; adding one here without a token
 * that cites it fails the contract rather than quietly growing the bundle.
 */
export const appFonts = {
  Alegreya_400Regular,
  Alegreya_500Medium,
  Alegreya_800ExtraBold,
  AlegreyaSC_500Medium,
  AlegreyaSC_700Bold,
  AlegreyaSans_500Medium,
};

/**
 * True once the app can paint in its own faces — or once it is certain it never
 * will. A font-load FAILURE resolves to `true` on purpose: a child waiting for
 * a story must not be held behind a splash screen by a missing typeface. The
 * cost of the fallback is a plainer page; the cost of trapping is the app.
 */
export function useAppFonts(): boolean {
  const [loaded, error] = useFonts(appFonts);
  return loaded || error != null;
}
