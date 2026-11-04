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
