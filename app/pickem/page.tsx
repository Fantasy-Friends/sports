"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { getErrorMessage } from "@/lib/error";
import type { NflGame, NflWeek } from "@/lib/nfl";

type PickRow = {
  game_id: string;
  picked_team: string;
  confidence: number;
  is_bet: boolean;
  bet_decimal: number | null;
  parlay_group: number | null;
};

type RevealedPick = PickRow & { display_name: string };

type LocalPick = { team: string; confidence: number | null; bet: boolean; parlay: boolean };

type ParlaySummary = {
  legs: number;
  stake: number;
  combined_decimal: number;
  status: "pending" | "won" | "busted";
  points: number;
};

type StandingRow = {
  entrant_id: string;
  display_name: string;
  total: number;
  correct: number;
  finals_played: number;
  straight_points: number;
  bet_points: number;
  parlay: ParlaySummary | null;
};

const WEEKS = Array.from({ length: 18 }, (_, i) => i + 1);
const GREEN = "#22c55e";
const AMBER = "#f59e0b";

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

function mlLabel(ml: number | null): string {
  if (ml === null) return "";
  return ml > 0 ? `+${ml}` : String(ml);
}

function teamDec(game: NflGame, team: string): number | null {
  if (!game.odds) return null;
  if (team === game.home.abbr) return game.odds.home_dec;
  if (team === game.away.abbr) return game.odds.away_dec;
  return null;
}

// Line label under a team: real moneyline when posted, else the fair
// spread-derived payout multiple.
function lineLabel(ml: number | null, dec: number | null): string {
  if (ml !== null) return `ML ${mlLabel(ml)}`;
  if (dec !== null) return `${dec.toFixed(2)}x`;
  return "";
}

export default function PickemPage() {
  const [week, setWeek] = useState<number | null>(null);
  const [schedule, setSchedule] = useState<NflWeek | null>(null);
  const [picks, setPicks] = useState<Record<string, LocalPick>>({});
  const [revealed, setRevealed] = useState<RevealedPick[]>([]);
  const [standings, setStandings] = useState<StandingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [dirty, setDirty] = useState(false);

  const loadStandings = useCallback(async (w: number) => {
    try {
      const res = await fetch(`/api/nfl/scores?week=${w}`, { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      setStandings((json.standings ?? []) as StandingRow[]);
    } catch {
      /* standings are best-effort */
    }
  }, []);

  const loadWeek = useCallback(async (w: number | null) => {
    setLoading(true);
    setError(null);
    try {
      const schedRes = await fetch(w ? `/api/nfl/schedule?week=${w}` : "/api/nfl/schedule", {
        cache: "no-store",
      });
      const sched = await schedRes.json();
      if (!schedRes.ok) throw new Error(sched?.error ?? "Failed to load schedule");
      const weekNum = (sched as NflWeek).week;
      setSchedule(sched as NflWeek);
      setWeek(weekNum);

      const picksRes = await fetch(`/api/nfl/picks?week=${weekNum}`, { cache: "no-store" });
      const picksJson = await picksRes.json();
      if (!picksRes.ok) throw new Error(picksJson?.error ?? "Failed to load picks");
      const mine = (picksJson.mine ?? []) as PickRow[];
      const next: Record<string, LocalPick> = {};
      for (const p of mine) {
        next[p.game_id] = {
          team: p.picked_team,
          confidence: p.confidence,
          bet: p.is_bet,
          parlay: p.parlay_group !== null,
        };
      }
      setPicks(next);
      setRevealed((picksJson.revealed ?? []) as RevealedPick[]);
      setDirty(false);
      void loadStandings(weekNum);
    } catch (e) {
      setError(getErrorMessage(e, "Failed to load Pick'em"));
    } finally {
      setLoading(false);
    }
  }, [loadStandings]);

  useEffect(() => {
    void loadWeek(null);
  }, [loadWeek]);

  // Refresh odds/status + standings every 2 minutes without touching picks.
  useEffect(() => {
    if (week === null) return;
    const id = setInterval(() => {
      void fetch(`/api/nfl/schedule?week=${week}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((s) => { if (s) setSchedule(s as NflWeek); })
        .catch(() => {});
      void loadStandings(week);
    }, 120_000);
    return () => clearInterval(id);
  }, [week, loadStandings]);

  const games = schedule?.games ?? [];
  const maxConfidence = schedule?.game_count ?? 0;
  const gameById = useMemo(() => new Map(games.map((g) => [g.game_id, g])), [games]);

  const usedConfidences = useMemo(() => {
    const used = new Map<number, string>();
    for (const [gid, p] of Object.entries(picks) as Array<[string, LocalPick]>) {
      if (p.confidence !== null) used.set(p.confidence, gid);
    }
    return used;
  }, [picks]);

  const pickedCount = Object.keys(picks).length;
  const missingConfidence = (Object.values(picks) as LocalPick[]).filter(
    (p) => p.confidence === null,
  ).length;
  const unlockedGameIds = useMemo(
    () => new Set(games.filter((g) => !g.locked).map((g) => g.game_id)),
    [games],
  );

  const parlayEntries = useMemo(
    () => (Object.entries(picks) as Array<[string, LocalPick]>).filter(([, p]) => p.parlay),
    [picks],
  );
  const parlayInfo = useMemo(() => {
    if (parlayEntries.length === 0) return null;
    let stake = 0;
    let combined = 1;
    let missingLine = false;
    const legs = parlayEntries.map(([gid, p]) => {
      const game = gameById.get(gid);
      const dec = game ? teamDec(game, p.team) : null;
      if (dec === null) missingLine = true;
      else combined *= dec;
      stake += p.confidence ?? 0;
      return { gid, team: p.team, confidence: p.confidence, dec };
    });
    return { legs, stake, combined, missingLine };
  }, [parlayEntries, gameById]);

  function toggleTeam(game: NflGame, team: string) {
    if (game.locked) return;
    setDirty(true);
    setSavedAt(null);
    setPicks((cur) => {
      const existing = cur[game.game_id];
      const next = { ...cur };
      if (existing?.team === team) delete next[game.game_id];
      else
        next[game.game_id] = {
          team,
          confidence: existing?.confidence ?? null,
          bet: false,
          parlay: existing?.parlay ?? false,
        };
      return next;
    });
  }

  function setConfidence(gameId: string, value: number | null) {
    setDirty(true);
    setSavedAt(null);
    setPicks((cur) => {
      const existing = cur[gameId];
      if (!existing) return cur;
      return { ...cur, [gameId]: { ...existing, confidence: value } };
    });
  }

  function toggleBet(gameId: string) {
    setDirty(true);
    setSavedAt(null);
    setPicks((cur) => {
      const existing = cur[gameId];
      if (!existing) return cur;
      return { ...cur, [gameId]: { ...existing, bet: !existing.bet, parlay: false } };
    });
  }

  function toggleParlay(gameId: string) {
    setDirty(true);
    setSavedAt(null);
    setPicks((cur) => {
      const existing = cur[gameId];
      if (!existing) return cur;
      if (!existing.parlay && parlayEntries.length >= 3) return cur; // cap 3 legs
      return { ...cur, [gameId]: { ...existing, parlay: !existing.parlay, bet: false } };
    });
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const payload = (Object.entries(picks) as Array<[string, LocalPick]>)
        .filter(([gid, p]) => unlockedGameIds.has(gid) && p.confidence !== null)
        .map(([gid, p]) => ({
          game_id: gid,
          picked_team: p.team,
          confidence: p.confidence,
          is_bet: p.bet,
          parlay: p.parlay,
        }));
      const res = await fetch("/api/nfl/picks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ week, picks: payload }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to save picks");
      setDirty(false);
      setSavedAt(new Date());
      if (week !== null) void loadStandings(week);
    } catch (e) {
      setError(getErrorMessage(e, "Failed to save picks"));
    } finally {
      setSaving(false);
    }
  }

  const revealedByGame = useMemo(() => {
    const map = new Map<string, RevealedPick[]>();
    for (const r of revealed) {
      const arr = map.get(r.game_id) ?? [];
      arr.push(r);
      map.set(r.game_id, arr);
    }
    for (const arr of map.values()) arr.sort((a, b) => b.confidence - a.confidence);
    return map;
  }, [revealed]);

  const parlayIncomplete = parlayEntries.length === 1;

  return (
    <AppShell
      title="NFL Pick'em"
      subtitle="Pick winners · rank confidence · bet points at the line · parlay up to 3"
    >
      <div className="space-y-4 pb-24">
        {/* Week selector */}
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {WEEKS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => void loadWeek(w)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                w === week
                  ? "bg-accent text-black"
                  : "border border-border/60 text-muted hover:text-text"
              }`}
            >
              Wk {w}
            </button>
          ))}
        </div>

        {error && (
          <div className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        {loading ? (
          <div className="rounded-[1.5rem] border border-border/30 bg-surface/40 p-6 text-sm text-muted">
            Loading week{week ? ` ${week}` : ""}…
          </div>
        ) : (
          <>
            {/* Status / save bar */}
            <div className="soft-card sticky top-2 z-20 flex items-center justify-between gap-3 rounded-2xl border border-border/40 bg-surface/90 px-4 py-3 backdrop-blur-xl">
              <div className="min-w-0 text-xs text-muted">
                <span className="font-semibold text-text">
                  {pickedCount}/{games.length} picked
                </span>
                {missingConfidence > 0 && (
                  <span style={{ color: AMBER }}> · {missingConfidence} need a confidence #</span>
                )}
                {parlayIncomplete && <span style={{ color: AMBER }}> · parlay needs 2-3 legs</span>}
                {!dirty && savedAt && <span style={{ color: GREEN }}> · saved ✓</span>}
                <span className="block sm:inline sm:before:content-['_·_']">
                  scale 1–{maxConfidence}
                </span>
              </div>
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving || !dirty || missingConfidence > 0 || parlayIncomplete}
                className="shrink-0 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
              >
                {saving ? "Saving…" : "Save picks"}
              </button>
            </div>

            {/* Parlay slip */}
            {parlayInfo && (
              <div className="soft-card rounded-2xl border border-accent/40 bg-accent/5 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-accent">
                    🎰 Parlay · {parlayInfo.legs.length} leg{parlayInfo.legs.length === 1 ? "" : "s"}
                  </span>
                  <span className="text-xs tabular-nums text-muted">
                    {parlayInfo.missingLine
                      ? "waiting on a line"
                      : `${parlayInfo.combined.toFixed(2)}x combined`}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-text">
                  {parlayInfo.legs.map((l) => (
                    <span key={l.gid}>
                      {l.team}
                      <span className="text-muted">
                        {" "}({l.confidence ?? "—"}{l.dec !== null ? ` · ${l.dec.toFixed(2)}x` : ""})
                      </span>
                    </span>
                  ))}
                </div>
                <div className="mt-1.5 text-[11px] text-muted">
                  Stake <span className="font-semibold text-text">{parlayInfo.stake}</span> pts →
                  all legs win:{" "}
                  <span className="font-semibold" style={{ color: GREEN }}>
                    +{parlayInfo.missingLine ? "?" : Math.round(parlayInfo.stake * parlayInfo.combined)}
                  </span>{" "}
                  · any leg loses:{" "}
                  <span className="font-semibold text-danger">-{parlayInfo.stake}</span>
                  {parlayIncomplete && <span style={{ color: AMBER }}> · add 1-2 more legs</span>}
                </div>
              </div>
            )}

            {/* Games */}
            <div className="space-y-3">
              {games.map((game) => (
                <GameCard
                  key={game.game_id}
                  game={game}
                  pick={picks[game.game_id]}
                  maxConfidence={maxConfidence}
                  usedConfidences={usedConfidences}
                  reveals={revealedByGame.get(game.game_id) ?? []}
                  parlayFull={parlayEntries.length >= 3}
                  onPick={(team) => toggleTeam(game, team)}
                  onConfidence={(v) => setConfidence(game.game_id, v)}
                  onToggleBet={() => toggleBet(game.game_id)}
                  onToggleParlay={() => toggleParlay(game.game_id)}
                />
              ))}
              {games.length === 0 && (
                <div className="rounded-[1.5rem] border border-border/30 bg-surface/40 p-6 text-sm text-muted">
                  No games found for this week.
                </div>
              )}
            </div>

            {/* Week standings */}
            {standings.length > 0 && (
              <section className="soft-card rounded-[1.5rem] border border-border/40 bg-surface/50 p-4">
                <div className="text-[11px] uppercase tracking-[0.28em] text-muted">
                  Week {week} standings
                </div>
                <div className="overflow-x-auto">
                  <table className="mt-2 w-full text-sm">
                    <thead>
                      <tr className="text-left text-[10px] uppercase tracking-wider text-muted">
                        <th className="py-1 pr-2 font-medium">#</th>
                        <th className="py-1 pr-2 font-medium">Player</th>
                        <th className="py-1 pr-2 text-right font-medium">W-L</th>
                        <th className="hidden py-1 pr-2 text-right font-medium sm:table-cell">Str</th>
                        <th className="hidden py-1 pr-2 text-right font-medium sm:table-cell">Bets</th>
                        <th className="py-1 pr-2 text-right font-medium">Parlay</th>
                        <th className="py-1 text-right font-medium">Pts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {standings.map((row, i) => (
                        <tr key={row.entrant_id} className="border-t border-border/15">
                          <td className="py-1.5 pr-2 text-muted">{i + 1}</td>
                          <td className="py-1.5 pr-2 font-semibold text-text">{row.display_name}</td>
                          <td className="py-1.5 pr-2 text-right tabular-nums text-muted">
                            {row.correct}-{row.finals_played - row.correct}
                          </td>
                          <td className="hidden py-1.5 pr-2 text-right tabular-nums text-muted sm:table-cell">
                            {row.straight_points}
                          </td>
                          <td className="hidden py-1.5 pr-2 text-right tabular-nums sm:table-cell">
                            {row.bet_points !== 0 ? (
                              <span
                                className={row.bet_points < 0 ? "text-danger" : ""}
                                style={row.bet_points > 0 ? { color: GREEN } : undefined}
                              >
                                {row.bet_points > 0 ? "+" : ""}{row.bet_points}
                              </span>
                            ) : (
                              <span className="text-muted">—</span>
                            )}
                          </td>
                          <td className="py-1.5 pr-2 text-right text-xs tabular-nums">
                            {row.parlay ? (
                              row.parlay.status === "won" ? (
                                <span style={{ color: GREEN }}>+{row.parlay.points}</span>
                              ) : row.parlay.status === "busted" ? (
                                <span className="text-danger">{row.parlay.points}</span>
                              ) : (
                                <span style={{ color: AMBER }}>
                                  {row.parlay.legs} legs · {row.parlay.combined_decimal.toFixed(2)}x
                                </span>
                              )
                            ) : (
                              <span className="text-muted">—</span>
                            )}
                          </td>
                          <td className="py-1.5 text-right text-base font-bold tabular-nums text-info">
                            {row.total}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-[10px] text-muted">
                  Straight: win = +confidence. Bet 💰: win = confidence × odds, loss = −confidence.
                  Parlay 🎰: all legs must win for stake × combined odds; one loss busts the stake.
                  Ties push. Only final games count.
                </p>
              </section>
            )}

            <p className="text-[11px] text-muted">
              Lines via ESPN, refreshed every few minutes. Win % is the vig-removed implied
              probability from the moneylines. Bet & parlay odds lock in when you save. Picks lock
              at kickoff; everyone&rsquo;s picks reveal per game once it kicks off.
            </p>
          </>
        )}
      </div>
    </AppShell>
  );
}

function TeamButton({
  side, ml, selected, locked, winner, onClick,
}: {
  side: NflGame["home"];
  ml: string;
  selected: boolean;
  locked: boolean;
  winner: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={locked}
      aria-pressed={selected}
      className={[
        "flex flex-1 items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors",
        selected
          ? "border-accent bg-accent/15 ring-1 ring-accent/50"
          : "border-border/50 bg-bg/40",
        locked ? "opacity-70" : "hover:border-border",
      ].join(" ")}
    >
      {side.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={side.logo} alt="" className="h-8 w-8 shrink-0" />
      ) : (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-xs font-bold">
          {side.abbr}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-text">{side.abbr}</span>
          {winner && <span className="text-[10px] font-bold text-accent">W</span>}
          {selected && <span className="text-accent">✓</span>}
        </span>
        <span className="block text-[11px] text-muted">
          {side.record ?? ""}
          {ml && <span className="tabular-nums"> · {ml}</span>}
        </span>
      </span>
      {side.score !== null && (
        <span className="shrink-0 text-lg font-bold tabular-nums text-text">{side.score}</span>
      )}
    </button>
  );
}

function GameCard({
  game, pick, maxConfidence, usedConfidences, reveals, parlayFull,
  onPick, onConfidence, onToggleBet, onToggleParlay,
}: {
  game: NflGame;
  pick: LocalPick | undefined;
  maxConfidence: number;
  usedConfidences: Map<number, string>;
  reveals: RevealedPick[];
  parlayFull: boolean;
  onPick: (team: string) => void;
  onConfidence: (v: number | null) => void;
  onToggleBet: () => void;
  onToggleParlay: () => void;
}) {
  const awayProb = game.away_win_prob;
  const homeProb = game.home_win_prob;
  const pickDec = pick ? teamDec(game, pick.team) : null;
  const betPayout =
    pick?.confidence != null && pickDec !== null ? Math.round(pick.confidence * pickDec) : null;

  return (
    <section className="soft-card rounded-[1.25rem] border border-border/40 bg-surface/50 p-3">
      <div className="mb-2 flex items-center justify-between gap-2 text-[11px] text-muted">
        <span>{kickoffLabel(game.kickoff)}</span>
        <span className="flex items-center gap-2">
          {game.odds?.details && (
            <span className="rounded-md bg-bg/60 px-1.5 py-0.5 font-semibold text-text">
              {game.odds.details}
            </span>
          )}
          {game.odds?.over_under !== null && game.odds?.over_under !== undefined && (
            <span className="tabular-nums">O/U {game.odds.over_under}</span>
          )}
          {game.locked && (
            <span
              className={`font-bold uppercase ${game.state === "post" ? "text-muted" : "text-[#f59e0b]"}`}
            >
              {game.state === "post" ? "Final" : game.state === "in" ? game.status_detail || "Live" : "Locked"}
            </span>
          )}
        </span>
      </div>

      <div className="flex items-stretch gap-2">
        <TeamButton
          side={game.away}
          ml={lineLabel(game.odds?.away_ml ?? null, game.odds?.away_dec ?? null)}
          selected={pick?.team === game.away.abbr}
          locked={game.locked}
          winner={game.away.winner}
          onClick={() => onPick(game.away.abbr)}
        />
        <span className="self-center text-[10px] font-semibold text-muted">@</span>
        <TeamButton
          side={game.home}
          ml={lineLabel(game.odds?.home_ml ?? null, game.odds?.home_dec ?? null)}
          selected={pick?.team === game.home.abbr}
          locked={game.locked}
          winner={game.home.winner}
          onClick={() => onPick(game.home.abbr)}
        />
      </div>

      {/* Vegas favorability meter (0-100) */}
      {awayProb !== null && homeProb !== null && (
        <div className="mt-2.5">
          <div className="flex h-2 overflow-hidden rounded-full">
            <div className="bg-info/80" style={{ width: `${awayProb}%` }} />
            <div className="bg-accent/80" style={{ width: `${homeProb}%` }} />
          </div>
          <div className="mt-1 flex justify-between text-[10px] tabular-nums text-muted">
            <span>
              <span className="font-semibold text-info">{game.away.abbr}</span> {awayProb}%
            </span>
            <span>
              {homeProb}% <span className="font-semibold text-accent">{game.home.abbr}</span>
            </span>
          </div>
        </div>
      )}

      {/* Confidence + wager controls */}
      {pick && !game.locked && (
        <div className="mt-2.5 space-y-2 rounded-xl border border-border/40 bg-bg/40 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted">
              Confidence in <span className="font-semibold text-text">{pick.team}</span>
            </span>
            <select
              value={pick.confidence ?? ""}
              onChange={(e) => onConfidence(e.target.value === "" ? null : Number(e.target.value))}
              className="rounded-lg border border-border/60 bg-surface px-2 py-1.5 text-sm font-semibold text-text"
              aria-label={`Confidence points for ${pick.team}`}
            >
              <option value="">—</option>
              {Array.from({ length: maxConfidence }, (_, i) => i + 1)
                .reverse()
                .map((n) => {
                  const usedBy = usedConfidences.get(n);
                  const taken = usedBy !== undefined && usedBy !== game.game_id;
                  return (
                    <option key={n} value={n} disabled={taken}>
                      {n}{taken ? " ·used" : ""}
                    </option>
                  );
                })}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={onToggleBet}
              disabled={pickDec === null}
              aria-pressed={pick.bet}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-40 ${
                pick.bet
                  ? "border-transparent bg-[#22c55e]/20 text-[#22c55e]"
                  : "border-border/50 text-muted"
              }`}
            >
              💰 Bet it{pick.bet && betPayout !== null ? ` · win +${betPayout}` : ""}
            </button>
            <button
              type="button"
              onClick={onToggleParlay}
              disabled={pickDec === null || (!pick.parlay && parlayFull)}
              aria-pressed={pick.parlay}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-40 ${
                pick.parlay
                  ? "border-transparent bg-accent/20 text-accent"
                  : "border-border/50 text-muted"
              }`}
            >
              🎰 Parlay leg
            </button>
            {pick.bet && pick.confidence != null && (
              <span className="text-[10px] text-muted">
                risk <span className="text-danger">-{pick.confidence}</span> on a loss
              </span>
            )}
            {pickDec === null && (
              <span className="text-[10px] text-muted">no line yet — betting unavailable</span>
            )}
          </div>
        </div>
      )}

      {/* Revealed picks after kickoff */}
      {game.locked && (reveals.length > 0 || pick) && (
        <div className="mt-2.5 rounded-xl border border-border/30 bg-bg/30 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-muted">Picks</div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
            {pick && (
              <span className="text-text">
                <span className="font-semibold">You</span>: {pick.team} ({pick.confidence ?? "—"})
                {pick.bet ? " 💰" : ""}{pick.parlay ? " 🎰" : ""}
              </span>
            )}
            {reveals.map((r) => (
              <span key={`${r.game_id}-${r.display_name}`} className="text-muted">
                {r.display_name}: {r.picked_team} ({r.confidence})
                {r.is_bet ? " 💰" : ""}{r.parlay_group !== null ? " 🎰" : ""}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
