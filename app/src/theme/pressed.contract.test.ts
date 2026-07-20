import { describe, expect, it } from "vitest";
import { PRESSED_OPACITY } from "./pressed";

/**
 * Pressed-treatment contract (ui-direction.md §5): the screen design suites
 * assert every control dims to PRESSED_OPACITY under the finger — but that is
 * only feedback if the constant itself actually dims. Pin the range here so a
 * drift to 1 (feedback invisible) or 0 (control vanishes) goes red even though
 * every per-screen assertion would still match the constant.
 */
describe("PRESSED_OPACITY contract (the dim is real)", () => {
  it("is strictly between 0 (vanish) and 1 (no visible feedback)", () => {
    expect(PRESSED_OPACITY).toBeGreaterThan(0);
    expect(PRESSED_OPACITY).toBeLessThan(1);
  });
});
