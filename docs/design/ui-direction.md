# UI Direction — Issue #5 (Phase 4a)

Locked 2026-07-19 via grill session (alignment gate) on `feat/ui-overhaul-5`.
Canonical reference for the #5 rebuild and for #6 (icon/splash) and #9 (loading
animation), which inherit the motif and palette. Visual specifics (final hexes,
motif drawing) are **pending prototype confirmation** — direction below is locked,
execution values may be tuned by the prototype session.

## Decisions

### 1. Motif — "Storytime"

Father-and-his-children, two scales of one drawing family:

- **Full motif:** father seated with a child leaning against him, open storybook,
  warm light source. Carries splash, empty states, and the #9 loading animation
  (father opens the book → sketch-lines and stars drift up from the pages).
- **Reduced mark:** a large hand clasping a small hand, plus a star. Carries the
  app icon / adaptive icon (#6), where a full scene fails at small sizes.

Double reading is intentional: the parent reading on the bed *is* the picture of
the Father and His children. Pencil-sketch rendering matches the locked entity-art
style (SPEC.md).

### 2. Palette

- **Day ("storybook"):** warm parchment/cream ground (paper, not white),
  sepia-charcoal ink text (warm near-black, never `#000`), single **lamplight
  amber/gold** accent, one soft warm-gray supporting neutral. Low chroma — the UI
  must not compete with the art.
- **Night ("read-aloud"):** deep indigo/navy ground (night sky, not gray-dark),
  cream text dimmed for reading comfort, the **same amber** accent reading as
  lamp-glow. The brand color is the light itself; it does not change across modes.
- No third brand color. Christian identity comes from motif and content.
- Final hexes locked in the prototype session; every text/ground pair must pass
  WCAG AA (enforced by tokens contract tests, see §8).

### 3. Typography

**Alegreya superfamily only** (via `@expo-google-fonts` + `expo-font`):

- Body / read-aloud: Alegreya Regular + Medium.
- Display (arc titles, headers): Alegreya Black / ExtraBold.
- Chrome (buttons, tier labels, captions): Alegreya SC (small caps).
- No second family. (Fraunces/Literata explicitly rejected — overused in
  AI-generated design; Alegreya chosen for literary pedigree + calligraphic
  rhythm matching hand-sketched art. Alternates considered: Gentium Book Plus +
  IM Fell English; Vollkorn.)

### 4. Night mode mechanism

App-wide, driven by the system scheme (`useColorScheme()`). Both palettes are
first-class in `app/src/theme/tokens.ts` from day one; a `ThemeContext` resolves
day/night and components never hardcode either palette. No manual toggle in MVP
(cheap later add).

### 5. Component set

`Screen`, `Text`, `Button`, `Card`, `Thumb`, `Skeleton` — in-house, no heavy UI
lib (per #5 AFK subspec). Empty states are compositions (Screen + Text + motif
art), not a component. Motion in 4a uses built-in `Animated` only (fades, beat
transitions, skeleton shimmer, pressed states); the `react-native-reanimated`
decision is deferred to #9, which owns the motif animation.

### 6. Build order

`tokens.ts` → **Viewer (proof screen)** → CardPick → Library → Wizard →
nav-shell / loading / error / empty-state sweep. Wizard is last so the component
set is proven by three screens before the highest-state-count screen consumes it.

### 7. Wizard failure escape

Escape-to-Shelf **on the error state only** (resolves the standing open thread):
warm, parent-facing error copy (no dev-speak, no harsh red), a **Try again**
button (answers preserved in state), and a quiet **‹ Back to the Shelf** link
using the nav's existing `goHome`. The normal wizard flow remains no-back, as
previously locked.

### 8. Test strategy

Existing stack (vitest + react-test-renderer), no new test deps:

1. **Tokens contract tests** (red-first, pure TS): both palettes expose an
   identical token key set; WCAG AA contrast computed programmatically for every
   text/ground pair in both modes.
2. **Component behavior tests:** each component renders under both themes via
   ThemeContext; correct `accessibilityRole`/labels; disabled/pressed states;
   minimum touch-target size.
3. **One-token-system tripwire:** a static test scanning `app/src/screens/**`
   that fails on raw hex literals or `fontFamily` strings outside `theme/`.
4. Existing suite (77 tests) stays green throughout.

**Named TDD carve-out:** visual quality ("does it look expensive") is verified by
the design prototype and on-device review, not unit tests.

## Execution details (non-decisions, ride along with the build)

- Dynamic type on (`allowFontScaling`) with bounded `maxFontSizeMultiplier`.
- Tablet: portrait-first, max content width on large screens.
- Touch targets ≥ 44pt; screen-reader labels on every interactive element.
- Apply `frontend-design` + `the-10k-checklist` skills during token/screen work.
