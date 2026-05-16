-- Multi-user "Drink Tracker" sessions. A session is an ad-hoc gathering
-- (party, night out) that any signed-in entrant can create and others can
-- join via a short alphanumeric code. Every member logs their own drinks,
-- caffeine, water, and substances. The BAC math and timelines render
-- client-side from the entries.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Per-entrant body profile (needed for Widmark BAC math).
-- One row per entrant, owned by them.
-- ---------------------------------------------------------------------------
create table if not exists public.drink_profiles (
  entrant_id  uuid primary key references public.draft_entrants(entrant_id) on delete cascade,
  weight_lbs  numeric(5,1) not null check (weight_lbs > 0 and weight_lbs < 800),
  sex         text not null check (sex in ('male','female','other')),
  display_name text,
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Sessions
-- ---------------------------------------------------------------------------
create table if not exists public.drink_sessions (
  session_id   uuid primary key default gen_random_uuid(),
  code         text not null unique,
  name         text not null,
  created_by   uuid not null references public.draft_entrants(entrant_id) on delete cascade,
  started_at   timestamptz not null default now(),
  ended_at     timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists drink_sessions_code_idx on public.drink_sessions (code);
create index if not exists drink_sessions_active_idx on public.drink_sessions (ended_at)
  where ended_at is null;

-- ---------------------------------------------------------------------------
-- Members (which entrants joined which session, and a per-session profile
-- snapshot so BAC math doesn't shift if they later edit their profile).
-- ---------------------------------------------------------------------------
create table if not exists public.drink_session_members (
  session_id  uuid not null references public.drink_sessions(session_id) on delete cascade,
  entrant_id  uuid not null references public.draft_entrants(entrant_id) on delete cascade,
  display_name text not null,
  weight_lbs  numeric(5,1) not null,
  sex         text not null check (sex in ('male','female','other')),
  joined_at   timestamptz not null default now(),
  left_at     timestamptz,
  primary key (session_id, entrant_id)
);

create index if not exists drink_session_members_entrant_idx
  on public.drink_session_members (entrant_id);

-- ---------------------------------------------------------------------------
-- Entries (one row per logged drink / caffeine / water / substance).
-- Payload is jsonb so we can evolve fields without migrations.
-- ---------------------------------------------------------------------------
create table if not exists public.drink_session_entries (
  entry_id    uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.drink_sessions(session_id) on delete cascade,
  entrant_id  uuid not null references public.draft_entrants(entrant_id) on delete cascade,
  kind        text not null check (kind in ('drink','caffeine','water','substance')),
  payload     jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

create index if not exists drink_session_entries_session_idx
  on public.drink_session_entries (session_id, occurred_at desc);

create index if not exists drink_session_entries_session_entrant_idx
  on public.drink_session_entries (session_id, entrant_id, occurred_at desc);
