# UI Direction — Issue #5 (Phase 4a)

Locked 2026-07-19 via grill session (alignment gate) on `feat/ui-overhaul-5`.
Canonical reference for the #5 rebuild and for #6 (icon/splash) and #9 (loading
animation), which inherit the motif and palette. Visual specifics (final hexes,
motif drawing) were **confirmed by the prototype session, user-approved
2026-07-19** — see the appendix for the locked execution values.

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

## Appendix — Prototype-confirmed values (2026-07-19)

Confirmed by the throwaway Viewer proof (user-approved 2026-07-19). The
prototype file is deleted; these verdicts are the record.

### Final hexes (AA-verified, day / night)

Contrast ratios computed against the stated ground:

- `bg` `#F3E8D2` / `#131A31`
- `surface` `#FBF4E4` / `#1B2340`
- `ink` `#3E3325` / `#E7DCC3` — 11.2 / 11.3 vs surface
- `ink2` `#6C5C46` / `#A89D83` — 5.9 / 5.7 vs surface
- `accent` `#A16207` **both modes** — 4.49 / 3.1 vs surface —
  **LARGE TEXT / UI ONLY, never body-size text** (both modes are below the
  4.5:1 body threshold; they pass only the 3:1 large-text/UI bar)
- `accent-ink` `#FFFBEF` — 4.8 vs accent
- `line` `#DACBAB` / `#2E3A5C` — decorative, exempt

### Body prose

Alegreya Regular 19px, 1.6 leading, ~34ch measure at 390pt width. Glyph size
wins over the canonical 45–75ch measure for dim-room read-aloud: 19px stays
legible at arm's length in low light, and the short ~34ch line plus generous
leading keeps the return sweep easy when the parent's eyes leave the page for
the child and come back mid-beat.

### Type scale

- **Display (arc title):** Alegreya ExtraBold 800, 27px, 1.15 line-height.
- **Spine/stage line:** Alegreya SC 500, 13.5px, .06em tracking.
- **Chrome:** Alegreya SC — buttons 700 / 15px / .04em; back link 500 / 15px;
  world name 700 / 14px / .08em. Numerals (beat count): Alegreya Sans 500,
  14px, tabular figures.
- **Entity name:** Alegreya Medium 500, 14.5px (24px in the full-screen art
  caption).
- **Entity role:** Alegreya SC 500, 11.5px, .05em (14px in the art caption).
- **Prose:** Alegreya Regular 400, 19px / 1.6 (see above).
- **Drop cap:** first paragraph only — Alegreya ExtraBold, 3.3em, accent amber
  (large-text exemption). RN deviation: a floated 3.3em is not expressible in
  RN Text; shipped as a 30px/34 accent raised cap (`typography.dropCap`) —
  large-text exemption holds.

### Layout

- **Story card:** radius 14, side margins 16, padding 14 / 20 / 12, 1px `line`
  border, soft ink-tinted shadow.
- **Entity-art tiles:** 2:1 aspect, radius 8, slight counter-rotations
  (−0.7° / +0.5°) for a hand-placed feel.
- **Header vignette:** 141×96.
- **Buttons:** pill (999 radius), min-height 44pt.

### Motif verdict — A

**A wins:** small header bookplate vignette on the Viewer. B (oversized
low-opacity watermark behind content) rejected — the opaque story card leaves
it no canvas, even at 32% amber-tinted opacity. The full scene still carries
splash, empty states, and the #9 loading animation per §1.

**Amended 2026-07-20 (#6) — the real art landed.** Brief and pipeline:
`docs/design/art-brief.md`. Two corrections to the verdict above:

- **Footprint is an A+B split.** The Viewer header takes a 141×96 band crop of
  the scene (locked footprint unchanged); the empty Library takes the full
  768×1024 portrait plate. Both derive from the same drawing.
- **The scene no longer carries the splash.** Android 12+ masks the splash image
  to a ~192dp circle, which a 3:4 plate cannot survive, so the splash is the
  icon medallion over the token ground instead — day and night differ only by
  that ground. The scene keeps the empty states and #9.

### Copy rule — "page"

Reader-facing UI says **"page"**, never "beat": "Page four", "dealt this
page", "Next page", including aria-labels. "Beat" remains internal domain
language only (code, docs, CONTEXT.md).

### Viewer interaction — entity-art lightbox

Entity-art tiles expand to a full-screen in-frame lightbox: tap a tile →
palette-aware art plate plus entity name/role caption; dismiss via tap
anywhere, ✕, or Esc; ~200ms fade/scale-in entrance.

These values are enforced by the §8 tokens contract tests.

## Amendment 2026-07-29 — the #5 follow-ups closed

The three items PR #18 listed as "known follow-ups" have landed; the direction
above is now fully wired rather than partly aspirational.

- **Fonts are real.** `@expo-google-fonts/{alegreya,alegreya-sc,alegreya-sans}`
  + `expo-font`, loaded through `app/src/theme/fonts.ts`. The map's keys ARE the
  `fontFamily` strings in `tokens.ts`, checked both ways (and against the
  installed packages' declarations) by `fonts.contract.test.ts`, so a token can
  never name a face the app does not load. The native splash is held past the
  first frame and dropped only once the faces are in — a load FAILURE also
  releases it, in the fallback face: a missing typeface must never trap a child
  waiting for a story.
- **The motif is the real plate.** `StorytimeVignette` renders the shipped
  pencil-sketch scene (`assets/scene-{day,night}.png`) in the A+B split above:
  `variant="band"` crops it to the locked 141×96 Viewer header, `variant="plate"`
  gives the empty shelf the full portrait (capped at 280pt so a tablet gets a
  plate, not a poster). The primitives-only placeholder composition is retired,
  and the app still carries no SVG dependency.
- **The night-mode flip is now actually covered.** `ThemeContext` was always
  correct — the real `useColorScheme` subscribes, so a parent switching the
  phone to dark mid-story has always repainted the open page. The FICTION was
  the test double: it read a module variable and never re-rendered, so nothing
  held the behaviour down. The double now subscribes like the real hook, and
  `ThemeContext.test.tsx` covers a mounted tree re-theming mid-flight. No
  production behaviour changed.
