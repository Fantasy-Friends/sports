# Stage 2 — User Journeys

**Status:** draft, awaiting review.

User journeys are the "money paths" — the specific sequences every core pillar from Stage 1 has to support. We walk them step-by-step to pressure-test the vision before committing to an IA in Stage 3. If a journey here doesn't work, the IA won't save it.

## Journeys covered

| # | Name | Who | Triggers |
|---|---|---|---|
| J1 | First sign-in & orientation | New member (or reset session) | Gets an invite code from the commissioner |
| J2 | Check into a live event | Active member | Knows an event is live, wants to participate in the room |
| J3 | Lurker path | Any member | Gets a push, glances, leaves — no check-in |
| J4 | Enter a new event type (Derby walk-through) | Any member | Event enters `open-entry` status |
| J5 | Live-watch with hot takes & threads | 2+ members checked in | Something happens in the real event |
| J6 | Commissioner runs draft night | Admin | It's time to open a draft |

Each journey lists: **scene** (when/why) → **steps** → **key moments** → **end state**. Anything a future screen spec needs is called out as a `NEEDS` tag so Stage 5 knows what to draw.

---

## J1 — First sign-in & orientation

**Scene.** Saturday morning. Commissioner has DM'd a new member (or the existing same friend getting a fresh device) an invite link and 8-character code: `surge.app/?entrant=dusty&code=A3B7KPQ2`. They tap it on their phone.

**Steps**

1. Land on `/` with `entrant=dusty` pre-selected in the slot picker. Access-code field is focused.
2. Type the code. Submit (Enter works).
3. Success → app drops them into a **Home** hub with a one-time welcome tile: *"Welcome, Dusty. 6 members, 28 events, 14 types. Here's what's happening right now."*
4. Welcome tile shows:
   - Next live event (e.g. "Kentucky Derby — open-entry, closes in 3 days")
   - Season standings strip (top 3)
   - A "Set your avatar and nickname" nudge
5. Tap the avatar nudge → modal → pick an emoji avatar + confirm nickname → save.
6. Tile disappears from Home; they're oriented.

**Key moments**
- **Codeless pre-fill.** `entrant=` in the URL means they don't type their own slug. One-field sign-in, not two.
- **One-time welcome tile.** Orients without being a tutorial. Dismissed by the avatar save or a close button.
- **Avatar before anything else.** The rest of the app uses avatars as the anchor of presence and authorship. Setting it first makes every later screen feel lived-in.

**End state.** Signed in, avatar set, on the Home hub.

`NEEDS`: Welcome-tile component, avatar picker modal, pre-filled sign-in form.

---

## J2 — Check into a live event

**Scene.** 4:45pm Saturday. Derby post is at 6:57pm ET. Member opens the app cold.

**Steps**

1. Open the app → lands on **Home**.
2. Home's top tile is a **Live Now** strip — one large card per live or imminent event. Derby is featured because it's `open-entry` + within 24h of post.
3. The Derby card shows:
   - Event hero art + name
   - A countdown: "Post in 2h 12m"
   - A **presence rail** of avatars showing who's currently checked into the event (right now: empty)
   - Primary action button: **"Check in"**
4. Tap **Check in** → quick transition to `/events/kentucky-derby`. Their avatar appears in the event's presence rail with a pulsing dot.
5. Event hub loads. From top to bottom:
   - Event header (palette saturates the page; hero image of Churchill Downs)
   - Presence rail
   - **Live module** (Stage 1 D3 requirement): field of 20 horses with morning-line odds, post positions, weather, jockey changes since yesterday
   - **My picks** module (empty or partial — depends on whether they've entered)
   - **Leaderboard** module (who's in, who hasn't entered yet)
   - **Event chat** (auto-opened, has backscroll from when it hit `open-entry`)
6. If they haven't entered yet, the **My picks** module is a primary CTA: "Enter your picks" → drops into J4.

**Key moments**
- **Check in is one tap.** No modal, no confirmation. Presence dot appears immediately.
- **Presence rail is always top-sticky on the event hub.** Members are the most important context.
- **Live module is the visual hero of the event page.** It's the reason people are here.
- **Event chat is on-screen, not hidden behind a tab.** Default is open, scroll-to-dismiss.

**End state.** Checked into the Derby event, can see other members, can see live field data, can read/write chat, has a path to enter picks.

`NEEDS`: Home "Live Now" strip, event hub template, presence rail component, live-data module shell (per-event content varies), inline chat panel.

---

## J3 — Lurker path

**Scene.** 7:02pm Saturday. Derby is off. Member hasn't opened the app and didn't enter picks. Their phone buzzes — a push notification.

**Steps**

1. Push: **"🏇 They're off — Kentucky Derby"** with subtitle *"All 6 members are checked in. Tap to watch."*
2. They tap.
3. Deep-link lands them on `/events/kentucky-derby` directly (not Home).
4. Because they have **Lurk Mode ON** in their user menu, their avatar does **not** appear in the presence rail. Other members don't see them arrive.
5. Live module is showing live race positions. Chat has 8 new messages (badge count shown before they entered).
6. They scroll the chat for 10 seconds, read, drop a single 😂 hot-take reaction on someone's earlier "lock of the century" message — the reaction uses their avatar, so they do surface via the reaction itself (intentional: you can lurk but if you act, your action is attributed).
7. They close the app without checking in.

**Key moments**
- **Push deep-links directly to the relevant event**, never just the home screen.
- **Lurk Mode affects presence rail only.** Chat + reactions + picks are still attributed. Lurk ≠ anonymous.
- **A lurker who reacts still participates.** This is desirable — tipping their hand by reacting is a choice they made.
- **Chat badge count shows unread** — a lurker should know exactly how much they missed before opening.

**End state.** App closed. Zero check-in. One reaction sent. No presence footprint but a chat footprint.

`NEEDS`: Lurk Mode user-menu toggle, push deep-linking with event-specific templates, unread badge on chat, reactions component that uses the user's avatar as the reaction marker.

---

## J4 — Enter a new event type (Derby walk-through)

**Scene.** Friday afternoon. Derby hit `open-entry` this morning. Member has been notified once. They open the app to enter picks.

**Steps**

1. Land on Home. A **"Your turn"** tile at the top (above Live Now) shows events awaiting entry: "Kentucky Derby — enter 3 horses by Sat 2pm ET."
2. Tap → `/events/kentucky-derby/entry`.
3. Entry screen is **purpose-built for horse-draft**, not a generic form:
   - Header: same event palette as the hub; progress strip ("0 of 3 picks")
   - **Field grid** of the 20 horses, one card each:
     - Silks/colors thumbnail
     - Horse name
     - Jockey, trainer
     - Morning-line odds (prominent)
     - Post position
   - Filter chips: "By odds ↑", "By post position", "Sort alphabetically"
   - A search field at the top for horse name, jockey, or trainer (matches user's ESPN answer: "easily search events")
4. They tap 3 horse cards in order. Each card flips to a "Pick 1 / 2 / 3" state with their avatar pinned to it.
5. A sticky footer shows their 3 picks and a **"Lock picks"** button.
6. Tap lock → confirmation sheet: "Lock 3 picks? You can edit until post time Sat 2pm ET." → confirm.
7. Entry screen transitions to a **"You're locked in"** view with their picks, a pitch to check into the event hub, and a tease of who else has entered.
8. Back to `/events/kentucky-derby` → their avatar is already in the event's presence rail (locking picks auto-checks you in), and My Picks now shows their horses with live odds.

**Key moments**
- **Entry screen is sport-specific.** A golf-draft has a draft board with turn-based controls. An NFL pickem has 5 game cards with ATS lines. A bracket has a round-by-round picker. Same shell, totally different chrome per event_type.
- **Sort/filter/search is standard on entry screens with a pool of choices.** Matches the "easily search events" ESPN-answer.
- **Locking picks auto-checks you in.** Reduces clicks and makes presence feel natural.
- **You can edit until lock time.** Low stakes to get started.
- **A "tease" of who else entered** creates social pressure without shaming.

**End state.** 3 picks locked, auto-checked-in to the Derby hub.

`NEEDS`: Per-event-type entry shells (the framework, not each one), filter/sort/search primitives, "Your turn" Home tile, locking flow, confirmation sheet pattern.

---

## J5 — Live-watch with hot takes & threads

**Scene.** 6:55pm Saturday. 5 members checked in. Chat is flowing. 2 minutes to post.

**Steps**

1. Member is on `/events/kentucky-derby` with chat visible. The live module is showing the field loading into the gates.
2. **Quick-reactions bar** floats above the chat at the bottom of the screen: 🔥 😂 🫣 🐐 😤 and a "+" to pick any emoji. Each reaction, when tapped, attaches to the current game moment (timestamp + event phase: "gates loading").
3. Member taps 🫣 → reaction drops into the chat as a ticker-style row: *"Dusty reacted 🫣 at gates-loading"*. Other members' reactions pile up visually — the row animates into a stack, like a betting-app crowd meter.
4. Someone types: "Number 7 looks scratchy." Chat bubble with their avatar, nickname, and a timestamp.
5. Member long-presses that message → context menu → **"Reply in thread"**. A thread panel slides in from the right (on desktop) or full-screen (on mobile).
6. In the thread: they type "He's had 3 weeks off." Thread count increments on the parent message (`1 reply`). Other members see the badge and can tap in.
7. **Gates open → banner fires.** Full-width accent-saturated banner across the top of the app: **"🏇 They're off"** with the event palette pulsing. Banner persists for 15 seconds then collapses to a thin header strip.
8. During the race (roughly 2 minutes): live module updates positions. Hot-take reactions spike. Chat moves fast.
9. Finish line. Live module snaps to final order. **"🏁 Derby final — Mage wins"** banner. A few seconds later, a system chip drops into chat: **"Survivor bonus → Dusty (+6 pts)"** with a 🎉 auto-reaction.
10. Members thread on the system chip to argue about the tiebreaker.

**Key moments**
- **Hot-takes attach to moments, not just messages.** "Dusty reacted 🫣 at gates-loading" is more meaningful than a raw emoji on a chat bubble.
- **Banners are theatrical.** Full-width, palette-saturated, for genuinely big moments only. Overuse kills the effect.
- **System chips look different from user messages.** Auto-reacted 🎉, colored border, non-editable. Threading on them is allowed.
- **Threads don't derail the main channel.** A hot argument about one pick doesn't flood the live feed.
- **Mobile thread = full-screen panel.** Desktop = side panel. Both feel native.

**End state.** Event ended, chat continues with post-race takes, threads preserve the arguments, banners faded to header strips, live module shows final.

`NEEDS`: Quick-reactions bar, moment-tagged reactions, threading primitives (panel + badge + navigation), big-moment banner component, system-chip message variant, reaction-stack animation.

---

## J6 — Commissioner runs draft night

**Scene.** Tuesday evening, one week before the PGA Championship. Commissioner is about to open the draft.

**Steps**

1. Commissioner opens `/admin`. They've been added as admin on their entrant row.
2. Admin home shows a **"Next action"** block: "PGA Championship — ready to open draft. 6 of 6 entrants seeded. Pre-draft checks all green."
3. Pre-draft checks block shows:
   - ✅ 6 entrants seeded
   - ✅ Golfers pool synced with odds/handicaps
   - ✅ Notifications enabled for 5 of 6 members (one member doesn't have a phone on file — shows that specific name and a link to notify them)
   - ⚠️ One small warning: "Masters 2026 not yet finalized — finalize before opening a new golf draft to avoid scoring overlap." With a jump-link.
4. Commissioner fixes the Masters warning with one click (finalize Masters → summary shows "Podium written, 6 members notified, 1 SMS failed").
5. Returns to PGA pre-draft. Warning is gone.
6. Taps **"Open draft"** → confirmation sheet: "Open draft now? Sends push + SMS + email to all 6 members." → confirm.
7. The app flips the draft open. System chip lands in the PGA event's chat: "Draft is live. First on the clock: Player 1." Members start checking in.
8. Commissioner watches the **Commissioner Console** on the draft page:
   - Live presence rail (same as members see)
   - A compact "On the clock" HUD showing current entrant, timer, auto-draft state
   - A notification-delivery strip: "Draft-opens notification → 6 members, email 6/6, SMS 5/6 (1 failed: Rex — no phone)."
   - An admin-only **"Force skip"** and **"Override pick"** available in case of trouble.
9. Draft proceeds. When a member goes auto-draft, a system chip announces the auto-pick.
10. When the draft completes, another big-moment banner: "🏌️ PGA Draft complete." Event flips to `locked`. Chat remains.

**Key moments**
- **Admin has a "next action" surface**, not a laundry list of buttons. Commissioner sees what to do, not 30 choices.
- **Pre-draft checks are visible and actionable.** Warnings include the jump-link to fix them.
- **Admin-driven big moments look the same to members as organic ones.** System chip + banner, same language.
- **Commissioner console is a superset of the member view.** They see everything members see, plus delivery stats and override tools.
- **Notification delivery is always visible.** If 1 of 6 SMS failed, commissioner knows instantly and can DM the affected person.

**End state.** Draft running smoothly, commissioner has visibility without clicking around, members are engaged in the room.

`NEEDS`: Admin "next action" card, pre-draft checks block (green/yellow/red with jump-links), commissioner-console overlay on event hubs, override controls gated behind a confirmation.

---

## Cross-journey observations

Reading across all six journeys:

- **Home is a situational router.** Not a dashboard of everything. It surfaces "what do I need to do right now" (Your turn), "what's happening right now" (Live Now), and standings. Everything else is one tap into an event or a menu.
- **The event hub is the app's center of gravity.** Every journey either starts, ends, or passes through an event hub. It's the only surface with presence, live data, chat, picks, and leaderboard all in one.
- **Chat and picks can never be separated.** Entering picks auto-checks you in. Chat is always on screen in an active event. A reaction is still attribution even in lurk mode.
- **Admin and member views share shape.** Commissioner sees everything members see, with a superset overlay. No separate admin app-within-an-app.
- **System chips are load-bearing.** They're how the app narrates — "Draft is live", "Survivor bonus → Dusty", "Masters finalized". They need to look and behave consistently across events.

## Open questions these journeys surface for Stage 3 (IA)

| # | Question | Journey that raised it |
|---|---|---|
| Q7 | Is there a separate Chat tab at all, or does chat only live inside event hubs + a persistent season channel reachable from the global nav? | J2, J5 |
| Q8 | Does the Home "Your turn" tile show only events the member hasn't entered, or also events where action is needed (vote on a hot seat, confirm a trade, etc.)? | J4 |
| Q9 | Do threads get their own permalink / URL, so a commissioner can link-to-a-thread in an announcement? | J5 |
| Q10 | Where does the Commissioner Console live — as an overlay on every event hub, a separate `/admin/event/:slug` route, or a toggle inside the event hub itself? | J6 |
| Q11 | What happens to presence when a member backgrounds the app — stay "here" for N minutes, or drop immediately? | J2, J3 |
| Q12 | Is there a global "live right now" badge in the nav when any event is live, regardless of the current page? | J2 |

## Decision markers for Stage 3

Only one new DECISION is raised by the journeys and needs your call before IA:

- **`DECISION-4`** — **Chat placement in the global nav.**
  Option A: Chat is not a top-level nav item; it lives inside event hubs + a persistent season channel accessible from the home hub.
  Option B: Chat is a top-level nav destination (`/chat`) with tabs for season + per-event channels.
  Recommend A: keeps chat contextual to the event it belongs to, avoids the "which channel am I in" confusion of a separate nav item, and reinforces that an event is the center of gravity. Con: if the season channel is important for non-event banter, option B gives it a persistent home.

---

_Next stage_: once you sign off on these journeys, Stage 3 (IA) turns them into the actual site map, navigation model, and a screen inventory we'll draw in Stage 5.
