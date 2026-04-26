"use client";

import { useEffect, useMemo, useState } from "react";
import { getErrorMessage } from "@/lib/error";
import { isTournamentPollingActive, TournamentSlug, TOURNAMENTS } from "@/lib/tournaments";
import { formatLastUpdated, useAutoRefreshValue } from "@/lib/useAutoRefresh";
import { useRequireEntrant } from "@/lib/useRequireEntrant";

type TournamentRow = {
  golfer: string;
  handicap: number;
  rank: number | null;
  gross_total: number | null;
  live_total_to_par?: number | null;
  live_current_round_score?: number | null;
  live_thru?: string | null;
  position: number | null;
  position_text: string | null;
  drafted_by: string[];
  rounds: Array<{
    round_number: number;
    strokes: number | null;
    score_status: string;
  }>;
};

type TournamentMetaOption = {
  tournament_slug: string;
  label: string;
  round_par?: number;
  draft_open?: boolean;
  draft_active_now?: boolean;
};

export default function TournamentLeaderboardPage() {
  const basePoolId = process.env.NEXT_PUBLIC_POOL_ID || "2026-majors";
  const [selectedTournament, setSelectedTournament] = useState("masters");
  const [availableTournaments, setAvailableTournaments] = useState<TournamentMetaOption[]>(
    TOURNAMENTS.map((item) => ({ tournament_slug: item.slug, label: item.label }))
  );
  const [rows, setRows] = useState<TournamentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);

  useRequireEntrant({ ready: authed !== null, entrant: authed ? { is_admin: false } : null });

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const res = await fetch(`/api/auth/me`, { cache: "no-store" });
        const json = await res.json();
        if (!cancelled) setAuthed(Boolean(json?.entrant));
      } catch {
        if (!cancelled) setAuthed(false);
      }
    }
    void check();
    return () => {
      cancelled = true;
    };
  }, []);

  const poolId = useMemo(() => `${basePoolId}-${selectedTournament}`, [basePoolId, selectedTournament]);

  const selectedTournamentMeta = availableTournaments.find(
    (item) => item.tournament_slug === selectedTournament
  );
  const pollingActive = isTournamentPollingActive(selectedTournament as TournamentSlug);
  const refreshTick = useAutoRefreshValue(60000, pollingActive);

  function formatToPar(row: TournamentRow) {
    if (typeof row.live_total_to_par === "number") {
      if (row.live_total_to_par === 0) return "E";
      return row.live_total_to_par > 0 ? `+${row.live_total_to_par}` : `${row.live_total_to_par}`;
    }
    if (row.gross_total === null || row.rounds.length === 0) {
      return "-";
    }
    const roundPar = selectedTournamentMeta?.round_par ?? 72;
    const totalPar = row.rounds.length * roundPar;
    const delta = row.gross_total - totalPar;
    if (delta === 0) return "E";
    return delta > 0 ? `+${delta}` : `${delta}`;
  }

  useEffect(() => {
    let cancelled = false;

    async function loadTournamentOptions() {
      try {
        const res = await fetch(`/api/tournament-meta?pool_id=${encodeURIComponent(poolId)}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? "Failed to load tournament metadata");
        const rows = (json.rows ?? []) as TournamentMetaOption[];
        if (!cancelled && rows.length > 0) {
          setAvailableTournaments(rows);
          if (!rows.some((row) => row.tournament_slug === selectedTournament)) {
            setSelectedTournament(rows[0].tournament_slug);
          }
        }
      } catch {
        if (!cancelled) {
          setAvailableTournaments(TOURNAMENTS.map((item) => ({ tournament_slug: item.slug, label: item.label })));
        }
      }
    }

    void loadTournamentOptions();
    return () => {
      cancelled = true;
    };
  }, [poolId, selectedTournament, refreshTick]);

  useEffect(() => {
    let cancelled = false;

    async function loadRows() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(
          `/api/leaderboards/tournament?pool_id=${encodeURIComponent(poolId)}&tournament=${encodeURIComponent(selectedTournament)}`,
          { cache: "no-store" }
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? "Failed to load tournament leaderboard");
        if (!cancelled) {
          setRows((json.rows ?? []) as TournamentRow[]);
          setLastUpdated(new Date());
        }
      } catch (e: unknown) {
        if (!cancelled) setError(getErrorMessage(e, "Failed to load tournament leaderboard"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadRows();
    return () => {
      cancelled = true;
    };
  }, [poolId, selectedTournament, refreshTick]);

  return (
    <main className="space-y-6">
      <section className="soft-card rounded-[1.75rem] border bg-surface/70 px-4 py-5 backdrop-blur-xl sm:px-6 sm:py-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.28em] text-muted">Live tournament</p>
            <h1 className="mt-1 text-xl font-semibold sm:text-2xl">Tournament Leaderboard</h1>
          </div>
          <select
            value={selectedTournament}
            onChange={(e) => setSelectedTournament(e.target.value)}
            aria-label="Tournament"
            className="glass-input rounded-xl px-3 py-2 text-sm"
          >
            {availableTournaments.map((tournament) => (
              <option key={tournament.tournament_slug} value={tournament.tournament_slug}>
                {tournament.label}
              </option>
            ))}
          </select>
        </div>
        <p className="mt-3 text-xs text-muted">
          Raw strokes and score to par, round by round &middot; {pollingActive ? "live" : "paused outside tournament hours"} &middot; updated {formatLastUpdated(lastUpdated)}
        </p>
      </section>

      {loading && (
        <section className="soft-card rounded-[1.5rem] border bg-surface/70 p-4 text-sm text-muted backdrop-blur-xl">
          Loading tournament leaderboard...
        </section>
      )}

      {error && (
        <section className="rounded-[1.5rem] border border-danger/25 bg-surface/70 p-4 text-sm text-danger backdrop-blur-xl">
          {error}
        </section>
      )}

      {!loading && !error && rows.length === 0 && (
        <section className="soft-card rounded-[1.5rem] border bg-surface/70 p-4 text-sm text-muted backdrop-blur-xl">
          No tournament scores yet. Seed `tournament_round_scores` for this tournament to populate the leaderboard.
        </section>
      )}

      {!loading && !error && rows.length > 0 && (
        <section className="soft-card rounded-[1.5rem] border bg-surface/70 p-3 backdrop-blur-xl sm:p-4">
          <ul className="space-y-2 md:hidden">
            {rows.map((row) => (
              <li
                key={row.golfer}
                className="soft-subtle rounded-[1.25rem] border px-3 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex min-w-[2rem] justify-center rounded-md bg-surface/60 px-1.5 py-0.5 text-xs font-semibold text-muted">
                        {row.position_text ?? row.position ?? "-"}
                      </span>
                      <div className="truncate text-sm font-semibold">{row.golfer}</div>
                    </div>
                    <div className="mt-1 text-xs text-muted">
                      Rank {row.rank ?? "-"} &middot; {row.gross_total ?? "-"} strokes
                      {row.live_thru ? ` · Thru ${row.live_thru}` : ""}
                      {typeof row.live_current_round_score === "number"
                        ? ` · Rnd ${row.live_current_round_score > 0 ? `+${row.live_current_round_score}` : row.live_current_round_score}`
                        : ""}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-lg font-semibold">{formatToPar(row)}</div>
                    <div className="text-[10px] uppercase tracking-wide text-muted">To Par</div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-4 gap-1.5">
                  {[1, 2, 3, 4].map((roundNumber) => {
                    const round = row.rounds.find((entry) => entry.round_number === roundNumber) ?? null;
                    return (
                      <div
                        key={`${row.golfer}-m-${roundNumber}`}
                        className="rounded-lg border border-border/30 bg-surface/40 px-2 py-1.5 text-center"
                      >
                        <div className="text-[10px] uppercase tracking-wide text-muted">R{roundNumber}</div>
                        <div className="text-sm font-semibold">{round?.strokes ?? "-"}</div>
                        {round?.score_status ? (
                          <div className="text-[9px] uppercase text-muted">{round.score_status}</div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 text-xs text-muted">
                  {row.drafted_by.length > 0 ? `Drafted by ${row.drafted_by.join(", ")}` : "Undrafted"}
                </div>
              </li>
            ))}
          </ul>

          <div className="soft-subtle hidden overflow-auto rounded-[1.25rem] border md:block">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-3 text-left">Pos</th>
                  <th className="px-3 py-3 text-left">Golfer</th>
                  <th className="px-3 py-3 text-right">Strokes</th>
                  <th className="px-3 py-3 text-right">To Par</th>
                  <th className="px-3 py-3 text-right">R1</th>
                  <th className="px-3 py-3 text-right">R2</th>
                  <th className="px-3 py-3 text-right">R3</th>
                  <th className="px-3 py-3 text-right">R4</th>
                  <th className="px-3 py-3 text-left">Drafted By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {rows.map((row) => (
                  <tr key={row.golfer}>
                    <td className="px-3 py-3">{row.position_text ?? row.position ?? "-"}</td>
                    <td className="px-3 py-3">
                      <div className="font-medium">{row.golfer}</div>
                      <div className="text-xs text-muted">Rank {row.rank ?? "-"}</div>
                      {row.live_thru && (
                        <div className="text-xs text-muted">
                          Thru {row.live_thru}
                          {typeof row.live_current_round_score === "number"
                            ? ` | Rnd ${row.live_current_round_score > 0 ? `+${row.live_current_round_score}` : row.live_current_round_score}`
                            : ""}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">{row.gross_total ?? "-"}</td>
                    <td className="px-3 py-3 text-right font-semibold">
                      {formatToPar(row)}
                    </td>
                    {[1, 2, 3, 4].map((roundNumber) => {
                      const round = row.rounds.find((entry) => entry.round_number === roundNumber) ?? null;
                      return (
                        <td key={`${row.golfer}-${roundNumber}`} className="px-3 py-3 text-right">
                          <div>{round?.strokes ?? "-"}</div>
                          <div className="text-[11px] uppercase text-muted">
                            {round?.score_status ?? ""}
                          </div>
                        </td>
                      );
                    })}
                    <td className="px-3 py-3 text-xs text-muted">
                      {row.drafted_by.length > 0 ? row.drafted_by.join(", ") : "Undrafted"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
