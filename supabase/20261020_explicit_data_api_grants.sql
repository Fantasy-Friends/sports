-- Explicit Data API grants
--
-- Starting 2026-10-30, Supabase no longer auto-grants Data API access
-- (anon / authenticated / service_role) to new tables in the public schema.
-- Existing tables in production keep their grants, so this file changes
-- nothing on the live project. It exists so a fresh rebuild of the schema
-- (new project, preview branch, or local reset) ends up with the same
-- access the live project has today. Run it after all other schema files.
--
-- Going forward, every new table needs its own grant in the same file
-- that creates it. App access pattern (as of 2026-10-20):
--   * All reads and writes go through server routes using the service role
--     (lib/supabaseAdmin.ts).
--   * The browser anon client (lib/supabase.ts) is only used for the
--     Realtime subscription on chat_messages, which needs SELECT.
--
-- Template for a new table that only the server touches:
--
--   grant select, insert, update, delete on public.new_table to service_role;
--
-- Add `grant select on public.new_table to anon;` only if the browser
-- needs to read it directly (e.g. a Realtime subscription).

grant select, insert, update, delete
  on all tables in schema public
  to anon, authenticated, service_role;

grant usage, select
  on all sequences in schema public
  to anon, authenticated, service_role;
