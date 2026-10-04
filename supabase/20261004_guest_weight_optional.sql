-- Guests can be added without a weight.
--
-- Asking a guest how much they weigh is a conversation most people won't have
-- mid-party, so the weight is now optional. An unknown weight is stored as
-- NULL and stays NULL: the BAC math substitutes a population average at
-- calculation time (lib/drinks/math.ts, effectiveWeightLbs) so the UI can keep
-- showing "not given" instead of a number that looks measured.

alter table public.drink_session_guests
  alter column weight_lbs drop not null;

-- The check constraint already tolerates NULL (a CHECK passes when it
-- evaluates to NULL), so the 0 < weight < 800 bound still holds for any
-- weight that IS given. Nothing to change there.

-- Briefly, an earlier build wrote the population average into this column
-- instead of leaving it empty. Those rows are indistinguishable from a real
-- weight once the "assumed" labelling is gone, so reset the exact sentinel
-- values back to NULL. Scoped to the three exact constants, matched against
-- the sex they were derived from; a guest who genuinely weighs 199.8 lb AND
-- was entered during that window is the only false positive, and the remedy
-- is the same as before — type the weight in.
update public.drink_session_guests
   set weight_lbs = null
 where (sex = 'male'   and weight_lbs = 199.8)
    or (sex = 'female' and weight_lbs = 170.8)
    or (sex = 'other'  and weight_lbs = 185.3);
