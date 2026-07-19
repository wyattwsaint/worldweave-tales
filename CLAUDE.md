# Worldweave Tales

Parent-led children's bedtime-story app. Product design: `SPEC.md`. Domain language: `CONTEXT.md`.

## Agent skills

### Issue tracker

Issues live in GitHub (`wyattwsaint/worldweave-tales`) via the `gh` CLI. External PRs are **not** a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Build specs

Before implementing an MVP issue (#1–#9), read `docs/specs/mvp-afk-spec.md` (the AFK build plan) and the ADRs it cites, then follow that phase's test plan (TDD). Scope + sequence rationale: `docs/adr/0003-mvp-scope-and-sequence.md`.
