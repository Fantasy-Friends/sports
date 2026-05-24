-- Hangover Forecast support:
-- 1) Allow new entry kinds 'food' and 'sleep'.
-- 2) Optional age on the drink profile (drives a small "age" multiplier
--    on next-day hangover predictions).

alter table public.drink_session_entries
  drop constraint if exists drink_session_entries_kind_check;

alter table public.drink_session_entries
  add constraint drink_session_entries_kind_check
    check (kind in ('drink','caffeine','water','substance','activity','food','sleep'));

alter table public.drink_profiles
  add column if not exists age_years smallint check (age_years > 0 and age_years < 130);
