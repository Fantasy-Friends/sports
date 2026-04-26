-- Track first-time sign-in so we can show "Welcome to the Surge" video
-- exactly once per entrant. Null = they haven't been welcomed yet.

alter table public.draft_entrants
  add column if not exists welcomed_at timestamptz;
