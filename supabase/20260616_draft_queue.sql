-- Per-entrant draft queue (personal stack ranking). When an entrant is on the
-- clock with auto-draft enabled, the draft picks the highest item in their queue
-- that is still available, falling back to the highest-ranked available golfer
-- when the queue is empty or exhausted. One row per (pool, entrant, golfer);
-- sort_order is the entrant's preference, ascending = drafted first.

create table if not exists public.draft_queue (
  pool_id     text        not null,
  entrant_id  uuid        not null references public.draft_entrants(entrant_id) on delete cascade,
  golfer      text        not null,
  sort_order  integer     not null,
  created_at  timestamptz not null default now(),
  primary key (pool_id, entrant_id, golfer)
);

create index if not exists draft_queue_pool_entrant_order_idx
  on public.draft_queue (pool_id, entrant_id, sort_order);

-- Writes go through the service-role key (supabaseAdmin), which bypasses RLS.
-- Enabling it keeps the anon/public key from reading other entrants' queues.
alter table public.draft_queue enable row level security;
