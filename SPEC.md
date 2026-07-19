# Worldweave Tales — Design Spec

*Working app name: **Worldweave Tales**. Internal canon concept: **Storyworld**.*
*Status: design locked via grilling session (2026-07-16). Not yet started.*

---

## 1. Product thesis

A phone app that helps a caregiver (mom / dad / grandparent) who **isn't a natural storyteller** tell **original, from-scratch** stories to their kid — with pictures.

- **Parent-led, never AI-led.** The parent *directs by choosing*; the AI writes the prose and makes the art. Ownership comes from the parent having made every meaningful creative decision.
- **KIDS LOVE PICTURES.** The pictures are the point.
- **Ownable** = it lives on the parent's device (no accounts) + the finished book is emailed as a **PDF** they keep forever (print or tablet).
- **A franchise, not a one-off.** A recurring hero and a persistent world grow with the kid across many stories.
- **Explicitly Christian.** Faith is the app's foundation, woven with taste and age-scaled, denomination-neutral. See the guardrails (§7).

---

## 2. Locked decisions (grilling session)

1. **"Ownable" = parent-led authorship** — story generation is parent-directed, not AI-directed.
2. Parent is the **director** (makes choices), not the author (doesn't write prose). Designed for people who *want* to tell stories but lack the knack.
3. Stories are **original, from scratch** — no templates, no pre-loaded family cast. Parent answers story-shaping choices (world, hero, villain, stakes...).
4. **Wizard → batch-render → finished book.** All generation happens **up front**. **No mid-story spinning.**
5. Output artifact: a book, exported as a **PDF emailed to the parent** for print or tablet.
6. **Art = D&D-style card deck.** Each entity is drawn **exactly once, ever**, then reused. Consistency is impossible to violate because nothing is ever recreated.
7. Pages are **card-layout** (portrait + prose), NOT composited action scenes. Interaction lives in the words; identity lives in the fixed card.
8. **One locked art style** across a world's whole deck. Style: **imaginative, detailed pencil-sketch**.
9. **Tier** (Beginner / Solid / Epic) scales **story depth** (how many questions, how much co-direction). Art handling is uniform across tiers.
10. **Art control:** parent **taps to pick** hero + villain from a few variants (no editing). Other cards AI-derived. Uniform across tiers.
11. **Persistent, reusable hero.** Data model built for reuse from day one. Story arcs stay consistent across books.
12. **Per-story age dial** (default = classic picture-book). Age flexes reading level, length, and card count so the hero can grow with the kid.
13. **Platform:** React Native (**Expo**), both stores from one codebase.
14. **Local-first, no accounts.** Library / canon / books live on the device. Requires a **thin, provider-agnostic generation proxy** (holds the API key; app can't). Local-first, not offline-only: network needed only at deck-creation time.
15. **No backup except the emailed PDF** (for now). Design data model so opt-in cloud/drive backup is a future bolt-on (backup, not sync).
16. **Image provider (MVP): Recraft V3** — turnkey named-style lock for the pencil-sketch look. Proxy stays provider-agnostic (can swap to FLUX or self-hosted GPU at scale).
17. **Prose:** LLM-written inside a **fixed beat skeleton** (enforces pacing + happy ending), generated up front through the proxy. Exact LLM TBD at build.
18. **Values layer:** global wholesome **guardrails always on** (good beats evil, happy ending, age-appropriate, bedtime-safe). **Specific lesson chosen per story** (defaulted by tier).
19. **~10-minute read-aloud** default (~1,000–1,400 words, ~10–14 cards), **flexes with the age dial**.
20. **Entity/card count:** cap governs **NEW entities per arc** (Beginner ~3, Solid ~6, Epic ~10). **Reused canon is unlimited and free.** Story length sets the ceiling. **Hero/villain are must-keep and override the cap** — they survive even when the cap is smaller than the number of must-keeps; remaining slots fill in `firstBeatIndex` order. Parent's explicit picks are also always guaranteed cards, but for MVP that guarantee is a **forward-compat no-op** (no parent picks exist at authoring time — documented, not yet built). LLM fills the rest up to the cap.
21. **Storyworld = the unit of canon.** It owns a canonical deck + many story arcs. New arcs reuse locked cards and only *add* new ones. A parent can have several Storyworlds. Hierarchy: **Storyworld → (canonical deck) + (many arcs) → each arc = ~10-min book of beats that deal that world's cards.**
22. **Canonical art:** once the parent decides a card's art, it's **locked forever** — reused across this book and all future arcs, never regenerated. New arcs only add.
23. **Story Bible (narrative canon):** per-Storyworld, structured, **LLM-maintained**, stored locally, **parent-correctable**. Holds entity sheets (with appearance notes matching the locked art), an event log (compact per-arc summaries, recency-weighted compression), world state, and open threads. Injected into each new generation as hard constraints. Keeps token cost flat as a world matures.
24. **End-of-story hook:** every arc **fully resolves** (good wins, lesson landed, kid safe) **then** a **gentle, hopeful** teaser (never a peril cliffhanger — bedtime-safe). Hook is saved as an **open thread** in the Bible; the next wizard *offers* it as an optional springboard (never mandated).
25. **Beat-skeleton variability:** a curated **library of arc shapes** (Quest, Rescue, Mystery, Lost & Found Home, Rivalry→Friendship, Overcoming a Fear...), all sharing the invariant spine (conflict → virtue tested → good triumphs + lesson earned + safe → gentle hook). Beat *count* flexes with age. **Beginner:** engine auto-picks + anti-repeats (checks Bible for recent shapes). **Solid/Epic:** parent picks the story-type. Spine always enforced.
26. **Teaching points:** **list + free-text + subtle/explicit control, scaled by tier.** Beginner = pick from curated virtue list or default (one tap). Solid = list + optional free-text. Epic = free-text a real-life situation + control over how directly it's taught. The teaching point **drives the arc's "test" beat**. Virtues taught are **logged in the Bible** (for variety or deliberate reinforcement; lets the hero visibly grow). Free-text passes through the wholesome guardrails.

---

## 3. Data model (sketch)

```
Storyworld (the unit of canon; parent may have several)
├─ meta: name, locked art style, kid age default
├─ Canonical Deck
│   └─ Card { entityId, role(hero|villain|companion|place|artifact|...),
│             lockedImage (never regenerated),
│             canonName, traits, appearanceNote, relationships }
├─ Story Bible
│   ├─ entitySheets[]  (facts, appearance notes -> match locked art)
│   ├─ eventLog[]      (2-4 sentence summary per arc; recency-weighted compression)
│   ├─ worldState      (standing facts, relationships)
│   ├─ openThreads[]   (hooks from prior arcs)
│   └─ virtuesTaught[] (per-arc lessons)
└─ Arcs[]  (each = one ~10-min book)
    ├─ tier, ageLevel, chosenLesson, arcShape
    ├─ Beats[] { text, dealtCards[] }
    └─ exportedPdf?
```

Everything above lives **on-device** (e.g. SQLite + local blob store for images). No server-side user data.

The `Beat` schema stays `{ text, dealtCards[] }` (unchanged). At read time each beat renders its dealt cards' locked images **in beat order** as blob-backed `<Image>` elements — a real blob path renders as an `<Image>`; a `stub-image:*` or other non-blob ref falls back to a text placeholder. N images render per beat, in order.

---

## 4. Generation pipeline (all up front, no mid-story spinning)

1. **Wizard** — parent makes choices (depth scaled by tier): continue-a-thread? story shape? lesson? world/hero/villain choices.
2. **Single-pass authoring** — one LLM call returns `{ beats, cast }`: the arc's prose (inside the chosen arc-shape skeleton, at the age reading level, constrained by the Story Bible + guardrails + chosen lesson, chunked into per-beat pages) **and** its cast, in one structured response. **Entity resolution** is then a **deterministic diff** of `cast` against the canon deck: for each cast member, **reuse locked canon if it exists**; else it's NEW (counts against the tier's new-entity cap). `cast` is **transient** — it lives only at the provider boundary and is **not persisted**, so there is no schema change; recurring cast persists via the existing `Storyworld.deck`.
3. **Card generation** — Recraft, locked pencil-sketch style. Hero/villain-class new cards → generate a few variants → **parent taps to pick** → canonize + lock. Other new cards AI-derived + locked.
4. **Assemble book** — **derive** each beat's `dealtCards` by bucketing the surviving cast onto beats by `firstBeatIndex`, then render the card-layout pages: each dealt card's locked image renders **in beat order** as a blob-backed `<Image>` (real blob path → `<Image>`; `stub-image:*` / non-blob refs → text-placeholder fallback).
5. **Bible update** — LLM writes this arc's event summary, updates sheets/world-state, records the lesson + the new open-thread hook.
6. **Export** — render PDF, email to parent-provided address.

All network/generation happens in steps 2–3/5 (up front). Reading the finished book needs no network.

---

## 5. Tech stack

- **App:** React Native (Expo), iOS + Android.
- **Storage:** local-first (SQLite + local image blobs). No accounts.
- **Proxy:** thin, provider-agnostic server that holds API keys; the only backend. Routes image + LLM calls. Enforces the three abuse layers (attestation + per-device quota + global kill-switch — see §6).
- **Image:** Recraft V3 (named-style lock) for MVP. Swappable → FLUX (fal.ai/Replicate) or self-hosted GPU at scale (break-even vs a $3.44/hr DO droplet ≈ ~$2,400/mo of images).
- **LLM:** small/fast model for prose + Bible maintenance (exact model + pricing confirmed at build).

---

## 6. Monetization & abuse control

**Cost reality:** each book costs ~$0.30–0.55 in generation spend, paid at "make it" time. No accounts, so no login-based rate-limiting — the platforms provide the tools instead.

**Monetization model: consumable CREDIT PACKS.**
- Parent buys "N stories" as an in-app purchase; each finished book spends one credit.
- Revenue is coupled to cost *per book* — you cannot lose money on generation (paid before it happens).
- Needs no accounts: the **app-store purchase is the identity + payment**. Store handles billing.
- One-time purchase (unlimited) rejected — a heavy user bankrupts unit economics with per-image costs.
- Subscription (unlimited/N per month) can be **added later** for power-parents once real usage is known.

**MVP ships FREE** (no purchase) to prove the magic. That is the maximum abuse surface, so all three defense layers ship at launch:

1. **App attestation (non-negotiable).** Apple **App Attest / DeviceCheck** + Google **Play Integrity API** — proxy cryptographically verifies each request comes from the genuine app on a real device (not curl/script/emulator). Kills the "point a bot at the proxy" catastrophic attack. Device + app = the credential; no account needed.
2. **Per-device free quota.** Same DeviceCheck / Play Integrity device token caps free usage (N free books/device). Tune loosely at first, tighten on observed abuse. (Reinstall/factory-reset farming is possible but annoying.)
3. **Global spend kill-switch.** Hard ceiling on total daily generations across everyone; generation pauses when the day's budget is hit. The "no surprise $4,000 bill" backstop, independent of layers 1–2.

**Forward-compatible:** the device-attestation identity is exactly what credits bolt onto later — device proves integrity, proxy attaches the entitlement. Building this now = building toward the paid model.

*Tradeoff accepted:* attestation adds proxy complexity + platform-specific code (App Attest on iOS, Play Integrity on Android).

## 7. Guardrails (the values contract — governs every story, prose AND art)

**Identity:** Worldweave Tales is an **explicitly Christian** bedtime-storytelling app — faith woven with taste, **age-scaled**, **denomination-neutral** (broadly biblical; avoids divisive doctrine — baptism specifics, communion theology, end-times, etc.).

### 7.1 Invariants (always on, not parent-adjustable)
- Good triumphs; ending is safe, warm, resolved. Lessons are *earned*, never preachy/tacked-on — the same rule applies to faith.
- **Christian foundation:** morals grounded in Christian ethics (grace, forgiveness, love-your-neighbor, honesty, humility, courage from faith). Faith shown through character and choice (a hero who prays when afraid, kindness as Christlike love, forgiveness echoing grace) — never a sermon.
- No profanity, slang, crude humor, or innuendo. Reading-level-appropriate vocabulary.
- No romance/sexuality, no substances (alcohol/drugs/smoking), no gambling.
- No gore, no graphic injury, no cruelty for its own sake.
- No real public figures, no branded/IP characters, no real-person likenesses — heroes are original (also keeps clear of image-gen likeness policy).
- No politics. No denomination-dividing doctrine.
- No stereotyping; respectful, inclusive depiction by default.
- Art obeys the same ceiling as the words — nothing scarier or more graphic than the prose allows.
- Parent free-text can shape the lesson but **never override an invariant**.

### 7.2 Dials (resolved)
- **Scariness/peril ceiling (Q28):** age-scaled, with a **hard bedtime-safe floor**. Age raises *suspense/stakes*, never breaches "safe at lights-out" — even the oldest tier gets no nightmare fuel, no unresolved scare at bedtime.
- **Death/loss (Q29):** never gratuitous, never uninvited. Available only as a **gentle, parent-initiated** theme (via teaching-point free-text); handled age-appropriately and hopefully (love/memory/safety, feelings-are-okay; hope-anchored for a faith family), never about fear of death, always lands safe.
- **Villain resolution (Q30):** *follows the lesson* — redemption/grace for empathy-forgiveness lessons (Rivalry→Friendship), decisive defeat/outwit/banish for courage lessons (Rescue, Overcoming a Fear). Villains are **changed, beaten, or banished — never killed** (unless the parent opened the loss door) and **never defeated cruelly** (hero wins by cleverness/courage/kindness, never by becoming cruel).
- **Sensitive real-life topics (Q31):** allowed via **gentle fictional analogs** (hero mirrors the kid's situation — new baby, moving, first day of school, bullying, deployment, etc.) through the bedtime-safe/hopeful/age-scaled lens. **Heavy topics** (grief, divorce, serious illness) get extra-gentle handling, default younger. Truly-unsafe requests are **refused, not reframed**.
- **Refusal behavior (Q32):** *soft conflicts* (legit intent, wrong method — "hit back") are **reframed transparently** (build the story + a one-line note on how it was framed, through the Christian lens — e.g. forgiveness + get a grown-up). *Hard-unsafe* requests (abuse, self-harm, adult/violent content, real people) get a **warm, non-preachy gentle decline** — no lecture, no shaming.
- **Scripture handling (Q34):** **woven by default** — faith shown in story/character, no chapter-and-verse in the narrative (keeps translation debates out, stays denomination-neutral). **Optional parent-toggled closing verse** (off by default): one short, relevant, kid-friendly verse on the final page + in the PDF, as a keepsake takeaway.

## 8. Parked / deferred (explicitly)
 Its own working session (moral framework, good-vs-evil rules, scariness limits, content boundaries...).
- **Wizard question tree** — the actual per-tier question content.
- **PDF page layout / card page visual design.**
- **First-run onboarding.**
- **Exact LLM + live pricing.**
- **App name final decision** (shortlist: Worldweave Tales [lead], Storyworld, Bed Time Story Helper) — do app-store + domain + trademark availability check before store listing.
- **Opt-in cloud/drive backup** of the hero library.
```
