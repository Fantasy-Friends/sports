-- TopGarage Bucks settlements. One row = a paid debt edge for a finalized
-- event: `payer` (a loser) has squared up their $25 ante with `payee` (the
-- event winner). Presence of the row means "paid"; deleting it un-marks it.
-- Only the payee (winner) may mark their own incoming debts paid — enforced
-- in the API route, not RLS (service-role client).

create table if not exists public.event_settlements (
  event_id          uuid not null references public.events(event_id) on delete cascade,
  payer_entrant_id  uuid not null references public.draft_entrants(entrant_id) on delete cascade,
  payee_entrant_id  uuid not null references public.draft_entrants(entrant_id) on delete cascade,
  amount            numeric not null,
  marked_by         uuid references public.draft_entrants(entrant_id),
  marked_at         timestamptz not null default now(),
  primary key (event_id, payer_entrant_id, payee_entrant_id)
);

create index if not exists event_settlements_payee_idx
  on public.event_settlements (payee_entrant_id);

create index if not exists event_settlements_payer_idx
  on public.event_settlements (payer_entrant_id);
