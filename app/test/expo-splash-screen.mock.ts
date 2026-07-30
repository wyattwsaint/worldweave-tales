/**
 * Headless stand-in for `expo-splash-screen`. Records the two calls the app
 * makes — hold the splash at boot, hide it once the app can actually paint —
 * so tests can assert the native splash is never dropped onto a fontless frame.
 */

let prevented = 0;
let hidden = 0;

export async function preventAutoHideAsync(): Promise<boolean> {
  prevented++;
  return true;
}

export async function hideAsync(): Promise<boolean> {
  hidden++;
  return true;
}

/** Test hook: how many times each side of the splash contract was called. */
export function __splashCalls(): { prevented: number; hidden: number } {
  return { prevented, hidden };
}

/**
 * Test hook: reset the hide counter between tests. `prevented` is deliberately
 * NOT reset — the app holds the splash once at module scope, which happens on
 * import, long before any test body runs.
 */
export function __resetSplash(): void {
  hidden = 0;
}

export default { preventAutoHideAsync, hideAsync };
