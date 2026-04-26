import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import BracketNbaBoard from "@/components/events/BracketNbaBoard";
import { supabaseAdmin } from "@/lib/supabase";
import { getAuthenticatedEntrant } from "@/lib/draftAuth";
import { getEventBySlug, getCurrentSeasonId } from "@/lib/events/resolve";
import { getEventHandler } from "@/lib/events/registry";

export const revalidate = 0;

type Props = {
  params: Promise<{ slug: string }>;
};

const TIER_CHIP: Record<number, string> = {
  3: "bg-accent text-white",
  2: "bg-info text-white",
  1: "bg-surface/70 text-text",
};
const TIER_LABEL: Record<number, string> = {
  3: "Tier 3 · 5x",
  2: "Tier 2 · 2.5x",
  1: "Tier 1 · 1x",
};

export default async function EventDetailPage({ params }: Props) {
  const { slug } = await params;

  const session = await getAuthenticatedEntrant();
  if (!session) redirect(`/sign-in?returnTo=/events/${slug}`);

  const seasonId = await getCurrentSeasonId();
  if (!seasonId) notFound();

  const event = await getEventBySlug(slug, seasonId);
  if (!event) notFound();

  // For golf-draft events, point the commissioner / players to the legacy
  // Masters UI which still works as-is.
  if (event.event_type === "golf-draft" && event.status !== "final") {
    redirect("/draft");
  }

  const handler = getEventHandler(event);

  const { data: finishes } = await supabaseAdmin
    .from("event_finishes")
    .select("entrant_id, finish_rank, raw_score, awarded_points")
    .eq("event_id", event.event_id)
    .order("finish_rank", { ascending: true });

  const { data: members } = await supabaseAdmin
    .from("season_members")
    .select("entrant_id, display_name")
    .eq("season_id", seasonId);

  const nameByEntrant = new Map<string, string>();
  for (const m of members ?? []) nameByEntrant.set(m.entrant_id, m.display_name);

  const showEntry = ["open-entry", "scheduled"].includes(event.status);
  const showLeaderboard = event.status === "final" || event.status === "live" || event.status === "locked";
  const showProvisional = event.event_type === "bracket-nba" && event.status !== "final";

  return (
    <main className="mx-auto max-w-4xl">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] ${TIER_CHIP[event.tier]}`}
            >
              {TIER_LABEL[event.tier]}
            </span>
            <span className="rounded-md bg-surface/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
              {event.status}
            </span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold text-info">{event.name}</h1>
          <p className="mt-1 text-xs text-muted">{handler.label}</p>
        </div>
        <Link
          href="/calendar"
          className="rounded-lg border border-border/30 bg-surface/35 px-3 py-1.5 text-xs font-semibold text-text hover:bg-surface/60"
        >
          ← Calendar
        </Link>
      </div>

      {showEntry ? (
        <div className="soft-card mb-4 rounded-[1.5rem] border border-border/20 bg-surface/35 p-5">
          <div className="text-[11px] uppercase tracking-[0.28em] text-muted">Entry</div>
          <p className="mt-2 text-sm text-text">
            {handler.kind === "golf-draft"
              ? "Golf draft happens in the draft room."
              : handler.kind === "bracket-nba"
                ? "Fill out your NBA playoff bracket. You can edit any time before the entry deadline."
                : handler.kind === "horse-draft"
                  ? "Build your $100 stable of 3 horses. Horses with 40-1 or greater odds earn 2x points if they finish in the top 3."
                  : "Entry UI for this event type is not yet implemented."}
          </p>
          {handler.kind === "golf-draft" ? (
            <Link
              href="/draft"
              className="mt-3 inline-flex rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white"
            >
              Open Draft Room →
            </Link>
          ) : handler.kind === "bracket-nba" ? (
            <Link
              href={`/events/${event.slug}/entry`}
              className="mt-3 inline-flex rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white"
            >
              Open Bracket →
            </Link>
          ) : handler.kind === "horse-draft" ? (
            <Link
              href={`/events/${event.slug}/entry`}
              className="mt-3 inline-flex rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white"
            >
              Pick Your Stable →
            </Link>
          ) : null}
        </div>
      ) : null}

      {showProvisional ? (
        <div className="mb-4">
          <BracketNbaBoard
            slug={event.slug}
            members={(members ?? []).map((m) => ({
              entrant_id: m.entrant_id,
              display_name: m.display_name,
            }))}
          />
        </div>
      ) : null}

      {showLeaderboard ? (
        <div className="soft-card rounded-[1.5rem] border border-border/20 bg-surface/35 p-5">
          <div className="mb-3 text-[11px] uppercase tracking-[0.28em] text-muted">Event leaderboard</div>
          {finishes && finishes.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-[0.22em] text-muted">
                    <th className="px-2 py-2 font-medium">Rank</th>
                    <th className="px-2 py-2 font-medium">Player</th>
                    <th className="px-2 py-2 text-right font-medium">Raw</th>
                    <th className="px-2 py-2 text-right font-medium">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {finishes.map((f) => (
                    <tr key={f.entrant_id} className="border-t border-border/15 text-text">
                      <td className="px-2 py-2 font-semibold text-muted">
                        {Number(f.finish_rank).toFixed(1)}
                      </td>
                      <td className="px-2 py-2 font-semibold">
                        {nameByEntrant.get(f.entrant_id) ?? f.entrant_id.slice(0, 8)}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {f.raw_score !== null ? Number(f.raw_score).toFixed(0) : "—"}
                      </td>
                      <td className="px-2 py-2 text-right text-base font-semibold tabular-nums text-info">
                        {Number(f.awarded_points).toFixed(1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted">
              No finishes recorded yet. Commissioner finalizes the event in /admin to lock in
              season points.
            </p>
          )}
        </div>
      ) : null}

      {event.event_type === "golf-draft" && event.status === "final" ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/leaderboard"
            className="rounded-xl border border-border/30 bg-surface/35 px-4 py-2 text-sm font-semibold text-text hover:bg-surface/60"
          >
            Player leaderboard (net)
          </Link>
          <Link
            href="/tournament"
            className="rounded-xl border border-border/30 bg-surface/35 px-4 py-2 text-sm font-semibold text-text hover:bg-surface/60"
          >
            Tournament board
          </Link>
        </div>
      ) : null}
    </main>
  );
}
