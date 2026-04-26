# First-login welcome experience

One-time video that plays the first time an entrant signs in. After they click "Enter Surge," the server marks `draft_entrants.welcomed_at = now()` and they never see it again.

## How the flow wires together

1. User hits `/sign-in`, submits their access code.
2. `/api/auth/entrant-login` returns the entrant including `welcomed_at` (`null` on first sign-in).
3. Client-side, the sign-in page checks: if `welcomed_at` is null → `router.replace("/welcome?returnTo=...")`. Otherwise → `router.replace(returnTo)`.
4. `/welcome` shows the video. On "Enter Surge" click, POST `/api/auth/welcomed`, then replace to `returnTo`.
5. On any subsequent visit, `/welcome` re-checks `welcomed_at` — if already set, it immediately redirects through to `returnTo`.

The `welcomed_at` column was added in `supabase/20260421_welcomed_at.sql`. Run that against the live database before deploying — existing entrants will have `welcomed_at = null`, so everyone sees the welcome video once on their next sign-in. If that's not what you want, backfill with:

```sql
update public.draft_entrants
set welcomed_at = now()
where welcomed_at is null;
```

## Wiring the video

The player reads its source from the `NEXT_PUBLIC_WELCOME_VIDEO_URL` env var (set it in Vercel → Project Settings → Environment Variables). Any URL that a `<video>` element can play works:

- A file in `public/` (e.g. set the var to `/welcome.mp4` and drop the file at `public/welcome.mp4`)
- An external URL (Vercel Blob, Supabase Storage, a CDN, etc.)
- An MP4, WebM, or any `<video>`-supported format

If the env var is unset or empty, `/welcome` renders a themed placeholder tile that says "Video coming soon" — the flow still works, they just skip the playback.

## Keeping the video short

Sixty seconds or less — anything longer and people will tap past it. Suggested beats:

1. Who the 6 members are (names + avatars)
2. One shot of an event hub (the calendar grid or a live-event card)
3. One shot of chat with a hot-take reaction firing
4. The one rule: "every event. every take. one place."

## Resetting for one entrant

If you want to re-show the welcome for someone (e.g. re-onboarding during beta):

```sql
update public.draft_entrants
set welcomed_at = null
where entrant_slug = 'dusty';
```

They'll see it again on their next page load that hits `/welcome` — or, if they skip straight into a protected route, nothing changes (we only route through `/welcome` from `/sign-in`).
