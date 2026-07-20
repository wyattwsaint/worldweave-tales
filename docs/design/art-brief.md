# Art brief — icon, splash, scene plates (#6)

The editable source for Worldweave Tales' brand art. Read with
`docs/design/ui-direction.md` (§1–§2 lock the motif and palette).

**What "editable source" means here, honestly.** The art is ChatGPT raster —
there is no SVG or layered master, and re-running the prompts below will not
reproduce these exact pictures. What is reproducible is the *direction*: the
prompts plus this brief are enough to regenerate art in the same family, and the
committed masters are the authoritative pixels. Treat the masters as the source
and this file as the reasoning.

## Files

| Path | Role |
| --- | --- |
| `art/icon-master.png` | Icon master, 1024². Downscaled from the 1254² original, otherwise untouched. |
| `art/scene-diptych.png` | Day+night reading scene, 1536×1024. The panels butt at exactly x=768. |
| `app/assets/icon.png` | Derived. Full-bleed square icon — iOS, and `expo.icon`. |
| `app/assets/adaptive-icon.png` | Derived. Android launcher foreground **and** the splash image. |
| `app/assets/scene-day.png` | Derived. 768×1024 day plate for the in-app vignette. |
| `app/assets/scene-night.png` | Derived. 768×1024 night plate. |

Masters live in `art/`, outside `app/`, so a full-resolution source can never be
swept into the app bundle. Derived files are committed anyway so EAS and CI never
need `sharp`. Regenerate with `npm run art:build` and commit both sides;
`app/src/theme/artAssets.contract.test.ts` fails if they drift apart.

The shipped PNGs are palette-quantized to 256 dithered colours — visually
indistinguishable on pencil texture and flat line art, and it halves the bundle
cost (5.7 MB → 2.5 MB). The masters stay lossless.

## Direction

- **Motif:** a parent's hand and a child's hand, joined, beneath a single star.
- **Christian identity stays implicit.** Hands and star, no cross. The star does
  the work; the icon is a bedtime image, not a denominational badge.
- **Icon ground is indigo, not parchment** — the icon reads as night, matching
  the moment the app is opened.
- **Icon is simplified line art**, not the full pencil texture of the scenes: it
  has to survive 48px.
- The day and night scenes must remain **the same drawing**, lit differently.
  This is why ground correction happens in code and never by re-prompting — a
  re-roll would break the pairing.

## Prompts

> **TODO — paste the verbatim ChatGPT prompts here.** They were authored in the
> 2026-07-20 session and are not otherwise recorded. Without them this section
> is the one part of the brief that cannot be reconstructed.

## Pipeline

`scripts/build-art.mjs` (`npm run art:build`). Two corrections matter:

**Ground normalization.** The generated grounds drift from the tokens — most
visibly the day plate, which is golden (`#E6C88C`) against parchment
(`#F3E8D2`). The icon's ground is a flat field, so it is recoloured outright
with a feathered edge. The scene grounds are lit gradients, so they are regraded
in HSV instead, masked so the amber lamp and star keep their chroma. The day
plate is deliberately **under-corrected** (0.8 strength, gated on lightness):
landing its ground exactly on the token hex costs more warmth than the residual
drift does, and the goal is a plate that sits beside `#F3E8D2` convincingly, not
one that measures as it.

**Safe-zone inset.** Android masks both the launcher icon and the splash image
to a circle two-thirds of the canvas. On a raw full-bleed foreground this severs
the star's top point. `adaptive-icon.png` therefore insets the whole plate to
72% — measured, not guessed: art first crosses the circle at 76%.

## Splash

Android 12+ renders the splash through the platform API: a 288dp canvas whose
inner ~192dp circle is all that survives. A 3:4 scene plate cannot survive that
crop, so **the splash is the medallion, not the scene** — `adaptive-icon.png`
over the token ground, which is circle-safe by construction. Day shows an indigo
medallion on parchment; night lets the plate blend into the ground so the mark
appears to float. No wordmark: it would front-run the still-unwired brand fonts.

iOS 18 dark/tinted icon variants are deliberately skipped — tinting would erase
the amber star, which is the one piece of colour the mark owns.

## Verified / not verified

Verified: the derived assets' dimensions and grounds, zero art outside Android's
mask, and — via `npx expo prebuild` — that the wiring generates the right
`values/colors.xml`, `values-night/colors.xml` and `mipmap-anydpi-v26/ic_launcher.xml`.

**Not verified:** the icon on a real home screen, and the entire iOS native side.
Expo Go can never show a custom app icon, and `expo prebuild` cannot generate the
iOS project on Windows. Both are owed at the first dev build.
