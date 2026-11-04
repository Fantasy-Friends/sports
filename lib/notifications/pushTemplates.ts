// Push notification templates. Title is bold on the lock screen; body should
// be one short line. `url` is the in-app path opened when tapped.

import type { PushPayload } from "./webPush";

export type RenderedPush = PushPayload;

export function pushDraftOpens(event: { name: string }): RenderedPush {
  return {
    title: `${event.name} draft is open`,
    body: "Get your queue set before you're on the clock.",
    url: "/draft",
    tag: "draft",
  };
}

export function pushDraftTurn(
  event: { name: string },
  opts: { round?: number | null; pick?: number | null; expiresAt?: string | null } = {},
): RenderedPush {
  const parts: string[] = [];
  if (opts.round && opts.pick) parts.push(`Round ${opts.round}, pick ${opts.pick}`);
  if (opts.expiresAt) {
    const t = new Date(opts.expiresAt);
    if (!Number.isNaN(t.getTime())) {
      parts.push(
        `pick by ${t.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          timeZone: "America/Chicago",
        })} CT`,
      );
    }
  }
  return {
    title: `You're on the clock — ${event.name}`,
    body: parts.length ? parts.join(" · ") : "It's your pick.",
    url: "/draft",
    tag: "draft-turn",
  };
}

export function pushEventFinal(
  event: { name: string; slug: string },
  topName: string,
  topPoints: number,
): RenderedPush {
  return {
    title: `${event.name} is final`,
    body: `1st: ${topName} +${topPoints.toFixed(1)}. See the standings.`,
    url: `/events/${event.slug}`,
  };
}

export function pushHotSeatDeclared(declarer: string, declaration: string): RenderedPush {
  return {
    title: `🔥 ${declarer} is on the Hot Seat`,
    body: declaration.length > 120 ? `${declaration.slice(0, 117)}…` : declaration,
    url: "/hot-seat",
    tag: "hot-seat",
  };
}

export function pushTest(name: string): RenderedPush {
  return {
    title: "Notifications are working",
    body: `Nice, ${name}. You'll get pinged here when it matters.`,
    url: "/preferences",
    tag: "test",
  };
}

export function pushNflPickReminder(opts: {
  week: number;
  slot: "thursday" | "weekend";
  slotLabel: string; // e.g. "TNF" or "Sunday's games"
  unpicked: number;
  matchup?: string; // e.g. "DAL @ PHI" when it's a single game
}): RenderedPush {
  const what =
    opts.unpicked === 1 && opts.matchup
      ? `You haven't picked ${opts.matchup} yet.`
      : `You have ${opts.unpicked} game${opts.unpicked === 1 ? "" : "s"} unpicked.`;
  return {
    title: `⏰ ${opts.slotLabel} kicks off in 30 min`,
    body: `${what} Picks lock at kickoff.`,
    url: "/pickem",
    tag: `nfl-remind-${opts.week}-${opts.slot}`,
  };
}

export function pushNflWeekResults(
  week: number,
  top: Array<{ display_name: string; total: number }>,
): RenderedPush {
  const winners = top.filter((t) => t.total === top[0]?.total);
  const title =
    winners.length > 1
      ? `🏈 Week ${week}: ${winners.map((w) => w.display_name).join(" & ")} tie at ${winners[0].total}`
      : `🏈 Week ${week} winner: ${top[0]?.display_name ?? "—"} (${top[0]?.total ?? 0} pts)`;
  const rest = top
    .slice(winners.length, 3)
    .map((t, i) => `${winners.length + i + 1}. ${t.display_name} ${t.total}`)
    .join(" · ");
  return {
    title,
    body: rest ? rest : "Tap for the full week.",
    url: "/pickem",
    tag: `nfl-results-${week}`,
  };
}
