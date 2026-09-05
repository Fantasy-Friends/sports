-- NFL Pick'em betting layer. A pick can optionally be:
--   * a straight BET (is_bet): stake = confidence, payout = confidence ×
--     bet_decimal on a win, -confidence on a loss (vs. classic +confidence/0)
--   * a PARLAY leg (parlay_group = 1, one parlay per entrant-week, 2-3 legs):
--     stake = sum of leg confidences, payout = stake × product of leg
--     decimals only if every leg wins; any loss busts the ticket for -stake.
-- bet_decimal is the decimal moneyline snapshotted server-side at save time,
-- so later line moves never change a placed bet's payoff.

alter table public.nfl_pickem_picks
  add column if not exists is_bet boolean not null default false,
  add column if not exists bet_decimal numeric,
  add column if not exists parlay_group smallint;
