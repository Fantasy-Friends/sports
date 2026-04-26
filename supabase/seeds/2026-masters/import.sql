-- 2026 Masters draft — canonical import.
--
-- Pool: 2026-majors-masters
-- 9 entrants, 6 picks each (54 picks), snake-draft inferred from commissioner
-- summary. Source of truth: ./draft-log.json.
--
-- Idempotent: safe to re-run. Upserts leave existing data intact except for
-- the fields this script sets.
--
-- Access codes: this script inserts placeholder access_code_hash =
-- 'imported-pending-reset' for each entrant. That value will NEVER validate
-- against any real code, so sign-in will fail until the commissioner runs
-- /admin → Entrant Access → Generate / Reset Code for each entrant.
--
-- Golfer handicaps: inserted as 0 placeholder. Run /admin → Odds and Handicap
-- Sync for the masters tournament to overwrite with real values from The
-- Odds API.
--
-- is_admin: none set. Flip the commissioner's row manually after running.

begin;

-- ---------------------------------------------------------------------------
-- Ensure tournament_meta row exists for this pool/tournament.
-- ---------------------------------------------------------------------------

insert into public.tournament_meta (pool_id, tournament_slug, round_count, round_par, draft_open)
values ('2026-majors-masters', 'masters', 4, 72, false)
on conflict (pool_id, tournament_slug) do nothing;

-- ---------------------------------------------------------------------------
-- Entrants. Slug is lowercase first-name; commissioner can rename display_name
-- post-import via Supabase dashboard if needed.
-- ---------------------------------------------------------------------------

insert into public.draft_entrants (
  pool_id, entrant_name, entrant_slug, draft_position,
  access_code_hash, access_code_hint, is_admin, auto_draft_enabled
)
values
  ('2026-majors-masters', 'Chris', 'chris', 1, 'imported-pending-reset', 'reset-me', false, false),
  ('2026-majors-masters', 'Vobe',  'vobe',  2, 'imported-pending-reset', 'reset-me', false, false),
  ('2026-majors-masters', 'Dusty', 'dusty', 3, 'imported-pending-reset', 'reset-me', false, false),
  ('2026-majors-masters', 'Thom',  'thom',  4, 'imported-pending-reset', 'reset-me', false, false),
  ('2026-majors-masters', 'Dan',   'dan',   5, 'imported-pending-reset', 'reset-me', false, false),
  ('2026-majors-masters', 'Cody',  'cody',  6, 'imported-pending-reset', 'reset-me', false, false),
  ('2026-majors-masters', 'Wes',   'wes',   7, 'imported-pending-reset', 'reset-me', false, false),
  ('2026-majors-masters', 'Rod',   'rod',   8, 'imported-pending-reset', 'reset-me', false, false),
  ('2026-majors-masters', 'Nate',  'nate',  9, 'imported-pending-reset', 'reset-me', false, false)
on conflict (pool_id, entrant_name) do update
set
  entrant_slug = excluded.entrant_slug,
  draft_position = excluded.draft_position,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- Golfers. Handicap = 0 placeholder (override via admin odds sync).
--
-- The golfers table has TWO unique constraints: primary key (pool_id, golfer)
-- and a separate unique index on (pool_id, rank). If we hard-coded ranks 1..54
-- they could collide with whatever ranks an earlier odds sync already assigned
-- to golfers still in the pool. So we compute an offset from the current max
-- rank, meaning new rows are appended past the existing range and cannot
-- collide. Existing golfers (primary key match) are left untouched — their
-- real synced rank and handicap survive a re-run.
-- ---------------------------------------------------------------------------

with rank_base as (
  select coalesce(max(rank), 0) as base
  from public.golfers
  where pool_id = '2026-majors-masters'
),
golfer_rows (ord, golfer) as (
  values
    ( 1, 'Scottie Scheffler'),
    ( 2, 'Bryson DeChambeau'),
    ( 3, 'Rory McIlroy'),
    ( 4, 'Jon Rahm'),
    ( 5, 'Xander Schauffele'),
    ( 6, 'Tommy Fleetwood'),
    ( 7, 'Ludvig Aberg'),
    ( 8, 'Cameron Young'),
    ( 9, 'Justin Rose'),
    (10, 'Viktor Hovland'),
    (11, 'Christopher Gotterup'),
    (12, 'Jordan Spieth'),
    (13, 'Min Woo Lee'),
    (14, 'Hideki Matsuyama'),
    (15, 'Robert Macintyre'),
    (16, 'Collin Morikawa'),
    (17, 'Matthew Fitzpatrick'),
    (18, 'Brooks Koepka'),
    (19, 'Patrick Reed'),
    (20, 'Adam Scott'),
    (21, 'Shane Lowry'),
    (22, 'Tyrrell Hatton'),
    (23, 'Si Woo Kim'),
    (24, 'Corey Conners'),
    (25, 'Akshay Bhatia'),
    (26, 'Patrick Cantlay'),
    (27, 'Gary Woodland'),
    (28, 'Sungjae Im'),
    (29, 'Russell Henley'),
    (30, 'Cameron Smith'),
    (31, 'J. J. Spaun'),
    (32, 'Nicolai Hojgaard'),
    (33, 'Jason Day'),
    (34, 'Justin Thomas'),
    (35, 'Jacob Bridgeman'),
    (36, 'Maverick Mcnealy'),
    (37, 'Sepp Straka'),
    (38, 'Brian Harman'),
    (39, 'Daniel Berger'),
    (40, 'Keegan Bradley'),
    (41, 'Max Homa'),
    (42, 'Harris English'),
    (43, 'Sam Burns'),
    (44, 'Ben Griffin'),
    (45, 'Casey Jarvis'),
    (46, 'Dustin Johnson'),
    (47, 'Alexander Noren'),
    (48, 'Ryan Fox'),
    (49, 'Sergio Garcia'),
    (50, 'Rasmus Hojgaard'),
    (51, 'Kurt Kitayama'),
    (52, 'Jake Knapp'),
    (53, 'Aaron Rai'),
    (54, 'Michael Kim')
)
insert into public.golfers (pool_id, rank, golfer, handicap)
select
  '2026-majors-masters',
  rank_base.base + golfer_rows.ord,
  golfer_rows.golfer,
  0
from golfer_rows, rank_base
on conflict (pool_id, golfer) do nothing;

-- ---------------------------------------------------------------------------
-- Picks. Uses a CTE that joins entrant_slug → entrant_id so we never hard-code
-- the generated UUIDs. Re-runs will overwrite pick_number for existing
-- (pool_id, entrant_name, golfer) rows — noop when data is unchanged.
-- ---------------------------------------------------------------------------

with entrant_lookup as (
  select entrant_id, entrant_slug, entrant_name
  from public.draft_entrants
  where pool_id = '2026-majors-masters'
),
pick_rows (entrant_slug, pick_number, golfer) as (
  values
    ('chris', 1, 'Scottie Scheffler'),
    ('chris', 2, 'Viktor Hovland'),
    ('chris', 3, 'Patrick Reed'),
    ('chris', 4, 'Sungjae Im'),
    ('chris', 5, 'Sepp Straka'),
    ('chris', 6, 'Dustin Johnson'),

    ('vobe',  1, 'Bryson DeChambeau'),
    ('vobe',  2, 'Christopher Gotterup'),
    ('vobe',  3, 'Adam Scott'),
    ('vobe',  4, 'Russell Henley'),
    ('vobe',  5, 'Brian Harman'),
    ('vobe',  6, 'Alexander Noren'),

    ('dusty', 1, 'Rory McIlroy'),
    ('dusty', 2, 'Jordan Spieth'),
    ('dusty', 3, 'Shane Lowry'),
    ('dusty', 4, 'Cameron Smith'),
    ('dusty', 5, 'Daniel Berger'),
    ('dusty', 6, 'Ryan Fox'),

    ('thom',  1, 'Jon Rahm'),
    ('thom',  2, 'Min Woo Lee'),
    ('thom',  3, 'Tyrrell Hatton'),
    ('thom',  4, 'J. J. Spaun'),
    ('thom',  5, 'Keegan Bradley'),
    ('thom',  6, 'Sergio Garcia'),

    ('dan',   1, 'Xander Schauffele'),
    ('dan',   2, 'Hideki Matsuyama'),
    ('dan',   3, 'Si Woo Kim'),
    ('dan',   4, 'Nicolai Hojgaard'),
    ('dan',   5, 'Max Homa'),
    ('dan',   6, 'Rasmus Hojgaard'),

    ('cody',  1, 'Tommy Fleetwood'),
    ('cody',  2, 'Robert Macintyre'),
    ('cody',  3, 'Corey Conners'),
    ('cody',  4, 'Jason Day'),
    ('cody',  5, 'Harris English'),
    ('cody',  6, 'Kurt Kitayama'),

    ('wes',   1, 'Ludvig Aberg'),
    ('wes',   2, 'Collin Morikawa'),
    ('wes',   3, 'Akshay Bhatia'),
    ('wes',   4, 'Justin Thomas'),
    ('wes',   5, 'Sam Burns'),
    ('wes',   6, 'Jake Knapp'),

    ('rod',   1, 'Cameron Young'),
    ('rod',   2, 'Matthew Fitzpatrick'),
    ('rod',   3, 'Patrick Cantlay'),
    ('rod',   4, 'Jacob Bridgeman'),
    ('rod',   5, 'Ben Griffin'),
    ('rod',   6, 'Aaron Rai'),

    ('nate',  1, 'Justin Rose'),
    ('nate',  2, 'Brooks Koepka'),
    ('nate',  3, 'Gary Woodland'),
    ('nate',  4, 'Maverick Mcnealy'),
    ('nate',  5, 'Casey Jarvis'),
    ('nate',  6, 'Michael Kim')
)
insert into public.draft_picks (pool_id, entrant_id, entrant_name, golfer, pick_number)
select
  '2026-majors-masters',
  el.entrant_id,
  el.entrant_name,
  pr.golfer,
  pr.pick_number
from pick_rows pr
join entrant_lookup el on el.entrant_slug = pr.entrant_slug
on conflict (pool_id, entrant_name, golfer) do update
set pick_number = excluded.pick_number,
    entrant_id  = excluded.entrant_id;

-- ---------------------------------------------------------------------------
-- Sanity checks. Each of these should return 0 rows on a successful import.
-- ---------------------------------------------------------------------------

do $$
declare
  v_entrants integer;
  v_picks integer;
  v_unique_golfers integer;
begin
  select count(*) into v_entrants
  from public.draft_entrants
  where pool_id = '2026-majors-masters';

  select count(*) into v_picks
  from public.draft_picks
  where pool_id = '2026-majors-masters';

  select count(distinct golfer) into v_unique_golfers
  from public.draft_picks
  where pool_id = '2026-majors-masters';

  if v_entrants <> 9 then
    raise exception 'expected 9 entrants after import, found %', v_entrants;
  end if;
  if v_picks <> 54 then
    raise exception 'expected 54 picks after import, found %', v_picks;
  end if;
  if v_unique_golfers <> 54 then
    raise exception 'expected 54 distinct golfers drafted, found %', v_unique_golfers;
  end if;
end $$;

commit;
