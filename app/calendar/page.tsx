import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { getAuthenticatedEntrant } from "@/lib/draftAuth";

export const revalidate = 0;

type EventRow = {
  event_id: string;
  slug: string;
  name: string;
  event_type: string;
  tier: 1 | 2 | 3;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  group_key: string | null;
};

const TIER_STYLE: Record<number, { border: string; label: string; chip: string }> = {
  3: { border: "border-accent/40", label: "Tier 3 · 5x", chip: "bg-accent text-white" },
  2: { border: "border-info/40", label: "Tier 2 · 2.5x", chip: "bg-info text-white" },
  1: { border: "border-border/30", label: "Tier 1 · 1x", chip: "bg-surface/70 text-text" },
};

function formatRange(start: string | null, end: string | null) {
  if (!start) return "TBD";
  const s = new Date(start);
  const e = end ? new Date(end) : null;
  const sStr = s.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (!e || e.toDateString() === s.toDateString()) return sStr;
  const eStr = e.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${sStr} – ${eStr}`;
}

type CalendarEntry =
  | { kind: "event"; event: EventRow }
  | { kind: "group"; groupKey: string; events: EventRow[] };

function groupEvents(events: EventRow[]): CalendarEntry[] {
  const grouped = new Map<string, EventRow[]>();
  const singletons: EventRow[] = [];
  for (const ev of events) {
    if (ev.group_key) {
      const list = grouped.get(ev.group_key) ?? [];
      list.push(ev);
      grouped.set(ev.group_key, list);
    } else {
      singletons.push(ev);
    }
  }

  const entries: CalendarEntry[] = [];
  for (const ev of singletons) entries.push({ kind: "event", event: ev });
  for (const [groupKey, list] of grouped.entries()) {
    entries.push({ kind: "group", groupKey, events: list });
  }
  entries.sort((a, b) => {
    const aStart = a.kind === "event" ? a.event.starts_at : a.events[0]?.starts_at;
    const bStart = b.kind === "event" ? b.event.starts_at : b.events[0]?.starts_at;
    if (!aStart) return 1;
    if (!bStart) return -1;
    return aStart.localeCompare(bStart);
  });
  return entries;
}

export default async function CalendarPage() {
  const session = await getAuthenticatedEntrant();
  if (!session) redirect("/sign-in?returnTo=/calendar");

  const { data: season } = await supabaseAdmin
    .from("seasons")
    .select("season_id, year, label")
    .eq("year", 2026)
    .maybeSingle<{ season_id: string; year: number; label: string }>();

  const events: EventRow[] = season
    ? ((
        await supabaseAdmin
          .from("events")
          .select("event_id, slug, name, event_type, tier, status, starts_at, ends_at, group_key")
          .eq("season_id", season.season_id)
          .order("starts_at", { ascending: true })
      ).data ?? []) as EventRow[]
    : [];

  const entries = groupEvents(events);

  return (
    <main className="mx-auto max-w-5xl">
      <div className="mb-4">
        <div className="text-[11px] uppercase tracking-[0.28em] text-muted">Master Calendar</div>
        <h1 className="text-2xl font-semibold text-info">
          {season?.label ?? "2026 Ultimate Sports Decathlon"}
        </h1>
        <p className="mt-1 text-sm text-muted">
          Every event of the season. Tap a card to jump into its entry or leaderboard surface.
        </p>
      </div>

      {!season ? (
        <div className="rounded-[1.5rem] border border-danger/40 bg-surface/35 p-6 text-sm text-danger">
          No 2026 season found. Run the schema seed to populate.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map((entry) => {
            if (entry.kind === "group") {
              const first = entry.events[0];
              const last = entry.events[entry.events.length - 1];
              const style = TIER_STYLE[first.tier] ?? TIER_STYLE[1];
              const completed = entry.events.filter((e) => e.status === "final").length;
              return (
                <Link
                  key={entry.groupKey}
                  href={`/events/${first.slug}`}
                  className={`soft-card block rounded-[1.5rem] border ${style.border} bg-surface/35 p-4 transition-colors hover:bg-surface/60 sm:p-5`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] ${style.chip}`}
                    >
                      {style.label}
                    </span>
                    <span className="text-xs text-muted">
                      {completed}/{entry.events.length} done
                    </span>
                  </div>
                  <h2 className="mt-2 text-base font-semibold text-text sm:text-lg">
                    NFL Weekly Picks (Weeks 1&ndash;{entry.events.length})
                  </h2>
                  <p className="mt-1 text-xs text-muted">
                    {formatRange(first.starts_at, last.ends_at ?? last.starts_at)}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Pick 5 games ATS each week &middot; each week scores independently
                  </p>
                </Link>
              );
            }

            const ev = entry.event;
            const style = TIER_STYLE[ev.tier] ?? TIER_STYLE[1];
            const isLive = ev.status === "live";
            const isOpen = ev.status === "open-entry";
            return (
              <Link
                key={ev.event_id}
                href={`/events/${ev.slug}`}
                className={[
                  "soft-card block rounded-[1.5rem] border bg-surface/35 p-4 transition-colors hover:bg-surface/60 sm:p-5",
                  style.border,
                  isLive ? "ring-1 ring-accent/50" : "",
                ].join(" ")}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] ${style.chip}`}
                  >
                    {style.label}
                  </span>
                  <span
                    className={[
                      "rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em]",
                      isLive
                        ? "bg-accent text-white"
                        : isOpen
                          ? "bg-info/15 text-info"
                          : "bg-surface/70 text-muted",
                    ].join(" ")}
                  >
                    {ev.status}
                  </span>
                </div>
                <h2 className="mt-2 text-base font-semibold text-text sm:text-lg">{ev.name}</h2>
                <p className="mt-1 text-xs text-muted">{formatRange(ev.starts_at, ev.ends_at)}</p>
                <p className="mt-1 text-xs text-muted">{ev.event_type}</p>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
