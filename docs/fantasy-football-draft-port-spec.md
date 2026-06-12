# Fantasy Football Draft Re-Implementation Spec

**Source:** audit of an existing Next.js 16 + Supabase + React 19 fantasy-pool repo. The live draft in that repo is a 9-entrant snake draft over a fixed golfer pool (not football), but the schema, state machine, and UI generalize cleanly. Substitute `golfers` with `players` and adjust the constants. Code blocks below are verbatim from the source repo so you can port them.

The repo uses **no Yahoo integration, no CSV export, no SSE/WebSocket, and no event-log table**. Multi-user sync is **30-second HTTP polling + server-side reconciliation on every read**. The bulk of the cleverness lives in `lib/draftOrder.ts`.

---

## 1) Draft flow & state machine

```
Pre-create → entrants seeded → lottery (optional) sets draft_position →
Commissioner sets tournament_meta.draft_open = true
  → syncDraftState(poolId, true)        // resets pointer, optional auto-pick sweep
  → advanceDraftState(poolId)           // sets first turn timer
  → broadcast "draft_opens" email + SMS to season members
On each pick request (POST /api/draft-picks/add):
  → auth + pool guard
  → advanceDraftState() (resolve who is on the clock NOW, auto-pick any
    auto-draft entrants in front of you, skip out-of-window time)
  → uniqueness check: player exists in pool; not already drafted
  → insert pick (entrant's pick_number = existing count + 1)
  → advanceDraftState() again to expose the next on-clock entrant
Turn timer expiry inside advanceDraftState:
  → flip the slow entrant's auto_draft_enabled = true (auto-pick from then on)
Completion (currentPick > maxPicks):
  → upsert draft_state with current_entrant_id = null
  → tournament_meta.draft_open = false (lockDraftForPool)
Pause (admin sets draft_open = false):
  → keep currentPick + entrant pointer; clear turn_started_at / turn_expires_at
Reset (admin):
  → wipe draft_picks for pool, delete draft_state row, clear all
    auto_draft_enabled, set draft_open = false
```

### Key constants

```ts
// lib/draftOrder.ts
export const PICKS_PER_ENTRANT = 6;
export const EXPECTED_ENTRANT_COUNT = 9;
export const TURN_DURATION_SECONDS = 60 * 60 * 2;   // 2 hours
export const DRAFT_TIME_ZONE = "America/Los_Angeles";
export const DRAFT_OPEN_HOUR = 6;                    // 6 AM Pacific
export const DRAFT_CLOSE_HOUR = 23;                  // 11 PM Pacific
```

### Snake order

```ts
// lib/draftOrder.ts
export function snakeDraftPosition(currentPick: number, entrantCount: number) {
  const round = Math.floor((currentPick - 1) / entrantCount) + 1;
  const pickInRound = ((currentPick - 1) % entrantCount) + 1;
  const draftPosition = round % 2 === 1 ? pickInRound : entrantCount - pickInRound + 1;
  return { round, pickInRound, draftPosition };
}
```

Round 1: positions 1,2,3…9. Round 2: 9,8,7…1. **No linear or keeper mode is implemented.**

### The reconciler — heart of the system

```ts
// lib/draftOrder.ts
export async function advanceDraftState(poolId: string): Promise<DraftStateSummary> {
  const entrants = await loadOrderedEntrants(poolId);
  const entrantCount = entrants.length;
  const maxPicks = entrantCount * PICKS_PER_ENTRANT;
  const state = await loadDraftStateRecord(poolId);
  const totalPicks = await countDraftPicks(poolId);

  if (!state?.draft_started) {
    return buildSummaryFromState(entrants, totalPicks, false, totalPicks + 1, null, null);
  }

  let currentPick = state.current_pick ?? 1;
  let turnStartedAt = state.turn_started_at ?? null;
  let turnExpiresAt = state.turn_expires_at ?? null;

  // If a real pick has already been recorded for the current slot, advance the
  // pointer before evaluating the next on-clock entrant. This preserves skipped
  // turns because skipped slots push currentPick ahead of totalPicks.
  if (totalPicks >= currentPick) {
    currentPick = totalPicks + 1;
    turnStartedAt = null;
    turnExpiresAt = null;
  }

  while (currentPick <= maxPicks) {
    if (!isDraftWindowOpen()) {
      // pause: upsert state with no turn timer, return
      const pausedSummary = buildSummaryFromState(entrants, await countDraftPicks(poolId), true, currentPick, turnStartedAt, turnExpiresAt);
      await upsertDraftState(poolId, {
        draft_started: true,
        current_pick: pausedSummary.current_pick ?? 1,
        current_round: pausedSummary.current_round ?? 1,
        current_entrant_id: pausedSummary.current_entrant_id,
        turn_started_at: turnStartedAt,
        turn_expires_at: turnExpiresAt,
      });
      return pausedSummary;
    }

    const summary = buildSummaryFromState(entrants, await countDraftPicks(poolId), true, currentPick, turnStartedAt, turnExpiresAt);
    if (summary.is_complete || !summary.current_entrant_id) break;

    const currentEntrant = entrants.find((e) => e.entrant_id === summary.current_entrant_id) ?? null;
    if (!currentEntrant) break;

    if (currentEntrant.auto_draft_enabled) {
      const golfer = await getHighestAvailableGolfer(poolId);
      if (golfer) await insertAutoPick(poolId, currentEntrant, golfer);
      currentPick += 1;
      turnStartedAt = null; turnExpiresAt = null;
      continue;
    }

    const expiresAtMs = turnExpiresAt ? Date.parse(turnExpiresAt) : NaN;
    if (turnExpiresAt && Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()) {
      await setEntrantAutoDraftEnabled(poolId, currentEntrant.entrant_id, true);
      turnStartedAt = null; turnExpiresAt = null;
      continue; // loop again — they're now auto-drafting
    }

    if (!turnExpiresAt || state.current_entrant_id !== currentEntrant.entrant_id) {
      const now = new Date();
      turnStartedAt = now.toISOString();
      turnExpiresAt = addDraftActiveSeconds(now, TURN_DURATION_SECONDS).toISOString();
    }

    // upsert + return liveSummary
    const liveSummary = buildSummaryFromState(entrants, await countDraftPicks(poolId), true, currentPick, turnStartedAt, turnExpiresAt);
    await upsertDraftState(poolId, {
      draft_started: true,
      current_pick: liveSummary.current_pick ?? 1,
      current_round: liveSummary.current_round ?? 1,
      current_entrant_id: liveSummary.current_entrant_id,
      turn_started_at: turnStartedAt,
      turn_expires_at: turnExpiresAt,
    });
    return liveSummary;
  }

  // Completion path:
  const finalSummary = buildSummaryFromState(entrants, await countDraftPicks(poolId), true, maxPicks + 1, null, null);
  await upsertDraftState(poolId, {
    draft_started: true,
    current_pick: maxPicks + 1, current_round: PICKS_PER_ENTRANT,
    current_entrant_id: null, turn_started_at: null, turn_expires_at: null,
  });
  await lockDraftForPool(poolId);     // tournament_meta.draft_open = false
  return finalSummary;
}
```

Key properties:
- **Idempotent.** Calling it twice in a row is safe; derives state from the source of truth (`count(draft_picks)` + `draft_state.current_pick`).
- **Self-healing skip.** If `totalPicks >= currentPick` it jumps forward — a missed slot doesn't deadlock the draft.
- **Timer accounting respects the 6 AM – 11 PM Pacific window.** `addDraftActiveSeconds` walks through closed windows, jumps to the next open dawn, and continues subtracting "active seconds."
- **No undo endpoint.** `POST /api/draft-picks/remove` is only allowed when `total_picks === 0`.

### Pause / resume / reset endpoints

| Endpoint | Effect |
|---|---|
| `POST /api/admin/draft-state { draft_open: true }` | Verifies exactly 9 entrants, upserts `tournament_meta`, calls `syncDraftState(true)` then `advanceDraftState()`, broadcasts `draft_opens` email + SMS |
| `POST /api/admin/draft-state { draft_open: false }` | Pauses: keeps pointer, clears `turn_started_at` / `turn_expires_at` |
| `POST /api/draft-picks/reset` | Admin-only. Wipes `draft_picks` for pool + `syncDraftState(false)` |
| `POST /api/admin/draft-reset` | Stronger reset: also deletes `draft_state` row, clears all `auto_draft_enabled`, flips `tournament_meta.draft_open = false` |

---

## 2) Data model

### `draft_entrants`

```sql
create table if not exists public.draft_entrants (
  entrant_id        uuid primary key default gen_random_uuid(),
  pool_id           text not null,
  entrant_name      text not null,
  entrant_slug      text not null,
  draft_position    integer,
  access_code_hash  text not null,
  access_code_hint  text,
  is_admin          boolean not null default false,
  auto_draft_enabled boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (pool_id, entrant_name),
  unique (pool_id, entrant_slug)
);
create index if not exists draft_entrants_pool_position_idx
  on public.draft_entrants (pool_id, draft_position);
```

Later migrations also add `welcomed_at`, `person_key`, `google_email` columns.

### `draft_sessions` — opaque cookie token, server stores hash

```sql
create table if not exists public.draft_sessions (
  session_id uuid primary key default gen_random_uuid(),
  pool_id text not null,
  entrant_id uuid not null references public.draft_entrants(entrant_id) on delete cascade,
  session_token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
```

### `draft_state` — single-row-per-pool pointer

```sql
create table if not exists public.draft_state (
  pool_id              text primary key,
  draft_started        boolean not null default false,
  current_pick         integer not null default 1,
  current_round        integer not null default 1,
  current_entrant_id   uuid references public.draft_entrants(entrant_id) on delete set null,
  turn_started_at      timestamptz,
  turn_expires_at      timestamptz,
  updated_at           timestamptz not null default now()
);
create index if not exists draft_state_current_entrant_idx
  on public.draft_state (current_entrant_id);
```

### `draft_picks`

```sql
create table if not exists public.draft_picks (
  pool_id text not null,
  entrant_name text not null,
  golfer text not null,
  pick_number integer not null check (pick_number between 1 and 6),
  primary key (pool_id, entrant_name, golfer),
  unique (pool_id, golfer),                      -- one drafter per player
  unique (pool_id, entrant_name, pick_number)    -- no dup pick numbers per entrant
);
-- later migration adds:
alter table public.draft_picks add column if not exists entrant_id uuid;
-- + FK + a unique index on (pool_id, entrant_id, pick_number)
```

For football: replace `golfer` with `player_id`, add `slot` (QB/RB/WR/TE/FLEX/BENCH) and `via` ('user' | 'auto' | 'queue').

### `golfers` (player pool — replace with `players` for football)

```sql
create table if not exists public.golfers (
  pool_id text not null,
  rank integer not null,
  golfer text not null,
  handicap numeric not null,
  primary key (pool_id, golfer)
);
create unique index golfers_pool_rank_uniq on public.golfers (pool_id, rank);
```

### `tournament_meta` — holds the per-pool `draft_open` lock

```sql
create table if not exists public.tournament_meta (
  pool_id text not null,
  tournament_slug text not null,
  round_count integer not null default 4,
  round_par numeric not null default 72,
  draft_open boolean not null default false,
  primary key (pool_id, tournament_slug)
);
```

### `draft_lottery` (optional pre-draft to assign `draft_position`)

```sql
create table if not exists public.draft_lottery (
  lottery_id    uuid primary key default gen_random_uuid(),
  pool_id       text not null unique,
  scheduled_at  timestamptz,
  started_at    timestamptz,
  status        text not null default 'pending',   -- 'pending' | 'completed'
  result        jsonb,                              -- [{entrant_id, entrant_name, draft_position}]
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
```

### `notification_log` (closest thing to an audit table)

```sql
create table if not exists public.notification_log (
  notif_id uuid primary key default gen_random_uuid(),
  entrant_id uuid not null references public.draft_entrants(entrant_id) on delete cascade,
  channel text not null check (channel in ('email','sms','push')),
  kind text not null,           -- 'draft_opens' | 'draft_turn' | etc
  subject text,
  payload jsonb,
  sent_at timestamptz not null default now(),
  provider_msg_id text,
  error text
);
```

**No dedicated draft audit/event log table exists.** Pick history is reconstructed from `draft_picks` itself. The rebuild should add a `draft_events` table for admin actions, undo, and clickstream.

---

## 3) Player import

The live golf draft is hand-seeded:

```sql
insert into public.golfers (pool_id, rank, golfer, handicap)
values
  ('2026-majors', 1, 'Scottie Scheffler', 2.1),
  ('2026-majors', 2, 'Rory McIlroy', 2.3)
on conflict (pool_id, golfer) do update
set rank = excluded.rank, handicap = excluded.handicap;
```

**Available-vs-drafted** is computed on the fly:

```ts
// lib/draftOrder.ts
async function getHighestAvailableGolfer(poolId: string) {
  const [{ data: golfers }, { data: picks }] = await Promise.all([
    supabaseAdmin.from("golfers").select("golfer, rank").eq("pool_id", poolId).order("rank", { ascending: true }),
    supabaseAdmin.from("draft_picks").select("golfer").eq("pool_id", poolId),
  ]);
  const picked = new Set((picks ?? []).map((row) => row.golfer as string));
  return (golfers ?? []).find((row) => !picked.has(row.golfer as string))?.golfer as string | undefined;
}
```

Client-side search filter:

```ts
// app/draft/page.tsx
const visibleGolfers = useMemo(() => {
  const q = query.trim().toLowerCase();
  return golfers.filter((g) => {
    if (pickedGolferIds.has(g.golfer)) return false;
    if (!q) return true;
    return g.golfer.toLowerCase().includes(q);
  });
}, [golfers, pickedGolferIds, query]);
```

**ID/dedupe:** the existing schema uses player name as the natural key (`unique (pool_id, golfer)`). Too fragile for football — adopt the NFL prototype shape from `scripts/import_pool_players_tsdb_v2_list.py`:

```python
player_rows.append({
  "pool_id": POOL_ID,
  "player_id": str(pid),         # TheSportsDB idPlayer
  "player_name": pname,
  "pos": pos,                    # QB / RB / WR / TE
  "team_id": team_id,
  "team_abbr": meta.get("team_abbr"),
  "conference": meta.get("conference"),
})
supabase.table("pool_players").upsert(player_rows[i:i+BATCH]).execute()
```

ALLOWED_POS set in the script: `{"QB", "RB", "WR", "TE"}`.

**ADP / rankings:** only `rank` column exists. No third-party ADP feed is wired in. Add an `adp numeric` column on `pool_players` and a sync job for the football rebuild.

---

## 4) Real-time / multi-user

**No Supabase Realtime. No WebSocket. No SSE.** All sync is HTTP polling:

```ts
// app/draft/page.tsx
const refreshTick = useAutoRefreshValue(30000, draftOpen);  // 30 s while draft open

// lib/useAutoRefresh.ts
export function useAutoRefreshValue(intervalMs: number, enabled = true) {
  const [refreshTick, setRefreshTick] = useState(0);
  useEffect(() => {
    if (!enabled || intervalMs <= 0) return;
    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;  // pause when tab hidden
      setRefreshTick((value) => value + 1);
    }, intervalMs);
    return () => window.clearInterval(intervalId);
  }, [enabled, intervalMs]);
  return refreshTick;
}
```

Plus a 1-second `clockTick` interval just to re-render the turn countdown.

### Concurrency / race prevention on a pick

Three lines of defense:

1. **Authoritative re-derivation** at the top of `POST /api/draft-picks/add`:
   ```ts
   const draftState = await advanceDraftState(poolId);
   if (draftState.current_entrant_id !== session.entrant.entrant_id) {
     return NextResponse.json(
       { error: `It is currently ${draftState.current_entrant_name ?? "another entrant"}'s turn.` },
       { status: 409 }
     );
   }
   ```
2. **Per-pool draft-open gate** (`getDraftOpenState(poolId)` returns `meta.draft_open && isDraftWindowOpen()`).
3. **Database-level uniqueness** — `draft_picks` has `unique (pool_id, golfer)` so two concurrent picks of the same player surface as:
   ```ts
   const duplicateGolfer = insertError.message.toLowerCase().includes("pool_id, golfer");
   if (duplicateGolfer) {
     return NextResponse.json(
       { error: "That player has already been drafted." },
       { status: 409 }
     );
   }
   ```

"On the clock" is determined entirely by the server in `buildSummaryFromState` from the snake-order math:

```ts
const position = snakeDraftPosition(currentPick, entrantCount);
const currentEntrant = entrants.find((e) => e.draft_position === position.draftPosition) ?? null;
```

Broadcast = client polls `/api/draft-state` and re-renders.

---

## 5) Clickstream / event logging

**Not implemented.** The only log surface is `notification_log` (one row per email/SMS attempt with provider message id or error). No table tracks pick events, login events, or UI interactions.

For the football rebuild, add:

```sql
create table draft_events (
  event_id uuid primary key default gen_random_uuid(),
  draft_id uuid not null,
  kind text not null,         -- 'pick' | 'auto_pick' | 'time_out' | 'pause' | 'resume' | 'reset' | 'login'
  entrant_id uuid,
  payload jsonb,
  occurred_at timestamptz not null default now()
);
create index draft_events_draft_time_idx on draft_events (draft_id, occurred_at desc);
```

Write to it from `add`, `admin/draft-state`, and the timeout/auto-pick branch in `advanceDraftState`.

---

## 6) Notifications

### Channels

- **Email** via Resend
- **SMS** via Twilio
- **Push:** schema has `channel in ('email','sms','push')` but no implementation
- **In-app:** no — the draft tab is the in-app surface

### Triggers

| Event | Where fired | Template |
|---|---|---|
| `draft_opens` | `app/api/admin/draft-state/route.ts` after `draft_open: true` | `renderDraftOpens` + `smsDraftOpens` |
| `draft_turn` (your-turn) | **Templates exist but no trigger ships them** — dead-letter in the live flow. Fire on every `current_entrant_id` change in the rebuild. |

### Templates verbatim

```ts
// lib/notifications/templates.ts
export function renderDraftOpens(event: { name: string; slug: string }, baseUrl: string): RenderedEmail {
  const subject = `Draft open — ${event.name}`;
  const html = wrap(
    `<p style="color:#eaeaea;font-size:14px;line-height:1.5;">The ${event.name} draft just opened. Hop into the draft room to set up your roster and auto-draft.</p>`,
    { title: "Draft is open", preheader: subject, cta: { href: `${baseUrl}/draft`, label: "Open draft room" } },
  );
  const text = `${event.name} draft just opened. Visit ${baseUrl}/draft`;
  return { subject, html, text };
}

export function renderDraftTurn(event: { name: string }, baseUrl: string): RenderedEmail {
  const subject = `You're on the clock — ${event.name}`;
  const html = wrap(
    `<p style="color:#eaeaea;font-size:14px;line-height:1.5;">It's your pick in the ${event.name} draft. Head to the draft room to lock one in.</p>`,
    { title: "You're on the clock", preheader: subject, cta: { href: `${baseUrl}/draft`, label: "Make your pick" } },
  );
  const text = `You're on the clock in the ${event.name} draft. ${baseUrl}/draft`;
  return { subject, html, text };
}
```

```ts
// lib/notifications/smsTemplates.ts
export function smsDraftOpens(event: { name: string }, baseUrl: string): RenderedSms {
  return { body: `Decathlon: ${event.name} draft is OPEN. ${shortUrl(baseUrl, "/draft")}` };
}
export function smsDraftTurn(event: { name: string }, baseUrl: string): RenderedSms {
  return { body: `Decathlon: you're on the clock — ${event.name}. ${shortUrl(baseUrl, "/draft")}` };
}
```

### Per-user opt-in defaults

```json
{
  "draft_opens": true,
  "draft_turn": true,
  "turn_timer_warn": true,
  "sms": {
    "draft_opens": false,
    "draft_turn": true,
    "turn_timer_warn": true,
    "event_lock": true,
    "event_final": false,
    "hot_seat_declared": false,
    "hot_seat_veto": true,
    "season_digest": false
  }
}
```

`sendNotification` checks `prefs[kind]` for email and `prefs.sms[kind]` for SMS, then writes to `notification_log` either way (success rows carry `provider_msg_id`, failure rows carry `error`).

---

## 7) Export / Yahoo integration

**None exists.** No CSV export route, no Yahoo OAuth, no `application/csv` response anywhere. The only Yahoo reference in the repo is a roadmap bullet in docs ("Cross-platform linking to ESPN / Yahoo / Sleeper accounts").

For the rebuild, add:

```
GET /api/drafts/:id/export?format=yahoo
  → CSV: Pick, Round, Manager, Player, Team, Position
```

Yahoo's offline-draft import expects that exact column set in row 1 of the CSV.

---

## 8) UX / screens

Single page: `app/draft/page.tsx` (~759 lines, client component).

### Sections rendered

1. **Header banner** with one of:
   - "You're on the clock" (badge + countdown)
   - "{name} is on the clock"
   - "Draft complete"
   - "Waiting for draft to open"
   - Subtext: `Pick {n} of {max} · Round {r} · {hh:mm:ss} on clock`
2. **My summary row** — name, picks-used / 6, auto-draft toggle, sign-out
3. **My picks chip strip** (1. player, 2. player, …)
4. **Player Pool** — search input + mobile list + desktop table; each row's button is one of:
   ```
   Sign in | Locked | Done | Draft | Wait
   ```
   depending on `(sessionEntrant, draftOpen, isOnClock, picked, activeIsFull, is_complete)`. Picked players are filtered out (not just disabled).
5. **Draft Summary grid** — one card per entrant with their 6 picks
6. **Admin reset button** at the bottom (only if `is_admin`)

### Action button logic

```ts
const canPick =
  Boolean(sessionEntrant) && draftOpen && isOnClock &&
  !picked && !activeIsFull && !savingPicks && !draftState?.is_complete;

const buttonLabel = !sessionEntrant ? "Sign in"
                  : picked ? "Locked"
                  : !draftOpen ? "Locked"
                  : draftState?.is_complete ? "Done"
                  : isOnClock ? "Draft" : "Wait";
```

**Missing in source, needed for football:** drag-and-drop queue, positional filters, roster slot indicators, bye-week conflict warnings, watchlist.

---

## 9) Auth & roles

### Authentication

- **Access-code login** via `POST /api/auth/entrant-login`. Server stores only `access_code_hash` (SHA-256). Cookie carries a 32-byte opaque token; DB stores its hash. 14-day TTL.
- **Google OAuth bridge** via `POST /api/auth/google/callback` + `linkGoogleAccount`. Lets one Google login resolve a `person_key` across multiple pools.

```ts
// lib/draftAuth.ts (cross-pool resolution)
let entrant = sessionEntrant;
if (poolId && session.pool_id !== poolId) {
  if (!sessionEntrant.person_key) return null;
  const crossPoolEntrant = await loadEntrantByPersonKeyAndPool(sessionEntrant.person_key, poolId);
  if (!crossPoolEntrant) return null;
  entrant = crossPoolEntrant;
}
```

```ts
// lib/draftAuth.ts (hashing)
export function hashSecret(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
export function generateOpaqueToken() {
  return crypto.randomBytes(32).toString("hex");
}
export function generateAccessCode(length = 8) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(length);
  let code = "";
  for (let i = 0; i < length; i += 1) {
    code += alphabet[bytes[i] % alphabet.length];
  }
  return code;
}
```

### Roles

Only two: `is_admin` boolean on `draft_entrants`, plus "anyone else." No separate commissioner table. Admin vs. manager:

| Capability | Manager | Admin |
|---|:---:|:---:|
| Sign in | ✅ | ✅ |
| Make a pick (when on clock & draft open) | ✅ | ✅ |
| Toggle own `auto_draft_enabled` | ✅ | ✅ |
| Toggle *another* entrant's auto-draft | ❌ | ✅ |
| Open/close draft (`POST /api/admin/draft-state`) | ❌ | ✅ |
| Reset draft picks (`POST /api/draft-picks/reset`) | ❌ | ✅ |
| Full pool reset (`POST /api/admin/draft-reset`) | ❌ | ✅ |
| Start lottery (`POST /api/lottery/start`) | ❌ | ✅ |
| Edit entrant access code | ❌ | ✅ |

Every admin route uses:

```ts
const session = await getAuthenticatedEntrant(poolId);
if (!session) return 401;
if (!session.entrant.is_admin) return 403;
```

---

## 10) Config knobs

All in `lib/draftOrder.ts`:

```ts
export const PICKS_PER_ENTRANT       = 6;     // → rounds per entrant
export const EXPECTED_ENTRANT_COUNT  = 9;     // hard-coded; admin route refuses to open with !== 9
export const TURN_DURATION_SECONDS   = 60 * 60 * 2;
export const DRAFT_TIME_ZONE         = "America/Los_Angeles";
export const DRAFT_OPEN_HOUR         = 6;
export const DRAFT_CLOSE_HOUR        = 23;
```

Pool id resolution per route:
```ts
const poolId = url.searchParams.get("pool_id")
            || process.env.POOL_ID
            || process.env.NEXT_PUBLIC_POOL_ID
            || "2026-majors";
```
Draft page combines pool + tournament: `${basePoolId}-${selectedTournament}`. Tournaments are a hard-coded list.

**Positions / position limits / roster slots are not modeled.** Picks are just an ordered list per entrant. For football, add a `position` column on the player table and a `roster_template` JSON describing slot counts.

---

## 11) Stack & deps

```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.90.1",
    "next": "16.1.1",
    "react": "19.2.3",
    "react-dom": "19.2.3"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "autoprefixer": "^10.4.23",
    "eslint": "^9",
    "eslint-config-next": "16.1.1",
    "postcss": "^8.5.6",
    "tailwindcss": "^3.4.19",
    "typescript": "^5"
  }
}
```

That's the **entire** dep tree. No swr, no react-query, no socket.io, no zod. Hand-rolled fetch + `useState` + 30-second polling. Two service-provider SDKs live as ad-hoc fetch wrappers (`lib/notifications/resend.ts`, `lib/notifications/twilio.ts`).

### Env / secrets

| Var | Used by |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Both browser and server clients |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser client |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only client (`lib/supabaseAdmin.ts`) |
| `NEXT_PUBLIC_POOL_ID`, `POOL_ID` | Default pool slug |
| `RESEND_API_KEY`, `RESEND_FROM` | Email |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | SMS |
| `NEXT_PUBLIC_APP_URL` | Email/SMS CTA links |
| `THESPORTSDB_API_KEY` | Python NFL import scripts |

---

## (a) Plain-English start-to-finish

1. **Setup.** Commissioner runs SQL migrations and seeds `draft_entrants` with N rows for the pool (`pool_id`, `entrant_name`, `entrant_slug`, an `access_code_hash` of a freshly-generated 8-char code, and one row flipped to `is_admin = true`). They also seed the player pool.
2. **Each player signs in.** Visit `/sign-in`, type their entrant slug + access code; the server compares SHA-256 hashes; an opaque token gets dropped into the `draft_session` cookie (14 days).
3. **Draft positions.** Either set manually in `draft_entrants.draft_position`, or run the lottery: admin hits `POST /api/lottery/start` which shuffles all entrants, assigns `draft_position` 1..N, and persists the reveal order in `draft_lottery.result` (jsonb).
4. **Commissioner opens the draft.** `POST /api/admin/draft-state { draft_open: true }`. Server verifies entrant count, upserts `tournament_meta`, calls `syncDraftState(poolId, true)` → `advanceDraftState(poolId)` (which sets the 2-hour timer, clamped to the open window). A `draft_opens` email + SMS broadcast goes out via Resend + Twilio.
5. **Clients poll.** Page calls `/api/draft-state` every 30 s while open and a local 1-second timer for the countdown. Picked players disappear from the board; everyone sees the same on-clock state because the server derives it fresh on every poll.
6. **Making a pick.** The on-clock entrant taps Draft → `POST /api/draft-picks/add { pool_id, player }`. The server: (a) re-derives state via `advanceDraftState`, (b) refuses with 409 if not actually on the clock, (c) verifies the player exists in the pool and isn't drafted, (d) inserts the row with `pick_number = existing_picks + 1`, (e) catches the unique-violation race for the player, (f) calls `advanceDraftState` again to point the cursor at the next entrant and start their 2-hour timer.
7. **Auto-draft.** Any entrant can flip `auto_draft_enabled` for themselves (admin can do it for anyone). When their turn comes the reconciler grabs the lowest-rank undrafted player and inserts the pick.
8. **Time-out.** If `turn_expires_at` passes (in business-hours-only seconds), the reconciler flips that entrant's `auto_draft_enabled = true` and immediately auto-picks. They stay in auto-draft mode going forward.
9. **Closed-window pause.** Outside the open window, `isDraftWindowOpen()` returns false and `advanceDraftState` returns the paused summary without consuming clock time. Clients show "Paused."
10. **Completion.** When `currentPick > entrantCount * PICKS_PER_ENTRANT`, the reconciler upserts the final state, sets `current_entrant_id = null`, and calls `lockDraftForPool`. UI flips to "Draft complete."
11. **Reset.** Admin can clear picks (`/api/draft-picks/reset`) or wipe everything back to pre-draft (`/api/admin/draft-reset`). No per-pick undo after the first pick.

---

## (b) Reuse vs rebuild

### Port verbatim (drop-in ready)

- **`lib/draftOrder.ts`** — snake math, the reconciler, business-hours timer accounting. The cleanest single asset in this repo.
- **`lib/draftAuth.ts`** — hashed access codes, opaque-token cookies, server-side session hash storage. Identical pattern works for any small private pool.
- **`supabase/draft_turns_patch.sql`** (`draft_state` table) and **`supabase/entrant_auth_schema.sql`** (entrants + sessions). One-to-one reuse.
- **The pick endpoint pattern** (`app/api/draft-picks/add/route.ts`) — auth → state re-derive → cursor check → DB unique constraint → re-derive again. Solid template.
- **The polling hook** (`lib/useAutoRefresh.ts`) — tiny, document-visibility-aware. Fine starter.
- **Notification scaffolding** (`lib/notifications/{send,templates,smsTemplates,resend,twilio}.ts`) — Resend + Twilio wrappers with prefs + logging.
- **Draft lottery flow** (`app/api/lottery/start/route.ts` + `supabase/20260509_draft_lottery.sql`) — reveal-order shuffle worth keeping.

### Rebuild for football

- **`draft_picks` schema.** Replace `(pool_id, entrant_name, golfer)` PK with `(draft_id, pick_number)` PK and a `(draft_id, player_id)` UNIQUE. Use `entrant_id` (not name). Add columns: `slot` (QB/RB/FLEX/etc), `via` ('user' | 'auto' | 'queue').
- **Player model.** Drop name-keyed `golfers`. Use `pool_players { pool_id, player_id PK, player_name, pos, team_id, team_abbr, conference, adp numeric, byes int[], status text }`.
- **Positions + roster template.** Currently zero. Add `league_settings { draft_id, roster jsonb, scoring jsonb, rounds, clock_seconds, pause_window jsonb }` and enforce slot fit on `add`.
- **Hard-coded `EXPECTED_ENTRANT_COUNT = 9`.** Replace with a per-draft `expected_entrants` column.
- **Draft event log.** Add `draft_events` table and write at every `add` / open / close / time-out / admin action. Powers undo, audit, and the future clickstream.
- **Undo.** Current "remove pick" is only allowed pre-start. Real fantasy needs admin pick-revoke and reorder; build off the event log.
- **Polling → Realtime.** `useAutoRefresh(30000)` is fine to ship; swap to Supabase Realtime subscription on `draft_picks` and `draft_state` for snappier UI under load.
- **Your-turn notifications.** `renderDraftTurn` / `smsDraftTurn` exist but are never invoked. Fire them from `advanceDraftState` whenever `current_entrant_id` changes (debounce on no-op writes).
- **Yahoo / CSV export.** Not present. Build a `GET /api/drafts/:id/export?format=yahoo` route emitting Yahoo offline-draft CSV (`Pick, Round, Manager, Player, Team, Position`).
- **Clickstream.** None exists; pick a vendor (PostHog, Mixpanel) or roll your own `draft_events` writer.
- **Push notifications.** Schema allows `'push'` channel but there's no PWA / FCM / APNS code.
- **Drag-and-drop draft queue + positional filters + bye-week conflicts.** All missing, all expected in modern fantasy football drafts.
