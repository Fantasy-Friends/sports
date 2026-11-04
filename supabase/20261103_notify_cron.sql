-- Every 5 minutes, call the app's /api/cron/notify route (NFL pick reminders,
-- weekly results, and any future time-based notifications).
--
-- Vercel's free plan only allows once-a-day crons, so the clock lives here.
-- Before running, replace BOTH placeholders:
--   <YOUR-DOMAIN>       your production domain, e.g. golf-beta-nine.vercel.app
--   <YOUR-CRON-SECRET>  the same value as the CRON_SECRET env var in Vercel

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Re-running this file replaces the job instead of adding a second one.
select cron.unschedule('notify-every-5-min')
where exists (select 1 from cron.job where jobname = 'notify-every-5-min');

select cron.schedule(
  'notify-every-5-min',
  '*/5 * * * *',
  $$
  select net.http_get(
    url := 'https://<YOUR-DOMAIN>/api/cron/notify',
    headers := jsonb_build_object('Authorization', 'Bearer <YOUR-CRON-SECRET>'),
    timeout_milliseconds := 30000
  );
  $$
);

-- Check it's running (after ~10 minutes):
--   select status, return_message, start_time
--   from cron.job_run_details order by start_time desc limit 5;
--   select status_code, content, created
--   from net._http_response order by created desc limit 5;
