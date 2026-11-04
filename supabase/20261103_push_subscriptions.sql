-- Web push (PWA) notifications.
--
-- push_subscriptions: one row per device/browser that has opted in. The
-- endpoint is a unique URL at Apple's / Google's / Mozilla's push service;
-- p256dh + auth are the per-device encryption keys from PushSubscription.
--
-- entrant_id is the entrant that was signed in when the device subscribed.
-- Entrants are per-pool, so person_key + google_email are copied too; the
-- sender matches on any of the three so one subscription reaches the same
-- human across every pool.

create table if not exists public.push_subscriptions (
  subscription_id uuid primary key default gen_random_uuid(),
  entrant_id uuid not null references public.draft_entrants(entrant_id) on delete cascade,
  person_key text,
  google_email text,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  failure_count integer not null default 0
);

create index if not exists push_subscriptions_entrant_idx
  on public.push_subscriptions (entrant_id);
create index if not exists push_subscriptions_person_key_idx
  on public.push_subscriptions (person_key) where person_key is not null;
create index if not exists push_subscriptions_google_email_idx
  on public.push_subscriptions (google_email) where google_email is not null;

-- Server-only table (accessed with the service role key).
alter table public.push_subscriptions enable row level security;

-- notification_dedupe: "has this exact notification already gone out?"
-- Insert-or-skip on a deterministic key, e.g. draft_turn:<pool>:<pick>.
-- Lets triggers fire from code paths that run repeatedly (draft-state polling)
-- without spamming anyone.
create table if not exists public.notification_dedupe (
  dedupe_key text primary key,
  created_at timestamptz not null default now()
);

alter table public.notification_dedupe enable row level security;
