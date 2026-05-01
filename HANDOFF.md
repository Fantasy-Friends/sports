# Fantasy Friends — Handoff Doc

## Repo
```
git clone https://github.com/Fantasy-Friends/sports
cd sports
```
The correct remote is `Fantasy-Friends/sports` (org repo). Do NOT push to `tgifreitag/fantasy-friends` or `dustybecker/golf` — those are old/stale.

## Tech Stack
- **Next.js 16 / React 19 / TypeScript**
- **Supabase** — database + auth
- **Tailwind CSS**
- **Vercel** — hosting, auto-deploys from `main` branch of `Fantasy-Friends/sports`
- **Resend** — email notifications
- **Twilio** — SMS notifications

## Local Setup
```bash
npm install
# create .env.local and fill in values below
npm run dev
```

## Required Environment Variables (`.env.local`)
```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Pool / Season
NEXT_PUBLIC_POOL_ID=2026-majors
POOL_ID=2026-majors
NEXT_PUBLIC_CURRENT_SEASON_YEAR=2026

# Golf data
SLASH_GOLF_API_KEY=
ODDS_API_KEY=

# Notifications
RESEND_API_KEY=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=         # E.164 format e.g. +15551234567
TWILIO_MESSAGING_SERVICE_SID=

# Optional
NEXT_PUBLIC_WELCOME_VIDEO_URL=
```

## Git Config (first time on new machine)
```bash
git config --global user.email "dustybecker@gmail.com"
git config --global user.name "Dusty Becker"
```

Install GitHub CLI for PR workflows:
```bash
winget install --id GitHub.cli --silent
gh auth login
gh repo set-default Fantasy-Friends/sports
```

## Current State (as of April 2026)
- **Masters** — status `live`, needs finalization once tournament scores are complete in `tournament_round_scores` table. Go to `/admin` → Finalize.
- **Kentucky Derby** — status `scheduled`, event date May 2 2026. Entry form is live at `/events/2026-kentucky-derby/entry`. After the race, update `event.config.results` in Supabase with finish positions (e.g. `{ "renegade": 1, "commandment": 2 }`) then finalize from `/admin`.
- **NBA Playoffs Bracket** — status `open-entry`

## Kentucky Derby Scoring Notes
- $100 salary cap, pick 3 horses
- Horse prices derived from odds (7-2 = $45 down to 50-1 = $5, all in $5 increments)
- Points by finish position: 1st=20, 2nd=15, 3rd=10, 4th=7, 5th=5, 6th=3, 7th=2, 8th+=1
- Any horse at 40-1 or greater that finishes top 3 earns **2x points** for whoever picked them
- Longshot bonus also awards +5 season points via `derby_longshot` bonus type

## Key Files
- `lib/events/derbyHorses.ts` — horse list, prices, longshot flags
- `lib/events/horseDraft.ts` — Derby event handler (scoring, bonuses)
- `components/events/DerbySalaryCapForm.tsx` — entry UI
- `lib/events/registry.ts` — maps event_type strings to handlers
- `app/events/[slug]/page.tsx` — event detail page
- `app/events/[slug]/entry/page.tsx` — entry form page

## Collaborator
- GitHub: `tgifreitag` (co-owner of `Fantasy-Friends` org)
- Both have push access to `Fantasy-Friends/sports`

## Deployed URL
https://golf-beta-nine.vercel.app
