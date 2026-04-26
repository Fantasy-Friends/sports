# 2026 Masters — draft import

Canonical record of the 2026 Masters pool draft. 9 entrants, 6 picks each, 54 total picks.

## Files

| File | Purpose |
|---|---|
| `draft-log.json` | Source-of-truth JSON. Human-readable record; generated from the commissioner's draft summary on 2026-04-21. Not loaded by any code; safe to edit for future reference, but re-run the SQL if you do. |
| `import.sql` | Idempotent SQL that upserts entrants, golfers, and picks into the live Supabase instance. Wrapped in a transaction with post-import sanity checks. |

## What the import does

1. Ensures `tournament_meta` row exists for `pool_id = '2026-majors-masters'`, `tournament_slug = 'masters'`, `round_count = 4`, `round_par = 72`, `draft_open = false`.
2. Upserts 9 rows into `draft_entrants` for the pool, with first-name slugs and `draft_position` 1–9.
3. Inserts 54 rows into `golfers` for the pool, with `handicap = 0` placeholder and a deterministic rank.
4. Upserts 54 rows into `draft_picks` with entrant_id joined via slug.
5. Runs three sanity checks (9 entrants, 54 picks, 54 distinct golfers). Raises on mismatch and rolls back the transaction.

## Known placeholders after import

These three things are intentionally **not** set by the import — they need commissioner action.

### Access codes

Every entrant gets `access_code_hash = 'imported-pending-reset'`, which will never validate any real access code. Sign-in is blocked until you generate codes.

**Fix**: `/admin` → Entrant Access → **Generate / Reset Code** for each of the 9 entrants. Send each person their code.

### Handicaps

Every golfer gets `handicap = 0`. This skews the net leaderboard (net = gross − handicap) until real handicaps are loaded.

**Fix**: `/admin` → Odds and Handicap Sync → **Sync Odds + Handicaps** with the Masters selected. Pulls from The Odds API and upserts real handicaps into `golfers`.

### Admin flag

No entrant has `is_admin = true`. The `/admin` page will be inaccessible to everyone until you promote one.

**Fix**: via Supabase SQL editor:

```sql
update public.draft_entrants
set is_admin = true
where pool_id = '2026-majors-masters' and entrant_slug = 'dusty'; -- or whichever slug is the commissioner
```

## How to run

### Option A: Supabase SQL editor (recommended)

1. Open the Supabase dashboard for the production project
2. SQL Editor → New query
3. Paste the contents of `import.sql`
4. Run

The whole thing is in a `BEGIN/COMMIT` block. If any sanity check fails, nothing is written.

### Option B: `psql` from a dev machine

```bash
psql "$SUPABASE_DB_URL" -f supabase/seeds/2026-masters/import.sql
```

Requires `SUPABASE_DB_URL` to point at the prod database with a user that can write `public.draft_entrants`, `public.golfers`, `public.draft_picks`, and `public.tournament_meta`.

## Post-import checklist

- [ ] 9 entrants visible at `/admin` → Entrant Access
- [ ] 54 golfers visible at `/draft` (Golfer Pool table)
- [ ] Draft Summary at `/draft` shows 6/6 picks for all 9 entrants
- [ ] Commissioner's `is_admin` flag flipped
- [ ] Access codes regenerated and distributed
- [ ] Odds + handicaps synced for Masters
- [ ] `/leaderboard` shows sensible net totals (not all zeros)
- [ ] `/tournament` shows a leaderboard (requires a Slash Golf score sync if tournament is scored)

## Reconciling with live data

If the live Supabase already has a `2026-majors-masters` draft with different data:

- Entrants: the import upserts by `(pool_id, entrant_name)`. A name that already exists keeps its `entrant_id` and `access_code_hash`; only `entrant_slug`, `draft_position`, and `updated_at` are overwritten.
- Golfers: upsert is `on conflict do nothing`, so existing handicap/rank values are **preserved**. This means re-running after an odds sync won't zero out handicaps.
- Picks: upsert on `(pool_id, entrant_name, golfer)` — the identity of each pick. If live data has a pick for a golfer that's in this import, the pick_number is updated. Picks that exist live but are NOT in this import are **not touched** — they'll linger. If you want a clean reimport, first run:

  ```sql
  delete from public.draft_picks where pool_id = '2026-majors-masters';
  ```

## Changelog

- **2026-04-21** — Initial import. Source: commissioner-provided draft summary pasted into the build session.
