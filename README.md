# Worldweave Tales

An **explicitly Christian** bedtime-storytelling phone app. It helps a caregiver who isn't a
natural storyteller tell **original, from-scratch** stories to their kid — with consistent,
canonical pictures. **Parent-led, never AI-led:** the parent directs by choosing; the AI writes
prose and makes art. See [`SPEC.md`](./SPEC.md) for the full locked design.

## The one idea that makes it work

Art is a **canonical card deck**. Each entity (hero, villain, place, artifact) is drawn **exactly
once, ever**, then locked and reused across every book in that world — so consistency is
*impossible to violate* because nothing is ever recreated. Stories are told by *dealing the cards*.

## Monorepo layout

```
packages/domain/   Shared TypeScript domain model — the single source of truth for the
                   design (Storyworld, Card, StoryBible, Arc, tiers, arc shapes, guardrails).
                   Imported by BOTH the app and the proxy.
proxy/             The only backend: a thin, provider-agnostic server that holds API keys,
                   enforces the 3 abuse layers, and runs the up-front generation pipeline.
app/               Expo (React Native) app — local-first, no accounts. Library, wizard,
                   card viewer, PDF export/email.
```

## Why a proxy exists (even with "no accounts")

API keys can't ship inside a phone app (anyone could extract them and spend your money). The
proxy holds the keys and is the *only* server. It enforces:

1. **App attestation** — App Attest (iOS) / Play Integrity (Android): requests must come from the
   genuine app on a real device.
2. **Per-device free quota** — caps free usage without accounts.
3. **Global spend kill-switch** — a hard daily generation ceiling; the "no surprise bill" backstop.

Everything *else* (library, canon, finished books) lives **on-device**. The proxy stores no user data.

## Status

Scaffold. Domain model + proxy pipeline + abuse layers are stubbed and typed; providers
(Recraft image, LLM) are adapters behind interfaces so they can be swapped. Nothing is wired to a
real key yet. See `SPEC.md` §8 for what's still parked.

## Getting started

```bash
npm install
npm run build:domain     # compile the shared types
npm run dev:proxy        # start the proxy (uses stub providers until keys are set)
npm run dev:app          # start Expo
```

Copy `proxy/.env.example` → `proxy/.env` and fill in keys to switch stubs for real providers.
