"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { initialsFor, tintFor } from "@/lib/avatarTint";

/*
 * Home — wired to real data, wrapped in AppShell.
 *
 * AppShell renders the live banner, presence rail, page H1, and the
 * desktop companion rail with pool standings / my picks / bonuses /
 * next event. Home's body fills in the live-event detail and the
 * tournament leaderboard. On mobile the companion rail is hidden, so
 * Home also includes a compact pool-standings panel as a fallback.
 */

type EventRow = {
  event_id: string;
  slug: string;
  name: string;
  event_type: string;
  tier: 1 | 2 | 3;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  legacy_pool_id: string | null;
};

type TournamentRow = {
  golfer: string;
  rank: number | null;
  gross_total: number | null;
  live_total_to_par?: number | null;
  position: number | null;
  position_text: string | null;
  drafted_by: string[];
  rounds: Array<{ round_number: number; strokes: number | null; score_status: string }>;
};

type PlayerRow = {
  entrant_name: string;
  team_total: number;
  scoring_golfers: Array<{
    golfer: string;
    handicap: number;
    net_total: number | null;
    live_net_to_par?: number | null;
    live_total_to_par?: number | null;
    position: number | null;
    position_text: string | null;
    rounds: Array<{ round_number: number; strokes: number | null; score_status: string }>;
  }>;
  bench_golfers: PlayerRow["scoring_golfers"];
  tie_break_5_position: number | null;
  tie_break_6_position: number | null;
};

type SeasonStanding = {
  entrant_id: string;
  display_name: string;
  total_points: number;
};

function formatToPar(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value === 0) return "E";
  return value > 0 ? `+${value}` : `${value}`;
}

function tournamentRowToPar(row: TournamentRow, roundPar = 72): number | null {
  if (typeof row.live_total_to_par === "number") return Math.round(row.live_total_to_par);
  if (row.gross_total === null) return null;
  if (row.rounds.length === 0) return null;
  return Math.round(row.gross_total - row.rounds.length * roundPar);
}

function playerRowToPar(row: PlayerRow, roundPar = 72): number | null {
  let sum = 0;
  let any = false;
  for (const g of row.scoring_golfers) {
    let toPar: number | null = null;
    if (typeof g.live_net_to_par === "number") toPar = Math.round(g.live_net_to_par);
    else if (typeof g.live_total_to_par === "number") toPar = Math.round(g.live_total_to_par - g.handicap);
    else if (g.net_total !== null && g.rounds.length > 0) toPar = Math.round(g.net_total - g.rounds.length * roundPar);
    if (toPar !== null) {
      sum += toPar;
      any = true;
    }
  }
  return any ? sum : null;
}

function Avatar({ name, size = "sm" }: { name: string; size?: "xs" | "sm" }) {
  const dim = size === "sm" ? "h-6 w-6 text-[9px]" : "h-5 w-5 text-[8px]";
  return (
    <span
      className={`${dim} inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white`}
      style={{ background: tintFor(name) }}
      aria-label={name}
    >
      {initialsFor(name)}
    </span>
  );
}

// ---------------------------------------------------------------------------

function HomeContent() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [tournament, setTournament] = useState<TournamentRow[]>([]);
  const [pool, setPool] = useState<PlayerRow[]>([]);
  const [seasonRows, setSeasonRows] = useState<SeasonStanding[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const eventsRes = await fetch("/api/season/2026/events", { cache: "no-store" });
        const eventsJson = await eventsRes.json();
        if (cancelled) return;
        const allEvents = (eventsJson?.events ?? []) as EventRow[];
        setEvents(allEvents);

        const live = allEvents.find((e) => e.status === "live") ?? null;
        const legacy = live?.legacy_pool_id;
        const tournamentSlug =
          live?.event_type === "golf-draft" ? live.slug.replace(/^2026-/, "") : null;

        const promises: Array<Promise<Response>> = [
          fetch("/api/season/2026/leaderboard", { cache: "no-store" }),
        ];
        if (legacy && tournamentSlug) {
          promises.push(
            fetch(`/api/leaderboards/tournament?pool_id=${encodeURIComponent(legacy)}&tournament=${encodeURIComponent(tournamentSlug)}`, { cache: "no-store" }),
            fetch(`/api/leaderboards/player?pool_id=${encodeURIComponent(legacy)}&tournament=${encodeURIComponent(tournamentSlug)}`, { cache: "no-store" }),
          );
        }
        const responses = await Promise.all(promises);
        const [seasonRes, tournamentRes, playerRes] = responses;

        const seasonJson = await seasonRes.json();
        if (!cancelled) setSeasonRows((seasonJson?.rows ?? []) as SeasonStanding[]);

        if (tournamentRes) {
          const j = await tournamentRes.json();
          if (!cancelled) setTournament((j?.rows ?? []) as TournamentRow[]);
        }
        if (playerRes) {
          const j = await playerRes.json();
          if (!cancelled) setPool((j?.rows ?? []) as PlayerRow[]);
        }
      } catch {
        // empty arrays already
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const liveEvent = useMemo(() => events.find((e) => e.status === "live") ?? null, [events]);

  const HERO_EVENT_SLUG = "2026-pga-championship";
  const COMING_SOON_SLUGS = useMemo(
    () => new Set(["2026-nba-playoffs-bracket", "2026-nhl-playoffs-bracket"]),
    [],
  );

  const featuredEvent = useMemo(
    () => events.find((e) => e.slug === HERO_EVENT_SLUG) ?? null,
    [events],
  );

  const comingSoonEvents = useMemo(
    () =>
      events
        .filter((e) => COMING_SOON_SLUGS.has(e.slug))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [events, COMING_SOON_SLUGS],
  );

  const openEntryEvents = useMemo(
    () => events
      .filter((e) => e.status === "open-entry")
      .filter((e) => e.slug !== HERO_EVENT_SLUG && !COMING_SOON_SLUGS.has(e.slug))
      .sort((a, b) => (a.starts_at ?? "") > (b.starts_at ?? "") ? 1 : -1),
    [events, COMING_SOON_SLUGS],
  );

  const nextEvent = useMemo(() => {
    if (liveEvent || featuredEvent) return null;
    if (openEntryEvents.length > 0) return null;
    const upcoming = events
      .filter((e) => e.slug !== HERO_EVENT_SLUG && !COMING_SOON_SLUGS.has(e.slug))
      .filter((e) => e.status === "scheduled")
      .filter((e) => Boolean(e.starts_at))
      .sort((a, b) => (a.starts_at! > b.starts_at! ? 1 : -1));
    return upcoming[0] ?? null;
  }, [events, liveEvent, featuredEvent, openEntryEvents, COMING_SOON_SLUGS]);

  const topPool = useMemo(
    () =>
      pool
        .map((row) => ({ row, toPar: playerRowToPar(row) }))
        .sort((a, b) => {
          const av = a.toPar ?? 9999;
          const bv = b.toPar ?? 9999;
          return av - bv;
        })
        .slice(0, 6),
    [pool],
  );

  const topGolfers = useMemo(() => tournament.slice(0, 8), [tournament]);

  return (
    <div className="space-y-4">
      {featuredEvent ? (
        <section
          className="relative overflow-hidden rounded-[1.75rem] border border-[#1e3a8a]/50 text-white"
          style={{
            background:
              "radial-gradient(circle at 15% 0%, rgba(59, 130, 246, 0.13), transparent 40%)," +
              "radial-gradient(circle at 85% 12%, rgba(245, 193, 28, 0.09), transparent 32%)," +
              "linear-gradient(180deg, #0d1640 0%, #080e2a 70%, #04091800 100%)",
          }}
        >
          {/* PGA Championship logo badge */}
          <div className="absolute right-4 top-4 sm:right-7 sm:top-7">
            <div className="rounded-2xl bg-white/90 p-2 shadow-lg">
              <img
                src="/PGA Championship.png"
                alt="2026 PGA Championship"
                className="h-16 w-16 object-contain sm:h-20 sm:w-20"
              />
            </div>
          </div>

          <div className="px-5 py-7 sm:px-8 sm:py-9">
            <div className="text-[11px] uppercase tracking-[0.32em] text-[#f5c11c]/85">
              Featured · Tier {featuredEvent.tier}
            </div>
            <h2 className="mt-2 pr-24 font-serif text-3xl font-semibold leading-[0.95] text-white sm:pr-28 sm:text-4xl md:text-5xl">
              {featuredEvent.name}
            </h2>
            <p className="mt-3 max-w-md text-sm text-white/70 sm:text-base">
              The season&rsquo;s second major is here. Draft your six golfers, lock your picks
              before Thursday, and battle it out at Aronimink.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Link
                href="/draft"
                className="rounded-xl bg-[#f5c11c] px-4 py-2.5 text-sm font-semibold text-[#0d1640]"
              >
                Enter the Draft →
              </Link>
              <Link
                href="/leaderboard"
                className="rounded-xl border border-white/15 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-white/85"
              >
                Player Leaderboard
              </Link>
              {featuredEvent.starts_at && (
                <span className="text-xs text-white/55">
                  Starts:{" "}
                  {new Date(featuredEvent.starts_at).toLocaleDateString(undefined, {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              )}
            </div>
          </div>
        </section>
      ) : liveEvent ? (
        <section
          className="relative overflow-hidden rounded-[1.75rem] border border-[#143a30] text-[#e9e3d1]"
          style={{
            background:
              "radial-gradient(circle at 20% 0%, rgba(74, 222, 128, 0.12), transparent 35%)," +
              "radial-gradient(circle at 82% 12%, rgba(245, 193, 28, 0.08), transparent 30%)," +
              "linear-gradient(180deg, #0b2a22 0%, #08201a 70%, #06181430 100%)",
          }}
        >
          <div className="px-5 py-7 sm:px-8 sm:py-9">
            <div className="text-[11px] uppercase tracking-[0.32em] text-[#f5c11c]/80">
              Live now · Tier {liveEvent.tier}
            </div>
            <h2 className="mt-2 font-serif text-3xl font-semibold leading-[0.95] text-white sm:text-4xl md:text-5xl">
              {liveEvent.name}
            </h2>

            {topGolfers.length > 0 ? (
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3 backdrop-blur">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-white/50">Leader</div>
                  <div className="mt-1 truncate text-sm font-semibold text-white">{topGolfers[0].golfer}</div>
                  <div className="mt-0.5 text-xs text-[#4ade80]">
                    {formatToPar(tournamentRowToPar(topGolfers[0]) ?? 0)}
                    {topGolfers[0].drafted_by.length > 0 && ` · ${topGolfers[0].drafted_by.join(", ")}`}
                  </div>
                </div>
                {topGolfers[1] && (
                  <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3 backdrop-blur">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-white/50">Chasing</div>
                    <div className="mt-1 truncate text-sm font-semibold text-white">{topGolfers[1].golfer}</div>
                    <div className="mt-0.5 text-xs text-[#f5c11c]">
                      {formatToPar(tournamentRowToPar(topGolfers[1]) ?? 0)}
                      {topGolfers[1].drafted_by.length > 0 && ` · ${topGolfers[1].drafted_by.join(", ")}`}
                    </div>
                  </div>
                )}
                {topPool[0] && (
                  <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3 backdrop-blur">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-white/50">Pool leader</div>
                    <div className="mt-1 truncate text-sm font-semibold text-white">{topPool[0].row.entrant_name}</div>
                    <div className="mt-0.5 text-xs text-white/70">
                      {topPool[0].toPar !== null ? formatToPar(topPool[0].toPar) : "—"} combined
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-6 text-sm text-white/60">
                No live scores synced yet for {liveEvent.name}. Run a sync from{" "}
                <Link href="/admin" className="underline">Admin</Link> to populate.
              </p>
            )}
          </div>
        </section>
      ) : openEntryEvents.length > 0 ? (
        <section className="space-y-3">
          <div className="text-[11px] uppercase tracking-[0.28em] text-muted px-1">Up next</div>
          {openEntryEvents.map((event) => (
            <div key={event.event_id} className="soft-card rounded-[1.5rem] border bg-surface/70 p-5">
              <h2 className="mt-1 text-2xl font-semibold text-info">{event.name}</h2>
              <p className="mt-1 text-sm text-muted">
                Tier {event.tier} · {event.status}
                {event.starts_at &&
                  ` · starts ${new Date(event.starts_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}
              </p>
              <Link
                href={`/events/${event.slug}`}
                className="mt-4 inline-flex rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white"
              >
                Open event →
              </Link>
            </div>
          ))}
        </section>
      ) : nextEvent ? (
        <section className="soft-card rounded-[1.5rem] border bg-surface/70 p-5">
          <div className="text-[11px] uppercase tracking-[0.28em] text-muted">Up next</div>
          <h2 className="mt-1 text-2xl font-semibold text-info">{nextEvent.name}</h2>
          <p className="mt-1 text-sm text-muted">
            Tier {nextEvent.tier} · {nextEvent.status}
            {nextEvent.starts_at &&
              ` · starts ${new Date(nextEvent.starts_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}
          </p>
          <Link
            href={`/events/${nextEvent.slug}`}
            className="mt-4 inline-flex rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white"
          >
            Open event →
          </Link>
        </section>
      ) : (
        <section className="soft-card rounded-[1.5rem] border bg-surface/70 p-5">
          <div className="text-[11px] uppercase tracking-[0.28em] text-muted">Quiet right now</div>
          <p className="mt-2 text-sm text-text">
            No live events. <Link href="/calendar" className="underline">Check the calendar</Link> for what&rsquo;s coming up.
          </p>
        </section>
      )}

      {/* Coming soon — bracket family deferred until decisions land. */}
      {comingSoonEvents.length > 0 && (
        <section className="soft-card rounded-[1.5rem] border bg-surface/70 p-4 sm:p-5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-muted">Coming soon</div>
              <h3 className="mt-1 text-lg font-semibold">More to enter</h3>
            </div>
          </div>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {comingSoonEvents.map((e) => (
              <li
                key={e.event_id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-bg/40 px-3 py-3"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-text" title={e.name}>
                    {e.name}
                  </div>
                  <div className="mt-0.5 text-[11px] uppercase tracking-wide text-muted">
                    Tier {e.tier} · Coming soon
                  </div>
                </div>
                <span className="shrink-0 rounded-md border border-border/40 bg-surface/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                  Soon
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Tournament leaderboard */}
      {liveEvent && topGolfers.length > 0 && (
        <section className="soft-card rounded-[1.5rem] border bg-surface/70 p-4 sm:p-5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-muted">Tournament</div>
              <h3 className="mt-1 text-lg font-semibold">Top of the leaderboard</h3>
            </div>
            <Link href="/tournament" className="text-xs font-semibold text-accent underline-offset-4 hover:underline">
              Full board →
            </Link>
          </div>
          <ul className="mt-4 divide-y divide-border/30 rounded-xl border border-border/30 bg-bg/40">
            {topGolfers.map((row) => {
              const toPar = tournamentRowToPar(row);
              return (
                <li key={row.golfer} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="w-8 shrink-0 text-[11px] font-semibold tabular-nums text-muted">
                    {row.position_text ?? row.position ?? "—"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{row.golfer}</div>
                    {row.drafted_by.length > 0 && (
                      <div className="flex items-center gap-1.5 text-[11px] text-muted">
                        {row.drafted_by.slice(0, 1).map((d) => (
                          <Avatar key={d} name={d} size="xs" />
                        ))}
                        <span className="truncate">{row.drafted_by.join(", ")}</span>
                      </div>
                    )}
                  </div>
                  <span
                    className={[
                      "shrink-0 text-sm font-semibold tabular-nums",
                      toPar === null
                        ? "text-muted"
                        : toPar < -5
                          ? "text-emerald-600"
                          : toPar < 0
                            ? ""
                            : "text-muted",
                    ].join(" ")}
                  >
                    {toPar === null ? "—" : formatToPar(toPar)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Pool standings — visible on mobile (rail handles desktop) */}
      <section className="soft-card rounded-[1.5rem] border bg-surface/70 p-4 sm:p-5 lg:hidden">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-muted">Pool · season</div>
            <h3 className="mt-1 text-lg font-semibold">Standings</h3>
          </div>
          <Link href="/leaderboard" className="text-xs font-semibold text-accent underline-offset-4 hover:underline">
            Full pool →
          </Link>
        </div>
        {seasonRows.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            {loaded ? "No standings yet. Once an event finishes, points land here." : "Loading…"}
          </p>
        ) : (
          <ol className="mt-3 space-y-1.5">
            {seasonRows.map((s, i) => (
              <li
                key={s.entrant_id}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm"
              >
                <span className="w-4 shrink-0 text-xs font-semibold tabular-nums text-muted">{i + 1}</span>
                <Avatar name={s.display_name} size="sm" />
                <span className="flex-1 truncate font-medium">{s.display_name}</span>
                <span className="shrink-0 font-semibold tabular-nums">{Number(s.total_points).toFixed(1)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <div className="h-32 animate-pulse rounded-[1.5rem] border border-border/40 bg-surface/50" />
          <div className="h-48 animate-pulse rounded-[1.5rem] border border-border/40 bg-surface/40" />
        </div>
      }
    >
      <AppShell title="Home" subtitle="What&rsquo;s happening across the season">
        <HomeContent />
      </AppShell>
    </Suspense>
  );
}
