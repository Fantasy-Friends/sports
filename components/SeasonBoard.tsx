"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getErrorMessage } from "@/lib/error";

type LeaderboardRow = {
  entrant_id: string;
  display_name: string;
  event_points: number;
  bonus_points: number;
  total_points: number;
  events_scored: number;
  bonuses_earned: number;
};

type Season = { season_id: string; year: number; label: string };

type Props = {
  year: number;
  compact?: boolean;
};

export default function SeasonBoard({ year, compact = false }: Props) {
  const [season, setSeason] = useState<Season | null>(null);
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/season/${year}/leaderboard`, { cache: "no-store" });
        if (!res.ok) throw new Error(`Failed to load season (${res.status})`);
        const body = await res.json();
        if (cancelled) return;
        setSeason(body.season);
        setRows(body.rows ?? []);
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err, "Failed to load season"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [year]);

  if (loading) {
    return (
      <div className="rounded-[1.5rem] border border-border/20 bg-surface/35 p-6 text-sm text-muted">
        Loading season leaderboard…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-[1.5rem] border border-danger/40 bg-surface/35 p-6 text-sm text-danger">
        {error}
      </div>
    );
  }

  if (!season) {
    return (
      <div className="rounded-[1.5rem] border border-border/20 bg-surface/35 p-6 text-sm text-muted">
        No {year} season found. Run the schema seed to populate.
      </div>
    );
  }

  const displayRows = compact ? rows.slice(0, 3) : rows;

  return (
    <div className="soft-card rounded-[1.75rem] border border-border/20 bg-surface/35 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[11px] uppercase tracking-[0.28em] text-muted">Season standings</div>
          <div className="text-lg font-semibold text-info">{season.label}</div>
        </div>
        {compact ? (
          <Link
            href={`/season/${year}`}
            className="rounded-lg border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/20"
          >
            Full leaderboard →
          </Link>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-[0.22em] text-muted">
              <th className="px-2 py-2 font-medium">#</th>
              <th className="px-2 py-2 font-medium">Player</th>
              <th className="hidden px-2 py-2 text-right font-medium sm:table-cell">Events</th>
              <th className="hidden px-2 py-2 text-right font-medium sm:table-cell">Bonus</th>
              <th className="px-2 py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-2 py-6 text-center text-sm text-muted">
                  No finalized events yet. Points land here once the commissioner closes an event.
                </td>
              </tr>
            ) : (
              displayRows.map((row, idx) => (
                <tr
                  key={row.entrant_id}
                  className="border-t border-border/15 text-text"
                >
                  <td className="px-2 py-2 font-semibold text-muted">{idx + 1}</td>
                  <td className="px-2 py-2">
                    <div className="font-semibold">{row.display_name}</div>
                    <div className="mt-0.5 text-[11px] text-muted sm:hidden">
                      Events {row.event_points.toFixed(1)} ({row.events_scored}) · Bonus {row.bonus_points.toFixed(1)} ({row.bonuses_earned})
                    </div>
                  </td>
                  <td className="hidden px-2 py-2 text-right tabular-nums sm:table-cell">
                    {row.event_points.toFixed(1)}
                    <span className="ml-1 text-[11px] text-muted">({row.events_scored})</span>
                  </td>
                  <td className="hidden px-2 py-2 text-right tabular-nums sm:table-cell">
                    {row.bonus_points.toFixed(1)}
                    <span className="ml-1 text-[11px] text-muted">({row.bonuses_earned})</span>
                  </td>
                  <td className="px-2 py-2 text-right text-base font-semibold tabular-nums text-info">
                    {row.total_points.toFixed(1)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
