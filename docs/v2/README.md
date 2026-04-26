# v2 design process

We're redesigning the 2026 Decathlon app in place — same Supabase backend, same event model, same friend group — with an ESPN-style sports UX layered over a group-chat event experience.

Work happens in stages. Each stage produces one doc. We sign off before moving to the next.

| # | Stage | Output | Status |
|---|---|---|---|
| 1 | Vision & product definition | [`01-vision.md`](./01-vision.md) | ✅ Signed off 2026-04-21 |
| 2 | User journeys | [`02-journeys.md`](./02-journeys.md) | **Draft — awaiting review** |
| 3 | Information architecture | `03-ia.md` | Not started |
| 4 | Design system (tokens, type, motion, primitives) | `04-design-system.md` | Not started |
| 5 | Screen specs (top 8–10 screens, one file each) | `screens/*.md` | Not started |
| 6 | Build plan (phased rollout) | `06-build-plan.md` | Not started |

## Locked decisions

- **D1 — Chat scope:** Both a persistent season channel and an ephemeral per-event channel.
- **D2 — Presence default:** Public. Lurk Mode toggle = still receive chat + push, but hide from presence rails.
- **D3 — Per-event live data:** Required. Every event hub has a first-class live-data module.

## Rules

- **Evolve in place.** v2 replaces v1's surfaces but reuses the Supabase schema, scoring rules, event handlers, and session model we already built. Schema-level changes are allowed but justified per-change.
- **Friend-group scoped.** No onboarding, no billing, no public discovery, no moderation tooling. Trust is assumed.
- **Mobile-first.** Every screen spec gets a 375px-wide layout first, then md/lg/xl.
- **Sign off after each stage.** If a stage changes shape during review, the downstream stages adjust before we keep drawing.

## How I'll deliver

- All docs land in `docs/v2/` on `claude/explore-repository-eY5l6` so you can pull and review.
- Each stage gets its own commit with a clear title.
- I'll flag decisions that should be yours (e.g. palette direction, chat model) inside the docs as `DECISION` callouts.
