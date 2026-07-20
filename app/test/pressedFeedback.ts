import { expect } from "vitest";
import type { ReactTestInstance } from "react-test-renderer";
import { PRESSED_OPACITY } from "../src/theme/pressed";

/**
 * THE shared §5 pressed-treatment assertion (ui-direction.md — "pressed
 * states"), used by all four screen design suites. One copy on purpose: the
 * treatment is one consistent dim across every control, so the assertion that
 * enforces it must not be able to drift per-screen.
 */

/** Flattened RN style (style-functions resolved at rest, arrays merged left-to-right, falsy dropped). */
export function flat(style: unknown): Record<string, unknown> {
  if (!style) return {};
  if (typeof style === "function") return flat(style({ pressed: false }));
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flat));
  return style as Record<string, unknown>;
}

/**
 * Asserts the §5 pressed treatment on a control:
 *
 * - the style is a Pressable style-FUNCTION (feedback exists at all);
 * - under the finger it dims to exactly {@link PRESSED_OPACITY}, and at rest
 *   it does not;
 * - the dim WRAPS the resting look, never replaces it: every resting style key
 *   (backgroundColor, borders, padding — the control's real appearance) must
 *   survive unchanged alongside the dim, and there must be a resting look to
 *   retain (an empty resting style would make retention vacuous).
 *
 * (That PRESSED_OPACITY itself really dims — 0 < value < 1 — is pinned by
 * `src/theme/pressed.contract.test.ts`.)
 */
export function expectPressedFeedback(node: ReactTestInstance | undefined) {
  expect(node).toBeTruthy();
  const style = node!.props.style;
  expect(typeof style).toBe("function");
  const { opacity: restingOpacity, ...restingLook } = flat(style({ pressed: false }));
  const { opacity: pressedOpacity, ...pressedLook } = flat(style({ pressed: true }));
  expect(pressedOpacity).toBe(PRESSED_OPACITY);
  expect(restingOpacity).not.toBe(PRESSED_OPACITY);
  expect(Object.keys(restingLook).length).toBeGreaterThan(0);
  expect(pressedLook).toEqual(restingLook);
}
