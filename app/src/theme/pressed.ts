import type { PressableStateCallbackType, StyleProp, ViewStyle } from "react-native";

/**
 * The one pressed-state treatment (ui-direction.md §5 — "pressed states" are
 * in-scope motion, built-in Pressable style-function only, no reanimated):
 * while the finger is down the control dims to {@link PRESSED_OPACITY}, like a
 * page held under a fingertip. Every control (accessibilityRole button/switch)
 * across the four screens wraps its resting styles with {@link pressedStyle} —
 * one consistent treatment, never per-screen variants. Plain tap-anywhere
 * surfaces (the Viewer lightbox scrim) are not controls and stay quiet.
 */
export const PRESSED_OPACITY = 0.6;

/** Wrap a control's resting style(s) into the shared pressed-feedback style-function. */
export function pressedStyle(
  ...resting: StyleProp<ViewStyle>[]
): (state: PressableStateCallbackType) => StyleProp<ViewStyle> {
  return ({ pressed }) => [...resting, pressed && { opacity: PRESSED_OPACITY }];
}
