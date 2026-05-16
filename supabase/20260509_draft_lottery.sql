-- Draft lottery: one row per pool, stores the scheduled time and final reveal result.
-- result is a JSONB array in reveal order: [{entrant_id, entrant_name, draft_position}]
-- where index 0 = position 9 (drawn first) and index N-1 = position 1 (winner, drawn last).

create table if not exists public.draft_lottery (
  lottery_id    uuid        primary key default gen_random_uuid(),
  pool_id       text        not null unique,
  scheduled_at  timestamptz,
  started_at    timestamptz,
  status        text        not null default 'pending', -- 'pending' | 'completed'
  result        jsonb,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

alter table public.draft_lottery enable row level security;
