-- Backfill legacy_pool_id for golf-draft events that were seeded without one.
-- Only the Masters got an explicit legacy_pool_id; The Open (and future golf
-- events) were null, which blocked finalize and skipped the post-finalize
-- draft-position clear. Every golf event's pool follows the same
-- `{basePool}-{tournamentSlug}` convention the draft room uses
-- (e.g. 2026-majors-the-open), so derive it from config.tournament_slug
-- (falling back to the slug with any leading "NNNN-" stripped).

update public.events
set legacy_pool_id = '2026-majors-' ||
      coalesce(config->>'tournament_slug', regexp_replace(slug, '^\d+-', ''))
where event_type = 'golf-draft'
  and legacy_pool_id is null;
