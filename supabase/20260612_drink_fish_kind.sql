-- Fish tracking for the Drink Tracker — sober-friendly catch log. A 'fish'
-- entry records one catch (species preset + optional length/weight in the
-- payload). No effect on BAC/caffeine math; it's a counter with bragging
-- rights.

alter table public.drink_session_entries
  drop constraint if exists drink_session_entries_kind_check;

alter table public.drink_session_entries
  add constraint drink_session_entries_kind_check
    check (kind in ('drink','caffeine','water','substance','activity','food','sleep','vomit','fish'));
