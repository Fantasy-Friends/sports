-- Per-person alcohol burn-off rate (BAC points eliminated per hour).
--
-- Everyone used to burn off at a flat 0.015/hr — the low end of what's
-- measured — which badly overstated long, heavy sessions (two people in the
-- "Merica" session read 0.43). The rate is now set per person by someone who
-- knows how much they drink; NULL means "not set" and the math falls back to
-- DEFAULT_BURN_RATE (lib/drinks/math.ts).
--
-- Stored in three places, mirroring weight/sex:
--   drink_profiles         — carried into every new session the entrant joins
--   drink_session_members  — the per-session snapshot the BAC math reads
--   drink_session_guests   — guests are session-scoped, so only here

alter table public.drink_profiles
  add column if not exists burn_rate numeric(5,4)
    check (burn_rate is null or (burn_rate >= 0.010 and burn_rate <= 0.040));

alter table public.drink_session_members
  add column if not exists burn_rate numeric(5,4)
    check (burn_rate is null or (burn_rate >= 0.010 and burn_rate <= 0.040));

alter table public.drink_session_guests
  add column if not exists burn_rate numeric(5,4)
    check (burn_rate is null or (burn_rate >= 0.010 and burn_rate <= 0.040));
