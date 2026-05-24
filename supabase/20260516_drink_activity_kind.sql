-- Add an "activity" entry kind so members (or chaperones for guests) can log
-- a workout. While the activity is in progress, the alcohol elimination rate
-- gets a small intensity-dependent multiplier (5/15/25 %), reflecting the
-- modest exercise-driven bump in hepatic blood flow + pulmonary excretion.

alter table public.drink_session_entries
  drop constraint if exists drink_session_entries_kind_check;

alter table public.drink_session_entries
  add constraint drink_session_entries_kind_check
    check (kind in ('drink','caffeine','water','substance','activity'));
