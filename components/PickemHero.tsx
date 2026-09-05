"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { initialsFor, tintFor } from "@/lib/avatarTint";
import type { NflWeek } from "@/lib/nfl";

// Adaptive NFL Pick'em hero for the Home page.
//
// Before the week's first kickoff it's an ACTION card — "make your picks",
// the lock deadline, and whether you've picked yet. Once any game locks it
// flips to a live STANDINGS card for the week. Which week is "current" comes
// straight from ESPN (the same source the /pickem page uses), so nothing here
// needs a manual status flip in Supabase.
//
// Renders nothing (returns null) when there's no usable NFL week — offseason,
// an ESPN hiccup, or a signed-out visitor (the NFL routes are auth-gated).
// The parent date-gates on the events table so this only mounts in season.

type StandingRow = {
  entrant_id: string;
  display_name: string;
  total: number;
  correct: number;
};

function kickoffLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function Avatar({ name }: { name: string }) {
  return (
    <span
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold text-white"
      style={{ background: tintFor(name) }}
      aria-label={name}
    >
      {initialsFor(name)}
    </span>
  );
}

export default function PickemHero() {
  const [schedule, setSchedule] = useState<NflWeek | null>(null);
  const [myPickCount, setMyPickCount] = useState<number | null>(null);
  const [standings, setStandings] = useState<StandingRow[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        // ESPN's current week drives everything below.
        const schedRes = await fetch("/api/nfl/schedule", { cache: "no-store" });
        if (!schedRes.ok) throw new Error("schedule");
        const sched = (await schedRes.json()) as NflWeek;
        if (cancelled) return;
        if (!sched?.games?.length) throw new Error("empty");
        setSchedule(sched);

        const [picksRes, scoresRes] = await Promise.all([
          fetch(`/api/nfl/picks?week=${sched.week}`, { cache: "no-store" }),
          fetch(`/api/nfl/scores?week=${sched.week}`, { cache: "no-store" }),
        ]);
        if (cancelled) return;
        if (picksRes.ok) {
          const j = await picksRes.json();
          setMyPickCount(Array.isArray(j?.mine) ? j.mine.length : 0);
        }
        if (scoresRes.ok) {
          const j = await scoresRes.json();
          setStandings((j?.standings ?? []) as StandingRow[]);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const lockAt = useMemo(() => {
    if (!schedule) return null;
    const kicks = schedule.games
      .map((g) => new Date(g.kickoff).getTime())
      .filter((t) => Number.isFinite(t));
    return kicks.length ? new Date(Math.min(...kicks)).toISOString() : null;
  }, [schedule]);

  const anyLocked = useMemo(
    () => Boolean(schedule?.games.some((g) => g.locked)),
    [schedule],
  );

  if (failed || !schedule) return null;

  const week = schedule.week;
  const gameCount = schedule.game_count;
  const topStandings = standings
    .slice()
    .sort((a, b) => b.total - a.total)
    .slice(0, 3);

  // ── After first kickoff: live standings ────────────────────────────────
  if (anyLocked) {
    return (
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
            Live now · NFL Pick&rsquo;em
          </div>
          <h2 className="mt-2 font-serif text-3xl font-semibold leading-[0.95] text-white sm:text-4xl md:text-5xl">
            Week {week} Picks
          </h2>

          {topStandings.length > 0 ? (
            <ol className="mt-6 space-y-2">
              {topStandings.map((s, i) => (
                <li
                  key={s.entrant_id}
                  className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3 backdrop-blur"
                >
                  <span className="w-4 shrink-0 text-sm font-semibold tabular-nums text-white/50">
                    {i + 1}
                  </span>
                  <Avatar name={s.display_name} />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
                    {s.display_name}
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-[#4ade80]">
                    {Number(s.total).toFixed(1)} pts
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-6 text-sm text-white/60">
              Games are underway — points will land here as finals come in.
            </p>
          )}

          <div className="mt-5">
            <Link
              href="/pickem"
              className="inline-flex rounded-xl bg-[#f5c11c] px-4 py-2.5 text-sm font-semibold text-[#0b2a22] transition-transform active:scale-[0.97]"
            >
              Full board →
            </Link>
          </div>
        </div>
      </section>
    );
  }

  // ── Before first kickoff: action card ──────────────────────────────────
  const picked = myPickCount ?? 0;
  const pickStatus =
    myPickCount === null
      ? null
      : picked >= gameCount && gameCount > 0
        ? "Your picks are in ✓"
        : picked > 0
          ? `You've picked ${picked} of ${gameCount}`
          : "You haven't picked yet";

  return (
    <section
      className="relative overflow-hidden rounded-[1.75rem] border border-[#1e3a8a]/50 text-white"
      style={{
        background:
          "radial-gradient(circle at 15% 0%, rgba(59, 130, 246, 0.13), transparent 40%)," +
          "radial-gradient(circle at 85% 12%, rgba(245, 193, 28, 0.09), transparent 32%)," +
          "linear-gradient(180deg, #0d1640 0%, #080e2a 70%, #04091800 100%)",
      }}
    >
      <div className="px-5 py-7 sm:px-8 sm:py-9">
        <div className="text-[11px] uppercase tracking-[0.32em] text-[#f5c11c]/85">
          This week · NFL Pick&rsquo;em
        </div>
        <h2 className="mt-2 font-serif text-3xl font-semibold leading-[0.95] text-white sm:text-4xl md:text-5xl">
          Week {week} — make your picks
        </h2>
        <p className="mt-3 max-w-md text-sm text-white/70 sm:text-base">
          Rank your confidence across all {gameCount} games, then bet or build a parlay
          before kickoff.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Link
            href="/pickem"
            className="rounded-xl bg-[#f5c11c] px-4 py-2.5 text-sm font-semibold text-[#0d1640] transition-transform active:scale-[0.97]"
          >
            {picked > 0 ? "Review your picks →" : "Make your picks →"}
          </Link>
          {lockAt && (
            <span className="text-xs text-white/55">Locks {kickoffLabel(lockAt)}</span>
          )}
        </div>
        {pickStatus && (
          <div className="mt-3 text-xs font-semibold text-white/75">{pickStatus}</div>
        )}
      </div>
    </section>
  );
}
