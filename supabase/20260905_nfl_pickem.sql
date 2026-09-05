-- NFL Pick'em: weekly winner picks with confidence points.
-- One row per (season, week, entrant, game). Confidence is 1..N where N is
-- that week's game count (byes shrink the scale); each value usable once per
-- entrant per week — enforced by the unique index below plus API validation.
-- Schedule/odds come live from ESPN's public scoreboard API and are not
-- stored; game_id is ESPN's event id.

create table if not exists public.nfl_pickem_picks (
  season       smallint not null,
  week         smallint not null check (week between 1 and 18),
  entrant_id   uuid not null references public.draft_entrants(entrant_id) on delete cascade,
  game_id      text not null,
  picked_team  text not null,
  confidence   smallint not null check (confidence between 1 and 20),
  updated_at   timestamptz not null default now(),
  primary key (season, week, entrant_id, game_id)
);

create unique index if not exists nfl_pickem_confidence_unique
  on public.nfl_pickem_picks (season, week, entrant_id, confidence);

create index if not exists nfl_pickem_week_idx
  on public.nfl_pickem_picks (season, week);
