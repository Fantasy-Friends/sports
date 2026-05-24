-- Vomit / GI event tracking for the Drink Tracker. Used by the BAC math to
-- subtract unabsorbed stomach alcohol from the running ethanol total, and by
-- the Hangover Forecast as a heavy negative signal.

alter table public.drink_session_entries
  drop constraint if exists drink_session_entries_kind_check;

alter table public.drink_session_entries
  add constraint drink_session_entries_kind_check
    check (kind in ('drink','caffeine','water','substance','activity','food','sleep','vomit'));
