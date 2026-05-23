-- Add "guest" tracking to drink sessions. A guest doesn't have an account in
-- draft_entrants — they're added by an existing session member ("chaperone")
-- and have their own profile (weight, sex) so BAC math works. Any session
-- member can then log drinks/caffeine/water/substances on the guest's behalf.

create table if not exists public.drink_session_guests (
  guest_id      uuid primary key default gen_random_uuid(),
  session_id    uuid not null references public.drink_sessions(session_id) on delete cascade,
  display_name  text not null,
  weight_lbs    numeric(5,1) not null check (weight_lbs > 0 and weight_lbs < 800),
  sex           text not null check (sex in ('male','female','other')),
  added_by      uuid not null references public.draft_entrants(entrant_id),
  created_at    timestamptz not null default now(),
  removed_at    timestamptz
);

create index if not exists drink_session_guests_session_idx
  on public.drink_session_guests (session_id);

-- Allow entries to be attributed to a guest instead of an entrant.
alter table public.drink_session_entries
  add column if not exists guest_id uuid references public.drink_session_guests(guest_id) on delete cascade;

alter table public.drink_session_entries
  alter column entrant_id drop not null;

-- Exactly one of entrant_id / guest_id must be set on every entry.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'drink_session_entries_actor_chk'
  ) then
    alter table public.drink_session_entries
      add constraint drink_session_entries_actor_chk
        check ((entrant_id is null) <> (guest_id is null));
  end if;
end$$;

-- Optional: track which session member actually logged the entry (the
-- chaperone for guest entries; the user themselves for self-logs). Useful
-- for "who deleted what" attribution later.
alter table public.drink_session_entries
  add column if not exists logged_by_entrant_id uuid references public.draft_entrants(entrant_id);

create index if not exists drink_session_entries_guest_idx
  on public.drink_session_entries (session_id, guest_id, occurred_at desc)
  where guest_id is not null;
