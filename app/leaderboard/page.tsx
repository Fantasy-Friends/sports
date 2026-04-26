"use client";

import { useEffect, useMemo, useState } from "react";
import { getErrorMessage } from "@/lib/error";
import { isTournamentPollingActive, TournamentSlug, TOURNAMENTS } from "@/lib/tournaments";
import { formatLastUpdated, useAutoRefreshValue } from "@/lib/useAutoRefresh";
import { useRequireEntrant } from "@/lib/useRequireEntrant";

type ScoringGolfer = {
  golfer: string;
  handicap: number;
  gross_total: number | null;
  net_total: number | null;
  live_total_to_par?: number | null;
  live_net_to_par?: number | null;
  live_current_round_score?: number | null;
  live_thru?: string | null;
  position: number | null;
  position_text: string | null;
  rounds: Array<{
    round_number: number;
    strokes: number | null;
    score_status: string;
  }>;
};

type PlayerLeaderboardRow = {
  entrant_name: string;
  team_total: number;
  scoring_golfers: ScoringGolfer[];
  bench_golfers: ScoringGolfer[];
  tie_break_5_position: number | null;
  tie_break_6_position: number | null;
};

type TournamentMetaOption = {
  tournament_slug: string;
  label: string;
  round_par?: number;
  draft_open?: boolean;
  draft_active_now?: boolean;
};

export default function PlayerLeaderboardPage() {
  const basePoolId = process.env.NEXT_PUBLIC_POOL_ID || "2026-majors";
  const [selectedTournament, setSelectedTournament] = useState("masters");
  const [selectedEntrant, setSelectedEntrant] = useState("");
  const [activeView, setActiveView] = useState<"standings" | "scorecard">("standings");
  const [availableTournaments, setAvailableTournaments] = useState<TournamentMetaOption[]>(
    TOURNAMENTS.map((item) => ({ tournament_slug: item.slug, label: item.label }))
  );
  const [rows, setRows] = useState<PlayerLeaderboardRow[]>([]);
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

  function formatToPar(value: number | null) {
    if (value === null || Number.isNaN(value)) return "-";
    if (value === 0) return "E";
    return value > 0 ? `+${value}` : `${value}`;
  }

  function golferToPar(golfer: ScoringGolfer) {
    if (typeof golfer.live_net_to_par === "number") {
      return Math.round(golfer.live_net_to_par);
    }
    if (typeof golfer.live_total_to_par === "number") {
      return Math.round(golfer.live_total_to_par - golfer.handicap);
    }
    if (golfer.net_total === null) {
      return null;
    }
    const roundPar = selectedTournamentMeta?.round_par ?? 72;
    const totalPar = golfer.rounds.length * roundPar;
    return Math.round(golfer.net_total - totalPar);
  }

  function golferGrossToPar(golfer: ScoringGolfer) {
    if (typeof golfer.live_total_to_par === "number") {
      return Math.round(golfer.live_total_to_par);
    }
    if (golfer.gross_total === null) {
      return null;
    }
    const roundPar = selectedTournamentMeta?.round_par ?? 72;
    const totalPar = golfer.rounds.length * roundPar;
    return Math.round(golfer.gross_total - totalPar);
  }

  function teamToPar(row: PlayerLeaderboardRow) {
    return row.scoring_golfers.reduce((sum, golfer) => sum + (golferToPar(golfer) ?? 0), 0);
  }

  const selectedEntrantRow =
    rows.find((row) => row.entrant_name === selectedEntrant) ?? rows[0] ?? null;

  function displayedGrossToPar(golfer: ScoringGolfer) {
    if (typeof golfer.live_total_to_par === "number") {
      return Math.round(golfer.live_total_to_par);
    }
    return golferGrossToPar(golfer);
  }

  function displayedNetToPar(golfer: ScoringGolfer) {
    if (typeof golfer.live_total_to_par === "number") {
      return Math.round(golfer.live_total_to_par - golfer.handicap);
    }
    return golferToPar(golfer);
  }

  useEffect(() => {
    let cancelled = false;

    async function loadTournamentOptions() {
      try {
        const res = await fetch(`/api/tournament-meta?pool_id=${encodeURIComponent(poolId)}`, {
          cache: "no-store",
        });
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
          `/api/leaderboards/player?pool_id=${encodeURIComponent(poolId)}&tournament=${encodeURIComponent(selectedTournament)}`,
          { cache: "no-store" }
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? "Failed to load player leaderboard");
        if (!cancelled) {
          const loadedRows = (json.rows ?? []) as PlayerLeaderboardRow[];
          setRows(loadedRows);
          setLastUpdated(new Date());
          setSelectedEntrant((current) =>
            current && loadedRows.some((row) => row.entrant_name === current)
              ? current
              : (loadedRows[0]?.entrant_name ?? "")
          );
        }
      } catch (e: unknown) {
        if (!cancelled) setError(getErrorMessage(e, "Failed to load player leaderboard"));
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
    <main className="space-y-5">
      <section className="soft-card rounded-[1.75rem] border bg-surface/70 px-4 py-5 backdrop-blur-xl sm:px-6 sm:py-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.28em] text-muted">Pool scoring</p>
            <h1 className="mt-1 text-xl font-semibold sm:text-2xl">Player Leaderboard</h1>
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
          Best four net scores per entrant &middot; {pollingActive ? "live" : "paused outside tournament hours"} &middot; updated {formatLastUpdated(lastUpdated)}
        </p>
      </section>

      <nav
        aria-label="View"
        className="soft-card -mx-1 overflow-x-auto rounded-[1.25rem] border border-border bg-surface/60 p-1"
      >
        <div className="flex min-w-max gap-1">
          {(["standings", "scorecard"] as const).map((view) => {
            const active = activeView === view;
            return (
              <button
                key={view}
                type="button"
                onClick={() => setActiveView(view)}
                aria-current={active ? "page" : undefined}
                className={[
                  "whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold capitalize transition-colors",
                  active
                    ? "bg-accent text-white shadow-[0_10px_24px_rgba(99,91,255,0.22)]"
                    : "text-muted hover:bg-surface/80 hover:text-text",
                ].join(" ")}
              >
                {view}
              </button>
            );
          })}
        </div>
      </nav>

      {loading && (
        <section className="soft-card rounded-[1.5rem] border bg-surface/70 p-4 text-sm text-muted backdrop-blur-xl">
          Loading player leaderboard...
        </section>
      )}

      {error && (
        <section className="rounded-[1.5rem] border border-danger/25 bg-surface/70 p-4 text-sm text-danger backdrop-blur-xl">
          {error}
        </section>
      )}

      {!loading && !error && rows.length === 0 && (
        <section className="soft-card rounded-[1.5rem] border bg-surface/70 p-4 text-sm text-muted backdrop-blur-xl">
          No scoring data yet. Seed `tournament_round_scores` for this tournament to populate the leaderboard.
        </section>
      )}

      {!loading && !error && rows.length > 0 && (
        <>
          {activeView === "standings" && (
          <section className="soft-card rounded-[1.5rem] border bg-surface/70 p-4 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">Standings</h2>
                <div className="mt-1 text-xs text-muted">
                  Tap an entrant to see their full scorecard.
                </div>
              </div>
            </div>

            <ul className="mt-4 space-y-2 md:hidden">
              {rows.map((row, index) => {
                const selected = selectedEntrantRow?.entrant_name === row.entrant_name;
                return (
                  <li key={`m-${row.entrant_name}`}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedEntrant(row.entrant_name);
                        setActiveView("scorecard");
                      }}
                      aria-pressed={selected}
                      className={[
                        "soft-subtle flex w-full items-center justify-between gap-3 rounded-[1.25rem] border px-3 py-3 text-left transition-colors",
                        selected ? "border-accent/40 bg-accent/10" : "hover:bg-surface/60",
                      ].join(" ")}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface/70 text-sm font-semibold text-muted">
                          {index + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold">{row.entrant_name}</div>
                          <div className="text-xs text-muted">
                            TB 5th {row.tie_break_5_position ?? "-"} &middot; 6th {row.tie_break_6_position ?? "-"}
                          </div>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-lg font-semibold">{formatToPar(teamToPar(row))}</div>
                        <div className="text-[10px] uppercase tracking-wide text-muted">Team</div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="soft-subtle mt-4 hidden overflow-auto rounded-[1.25rem] border md:block">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-3 py-3 text-left">Rank</th>
                    <th className="px-3 py-3 text-left">Entrant</th>
                    <th className="px-3 py-3 text-right">Team Total</th>
                    <th className="px-3 py-3 text-right">5th</th>
                    <th className="px-3 py-3 text-right">6th</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/70">
                  {rows.map((row, index) => {
                    const selected = selectedEntrantRow?.entrant_name === row.entrant_name;
                    return (
                      <tr
                        key={row.entrant_name}
                        className={selected ? "bg-accent/10" : undefined}
                      >
                        <td className="px-3 py-3 font-semibold">{index + 1}</td>
                        <td className="px-3 py-3">
                          <button
                            type="button"
                            onClick={() => {
                        setSelectedEntrant(row.entrant_name);
                        setActiveView("scorecard");
                      }}
                            className="font-medium underline-offset-4 hover:underline"
                          >
                            {row.entrant_name}
                          </button>
                        </td>
                        <td className="px-3 py-3 text-right font-semibold">{formatToPar(teamToPar(row))}</td>
                        <td className="px-3 py-3 text-right">{row.tie_break_5_position ?? "-"}</td>
                        <td className="px-3 py-3 text-right">{row.tie_break_6_position ?? "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
          )}

          {activeView === "scorecard" && (
            selectedEntrantRow ? (
            <section className="soft-card rounded-[1.5rem] border bg-surface/70 p-4 backdrop-blur-xl">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">{selectedEntrantRow.entrant_name} Scorecard</h2>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span>Best four count toward the team total. Bench holds tiebreakers.</span>
                    <select
                      value={selectedEntrant}
                      onChange={(e) => setSelectedEntrant(e.target.value)}
                      className="glass-input rounded-md px-2 py-1 text-xs"
                    >
                      {rows.map((row) => (
                        <option key={row.entrant_name} value={row.entrant_name}>
                          {row.entrant_name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs uppercase tracking-wide text-muted">Team Total</div>
                  <div className="text-2xl font-semibold">{formatToPar(teamToPar(selectedEntrantRow))}</div>
                </div>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="soft-subtle rounded-[1.25rem] border p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted">Current Best Four</div>
                  <div className="mt-3 space-y-2">
                    {selectedEntrantRow.scoring_golfers.map((golfer) => (
                      <div key={`${selectedEntrantRow.entrant_name}-${golfer.golfer}`} className="flex items-center justify-between text-sm">
                        <div>
                          <div className="font-medium">{golfer.golfer}</div>
                          <div className="text-xs text-muted">
                            Gross {formatToPar(displayedGrossToPar(golfer))} | Hdcp -{Math.round(golfer.handicap)}
                          </div>
                          {golfer.live_thru && (
                            <div className="text-xs text-muted">
                              Thru {golfer.live_thru}
                              {typeof golfer.live_current_round_score === "number"
                                ? ` | Rnd ${golfer.live_current_round_score > 0 ? `+${golfer.live_current_round_score}` : golfer.live_current_round_score}`
                                : ""}
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="font-semibold">{formatToPar(displayedNetToPar(golfer))}</div>
                          <div className="text-xs text-muted">{golfer.position_text ?? golfer.position ?? "-"}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="soft-subtle rounded-[1.25rem] border p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted">Bench</div>
                  <div className="mt-3 space-y-2">
                    {selectedEntrantRow.bench_golfers.length === 0 && (
                      <div className="text-sm text-muted">No bench golfers available yet.</div>
                    )}
                    {selectedEntrantRow.bench_golfers.map((golfer) => (
                      <div key={`${selectedEntrantRow.entrant_name}-bench-${golfer.golfer}`} className="flex items-center justify-between text-sm">
                        <div>
                          <div className="font-medium">{golfer.golfer}</div>
                          <div className="text-xs text-muted">
                            Gross {formatToPar(displayedGrossToPar(golfer))} | Hdcp -{Math.round(golfer.handicap)}
                          </div>
                          {golfer.live_thru && (
                            <div className="text-xs text-muted">
                              Thru {golfer.live_thru}
                              {typeof golfer.live_current_round_score === "number"
                                ? ` | Rnd ${golfer.live_current_round_score > 0 ? `+${golfer.live_current_round_score}` : golfer.live_current_round_score}`
                                : ""}
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="font-semibold">{formatToPar(displayedNetToPar(golfer))}</div>
                          <div className="text-xs text-muted">{golfer.position_text ?? golfer.position ?? "-"}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
            ) : (
              <section className="soft-card rounded-[1.5rem] border bg-surface/70 p-6 text-center text-sm text-muted backdrop-blur-xl">
                Tap an entrant in the Standings tab to see their scorecard here.
              </section>
            )
          )}
        </>
      )}
    </main>
  );
}
