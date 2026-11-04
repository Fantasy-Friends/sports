import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { currentNflSeason, fetchNflWeek, upcomingNflWeek, type NflGame } from "@/lib/nfl";
import { scoreWeek, seasonDisplayNames, type PickRow } from "@/lib/nflPickem";
import { getBaseUrl, sendNotification } from "./send";
import { renderNflWeekResults } from "./templates";
import { pushNflPickReminder, pushNflWeekResults } from "./pushTemplates";

// NFL Pick'em notifications, driven by /api/cron/notify (every 5 min).
//
//   1. 30 min before the first Thursday game  → reminder to anyone with an
//      unpicked Thursday game
//   2. 30 min before the first Sat/Sun game   → reminder to anyone with an
//      unpicked Sat/Sun game
//   3. Once every game of the week is final   → weekly winner + top 3 to all
//      (in practice: right after Monday Night Football ends)
//
// "Anyone" = entrants who have made at least one pick this season, so people
// who don't play Pick'em never get pinged. Each notification is claimed once
// in notification_dedupe, so overlapping cron runs can't double-send.

const REMINDER_LEAD_MS = 30 * 60_000;
// The cron runs every 5 min; open the window 1 min early so a run that lands
// exactly on kickoff-30 fires on time instead of at kickoff-25.
const REMINDER_WINDOW_OPEN_MS = REMINDER_LEAD_MS + 60_000;
// Only announce a week's results within this long of its last kickoff, so a
// first deploy (or a long outage) doesn't announce weeks that ended days ago.
const RESULTS_MAX_AGE_MS = 18 * 60 * 60_000;

export type ReminderSlot = {
  slot: "thursday" | "weekend";
  label: string;
  kickoffMs: number;
  games: NflGame[];
};

function chicagoDow(ms: number): number {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short" }).format(
    new Date(ms),
  );
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
}

/** The week's reminder slots: Thursday's game(s) and the Sat/Sun slate. */
export function reminderSlots(games: NflGame[]): ReminderSlot[] {
  const withMs = games.map((g) => ({ g, ms: new Date(g.kickoff).getTime() }));
  const thursday = withMs.filter((x) => chicagoDow(x.ms) === 4);
  const weekend = withMs.filter((x) => {
    const d = chicagoDow(x.ms);
    return d === 6 || d === 0;
  });

  const slots: ReminderSlot[] = [];
  if (thursday.length > 0) {
    slots.push({
      slot: "thursday",
      label: thursday.length === 1 ? "TNF" : "Thursday's games",
      kickoffMs: Math.min(...thursday.map((x) => x.ms)),
      games: thursday.map((x) => x.g),
    });
  }
  if (weekend.length > 0) {
    const first = Math.min(...weekend.map((x) => x.ms));
    slots.push({
      slot: "weekend",
      label: chicagoDow(first) === 6 ? "Saturday's games" : "Sunday's games",
      kickoffMs: first,
      games: weekend.map((x) => x.g),
    });
  }
  return slots;
}

export function isReminderDue(slot: ReminderSlot, nowMs: number) {
  return nowMs >= slot.kickoffMs - REMINDER_WINDOW_OPEN_MS && nowMs < slot.kickoffMs;
}

export function isWeekFinalAndFresh(games: NflGame[], nowMs: number) {
  if (games.length === 0 || !games.every((g) => g.state === "post")) return false;
  const lastKick = Math.max(...games.map((g) => new Date(g.kickoff).getTime()));
  return nowMs - lastKick <= RESULTS_MAX_AGE_MS;
}

async function claim(key: string, dryRun: boolean) {
  if (dryRun) {
    const { data } = await supabaseAdmin
      .from("notification_dedupe")
      .select("dedupe_key")
      .eq("dedupe_key", key)
      .maybeSingle();
    return !data;
  }
  const { error } = await supabaseAdmin.from("notification_dedupe").insert({ dedupe_key: key });
  return !error; // duplicate key → someone already sent it
}

async function seasonPicks(season: number): Promise<PickRow[]> {
  const { data, error } = await supabaseAdmin
    .from("nfl_pickem_picks")
    .select("season, week, entrant_id, game_id, picked_team, confidence, is_bet, bet_decimal, parlay_group")
    .eq("season", season);
  if (error) throw new Error(error.message);
  return (data ?? []) as PickRow[];
}

export type NflRunReport = {
  week: number;
  reminders: Array<{ slot: string; recipients: string[]; sent: boolean }>;
  results: Array<{ week: number; top: Array<{ display_name: string; total: number }>; recipients: number; sent: boolean }>;
};

export async function runNflNotifications(opts: { now?: Date; dryRun?: boolean } = {}): Promise<NflRunReport> {
  const now = opts.now ?? new Date();
  const nowMs = now.getTime();
  const dryRun = opts.dryRun ?? false;
  const season = currentNflSeason(now);
  const week = upcomingNflWeek(now, season);
  const report: NflRunReport = { week, reminders: [], results: [] };

  const [schedule, picks, names] = await Promise.all([
    fetchNflWeek(week, season),
    seasonPicks(season),
    seasonDisplayNames(),
  ]);
  const participants = [...new Set(picks.map((p) => p.entrant_id))];

  // ── Pick reminders ────────────────────────────────────────────────────────
  for (const slot of reminderSlots(schedule.games)) {
    if (!isReminderDue(slot, nowMs)) continue;
    const key = `nfl_remind:${season}:${week}:${slot.slot}`;
    if (!(await claim(key, dryRun))) continue;

    const slotGameIds = new Set(slot.games.filter((g) => !g.locked).map((g) => g.game_id));
    const recipients: string[] = [];
    for (const entrantId of participants) {
      const picked = new Set(
        picks.filter((p) => p.week === week && p.entrant_id === entrantId).map((p) => p.game_id),
      );
      const missing = slot.games.filter((g) => slotGameIds.has(g.game_id) && !picked.has(g.game_id));
      if (missing.length === 0) continue;
      recipients.push(names.get(entrantId) ?? entrantId);
      if (dryRun) continue;
      await sendNotification({
        entrantId,
        kind: "nfl_pick_reminder",
        push: pushNflPickReminder({
          week,
          slot: slot.slot,
          slotLabel: slot.label,
          unpicked: missing.length,
          matchup: missing.length === 1 ? `${missing[0].away.abbr} @ ${missing[0].home.abbr}` : undefined,
        }),
      }).catch((err) => console.warn("[nfl] reminder failed:", entrantId, err));
    }
    report.reminders.push({ slot: slot.slot, recipients, sent: !dryRun });
  }

  // ── Weekly results ────────────────────────────────────────────────────────
  // Check this week and last week: on Tuesday the week pointer has already
  // rolled forward, but Monday night's results may still be pending.
  for (const w of [week, week - 1]) {
    if (w < 1) continue;
    const sched = w === week ? schedule : await fetchNflWeek(w, season);
    if (!isWeekFinalAndFresh(sched.games, nowMs)) continue;
    const weekPicks = picks.filter((p) => p.week === w);
    if (weekPicks.length === 0) continue;
    if (!(await claim(`nfl_results:${season}:${w}`, dryRun))) continue;

    const standings = scoreWeek(sched.games, weekPicks, names);
    const top = standings.slice(0, 3).map((s) => ({ display_name: s.display_name, total: s.total }));
    // Everyone who plays Pick'em this season hears who won, even if they
    // sat this week out.
    const recipients = participants;

    if (!dryRun) {
      const email = renderNflWeekResults(w, top, getBaseUrl());
      const push = pushNflWeekResults(w, top);
      await Promise.allSettled(
        recipients.map((entrantId) =>
          sendNotification({ entrantId, kind: "nfl_week_results", email, push }),
        ),
      );
    }
    report.results.push({ week: w, top, recipients: recipients.length, sent: !dryRun });
  }

  return report;
}
