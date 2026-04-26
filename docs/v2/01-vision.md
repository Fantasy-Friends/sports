# Stage 1 — Vision

**Status:** signed off 2026-04-21.
**Codename:** Surge (already used in v1 hero copy; carrying forward).

## One-sentence definition

Surge is the 2026 Decathlon's home: a sports-native group chat for a friend group where picking, watching, and trash-talking an event happen in the same place, on the same screen.

## Who this is for

- The ~6 members of the 2026 Decathlon friend group.
- Invite-only, no public discovery, no signup funnel. Names, nicknames, and running jokes are inside-baseball.
- Usage is spiky: quiet Tuesday afternoons, packed during drafts, post times, and final whistles.

## Who this is _not_ for

Public leagues, paying customers, casual fans, strangers, content marketing, or any scenario that requires moderation tooling. If we ever want those things, it's a different product.

## Why v2 exists

v1 shipped the hard parts: auth, events, scoring rules, handlers, leaderboards, hot seat, notifications, the legacy golf draft, an NBA bracket. It works. What it's missing is a sense of _place_:

- Every event looks the same — a form on top, a table below.
- Conversation happens on the group text, not in the app.
- There's no way to see if anyone else is around, watching, or reacting.
- Big moments (draft opens, an event finalizes, a bonus is awarded) land as quiet SMS instead of hero moments.

v2 pulls the group text _into_ the app, gives each event its own room, and makes presence, announcements, and hot-takes first-class next to the scoreboard.

## Core pillars

1. **Every event is a place.**
   Each event (Derby, Masters, NBA Finals, NFL Week 7, etc.) has its own hub with sport-specific chrome — palette, iconography, live tiles. Drafts, stat feeds, leaderboards, picks, and chat all live on the event's page. No generic forms.

2. **Presence is always visible.**
   A member's avatar shows up in the event header when they've checked in. You can see at a glance who's watching the same game, who's lurking in the draft room, who's around at 10pm on a Sunday.

3. **Chat, threads, and hot takes as first-class citizens.**
   - **Chat:** per-event rolling conversation, always-on, scrolls with unread indicators.
   - **Threads:** reply to a specific message or a specific _moment_ (a pick, a score change, a bonus award) without derailing the main channel.
   - **Hot takes:** one-tap emoji reactions that attach to game moments and pile up in a live ticker ("5 🫣 in the last 30 seconds").

4. **Big-moment announcements.**
   Tentpole events get hero treatment: full-width in-app banner + push/SMS. Draft opens. Draft locks. You're on the clock. Bracket deadline. Event finalized. Bonus awarded. Hot Seat declared. Member checks in to an event you're already in.

5. **Per-event customization.**
   Sport-specific layouts (a golf leaderboard looks different from an NBA bracket which looks different from an NFL pick'em), team colors where relevant, entrant-picked avatars and nicknames, league-wide theme toggles.

6. **Low-floor / high-ceiling usage.**
   - Low-floor: glance at standings, tap a 🔥 on someone's pick, close the app — 5 seconds.
   - High-ceiling: thread an argument about a series pick, author a hot take with text, scrub the event history — 30 minutes.
   - Neither mode should feel like the wrong one.

7. **Every event plugs into live reality.**
   Each event hub surfaces the real sporting event's current state — post positions and morning-line odds for the Derby, live scoreboard for NBA Finals, current drive for NFL games, leaderboard deltas for golf. An event without a live data module is a template, not a hub. The data source per event is a build-plan decision (Stage 6), but the UX spec assumes a live module exists as a first-class slot.

## What we're explicitly _not_ building

- Public discovery, league marketplaces, or "join a league" flows
- Billing, subscriptions, prize collection, or any payment surface
- Moderation / abuse / reporting tools — trust is assumed
- Cross-platform linking to ESPN / Yahoo / Sleeper accounts
- Sportsbook integration
- Our own video highlight feed
- AI-generated takes / commentary
- A web of league-vs-league social features

## North-star scenarios

Three "picture this" moments that are the point of shipping v2:

### Scenario 1 — Derby Saturday, 5:00 PM ET

All 6 members have checked in to `/events/kentucky-derby`. Their avatars line the event header with a pulsing "here now" dot. Chat is rolling with trash-talk about post positions. 4 minutes to the race; one member taps 🔥 on their top pick and writes "lock of the century" — the reaction pins to the pick and pops into the ticker. Post time: a full-width banner fires — 🏇 "They're off" — with the event palette saturating the page. Race runs; results feed in; the `Survivor` bonus auto-computes and lands as a chip in chat: "Survivor → Dusty (+6)". Someone drops a 😭 in thread under it.

### Scenario 2 — NBA Finals Game 7, 10:55 PM ET

Three members are checked in. Live scoreboard tile at the top is sticky. Tie game, six seconds on the clock. A member hits the quick-reaction bar — 🫣 — timestamped to the game clock. Reactions from the other two pile up behind it. The shot goes in. Winner bonus appears in the event's pinned feed; two members thread the finals MVP tiebreaker.

### Scenario 3 — Tuesday afternoon, nothing live

Member opens the app. Home shows season standings at the top, a "What's next" tile (PGA Championship in 3 weeks, NFL Week 1 picks unlock in 22 weeks), and a "Last talked about" module — 3 threads the friend group has reacted to most recently. Tap in, scroll, drop a late reaction on yesterday's thread. 30-second check-in. Close.

## Success criteria (what "working" looks like)

- Members check into ≥ 1 event per month without being SMS-reminded.
- Chat volume during a live event is ≥ 10× the current group-text cadence for that same event.
- ≥ 1 hot-take reaction exists on every event that reaches `live` status.
- The friend group's group text stops getting messages like _"is the draft open yet?"_ or _"where do I submit picks?"_ — those questions become zero-lift inside the app.
- A new event type shipped by the team doesn't need its own one-off UI shell — it fits the per-event hub pattern by default.

## Open questions (answered in later stages)

| # | Question | Stage it gets answered |
|---|---|---|
| Q1 | Does chat persist forever or auto-archive post-event? | 3 (IA) |
| Q2 | Hot-takes: emoji-only, emoji + short text, or emoji + link-to-moment? | 3 (IA) / 5 (screens) |
| Q3 | Does presence have a "lurk" / invisible mode? | 2 (journeys) |
| Q4 | Do we rely on commissioner-imported stats or wire a live feed (ESPN API, TheScore, etc.)? | 6 (build plan) |
| Q5 | Can members pick their own avatar and accent color? | 4 (design system) |
| Q6 | Push notifications via PWA or stay SMS/email-only? | 6 (build plan) |

## Decisions made

| # | Question | Answer |
|---|---|---|
| D1 | Chat scope | **Both.** Persistent season channel + ephemeral per-event channel that auto-opens when the event hits `open-entry` and stays alive through `final` (then read-only). |
| D2 | Presence default | **Public by default** with an explicit **Lurk Mode** toggle in the user menu. Lurk mode = you still receive the group chat and push notifications, but your avatar does **not** appear in event presence rails. Lurk is passive reception, not disconnection. |
| D3 | Per-event live data | **Required.** Every event hub has a first-class live-data module. The data source per event is a build-plan concern (Stage 6). The UX assumes it exists. |

---

_Next stage_: Stage 2 (User Journeys) — the 4–6 "money paths" walked step-by-step, which becomes the backbone for the IA in Stage 3.
