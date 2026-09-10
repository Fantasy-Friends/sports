"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Press_Start_2P, VT323 } from "next/font/google";
import AppShell from "@/components/AppShell";
import PickemOnboarding from "@/components/PickemOnboarding";
import { getErrorMessage } from "@/lib/error";
import type { NflGame, NflWeek } from "@/lib/nfl";
import { TeamHelmet } from "./helmets";
import "./tecmo.css";

// Retro pixel fonts for the Tecmo Bowl theme (see tecmo.css). Press Start 2P is
// the chunky heading/scoreboard face; VT323 is the readable terminal body face.
const pixelFont = Press_Start_2P({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-pixel",
  display: "swap",
});
const terminalFont = VT323({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-terminal",
  display: "swap",
});

type PickRow = {
  game_id: string;
  picked_team: string;
  confidence: number;
  is_bet: boolean;
  bet_decimal: number | null;
  parlay_group: number | null;
};

// Others' revealed picks are guess + confidence only — the API strips all
// betting details before they reach the client.
type RevealedPick = {
  game_id: string;
  picked_team: string;
  confidence: number;
  display_name: string;
};

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

type SeasonRow = {
  entrant_id: string;
  display_name: string;
  total: number;
  correct: number;
  finals_played: number;
  weeks_played: number;
  weeks_won: number;
  best_week: { week: number; points: number } | null;
};

type RevealedGame = {
  game_id: string;
  away: string;
  home: string;
  state: "pre" | "in" | "post";
  status_detail: string;
  winner: string | null;
  picks: Array<{ display_name: string; picked_team: string; confidence: number }>;
};

type CounterTicket =
  | {
      kind: "bet";
      game: string;
      team: string;
      stake: number;
      decimal: number;
      outcome: "win" | "loss" | "push";
      points: number;
    }
  | {
      kind: "parlay";
      legs: Array<{ game: string; team: string; outcome: "win" | "loss" | "push" }>;
      stake: number;
      combined: number;
      status: "won" | "busted";
      points: number;
    };

type CounterPlayer = {
  display_name: string;
  settled: CounterTicket[];
  pending: number;
  net: number;
};

type BoardData = {
  featured_week: number;
  weekly: StandingRow[];
  season_rows: SeasonRow[];
  revealed_games: RevealedGame[];
  counter: CounterPlayer[];
};

const WEEKS = Array.from({ length: 18 }, (_, i) => i + 1);
// Tecmo palette (mirrors the CSS vars) for the few inline-colored bits.
const GREEN = "#43d17a";
const AMBER = "#ffd23f";
const RED = "#e2413b";

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
  const [tab, setTab] = useState<"board" | "picks">("board");
  const [board, setBoard] = useState<BoardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [dirty, setDirty] = useState(false);
  const [showTour, setShowTour] = useState(false);

  // First visit → the welcome fork (boomer tour vs. speed run). Replayable
  // any time via the Tour button.
  useEffect(() => {
    try {
      if (!localStorage.getItem("pickem-tour-v1")) setShowTour(true);
    } catch { /* storage unavailable — skip the tour */ }
  }, []);
  function closeTour() {
    setShowTour(false);
    try { localStorage.setItem("pickem-tour-v1", "done"); } catch { /* ignore */ }
  }

  const loadBoard = useCallback(async () => {
    try {
      const res = await fetch("/api/nfl/season", { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      setBoard({
        featured_week: json.featured_week ?? 1,
        weekly: (json.weekly ?? []) as StandingRow[],
        season_rows: (json.season_rows ?? []) as SeasonRow[],
        revealed_games: (json.revealed_games ?? []) as RevealedGame[],
        counter: (json.counter ?? []) as CounterPlayer[],
      });
    } catch {
      /* scoreboard is best-effort */
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
      // Restore local drafts (team picked, confidence still unranked) so a
      // partial save never loses selections. Server rows win per game.
      try {
        const raw = localStorage.getItem(`pickem-draft-${weekNum}`);
        if (raw) {
          const drafts = JSON.parse(raw) as Record<
            string,
            { team: string; bet: boolean; parlay: boolean }
          >;
          const sgames = (sched as NflWeek).games;
          const unlockedIds = new Set(sgames.filter((g) => !g.locked).map((g) => g.game_id));
          for (const [gid, d] of Object.entries(drafts)) {
            if (!next[gid] && unlockedIds.has(gid) && d?.team) {
              next[gid] = {
                team: d.team,
                confidence: null,
                bet: d.bet === true,
                parlay: d.parlay === true,
              };
            }
          }
        }
      } catch { /* drafts are best-effort */ }
      setPicks(next);
      setRevealed((picksJson.revealed ?? []) as RevealedPick[]);
      setDirty(false);
      void loadBoard();
    } catch (e) {
      setError(getErrorMessage(e, "Failed to load Pick'em"));
    } finally {
      setLoading(false);
    }
  }, [loadBoard]);

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
      void loadBoard();
    }, 120_000);
    return () => clearInterval(id);
  }, [week, loadBoard]);

  // Keep unranked selections as per-week drafts on this device.
  useEffect(() => {
    if (week === null) return;
    try {
      const drafts: Record<string, { team: string; bet: boolean; parlay: boolean }> = {};
      for (const [gid, p] of Object.entries(picks) as Array<[string, LocalPick]>) {
        if (p.confidence === null) drafts[gid] = { team: p.team, bet: p.bet, parlay: p.parlay };
      }
      const key = `pickem-draft-${week}`;
      if (Object.keys(drafts).length > 0) localStorage.setItem(key, JSON.stringify(drafts));
      else localStorage.removeItem(key);
    } catch { /* drafts are best-effort */ }
  }, [picks, week]);

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
      void loadBoard();
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
  const parlayMissingConf = parlayEntries.some(([, p]) => p.confidence === null);

  return (
    <AppShell
      title="NFL Pick'em"
      subtitle="Pick winners · rank confidence · bet points at the line · parlay up to 3"
    >
      <div className={`${pixelFont.variable} ${terminalFont.variable} tecmo`}>
        <div className="space-y-3 pb-24">
          {showTour && <PickemOnboarding onDone={closeTour} />}

          {/* Marquee */}
          <div className="tc-banner flex items-center justify-between gap-3">
            <span className="tc-title">🏈 Tecmo Pick&rsquo;em</span>
            <span className="tc-label">
              {week ? `Week ${String(week).padStart(2, "0")}` : "Loading"}
            </span>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-2">
            {(["board", "picks"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`tc-btn ${tab === t ? "tc-btn--active" : ""}`}
              >
                {t === "board" ? "Scoreboard" : "Make Picks"}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowTour(true)}
              className="tc-btn ml-auto"
              aria-label="Replay the Pick'em tour"
            >
              ? Tour
            </button>
          </div>

          {tab === "board" && <ScoreboardView board={board} />}

          {tab === "picks" && (
            <>
              {/* Week selector */}
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {WEEKS.map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => void loadWeek(w)}
                    className={`tc-pill shrink-0 ${w === week ? "tc-pill--active" : ""}`}
                  >
                    W{String(w).padStart(2, "0")}
                  </button>
                ))}
              </div>

              {error && (
                <div className="tc-banner tc-body" style={{ color: RED, borderColor: RED }}>
                  {error}
                </div>
              )}

              {loading ? (
                <div className="tc-panel tc-body tc-dim">
                  Loading week{week ? ` ${week}` : ""}…
                </div>
              ) : (
                <>
                  {/* Status / save bar */}
                  <div className="tc-banner sticky top-2 z-20 flex items-center justify-between gap-3">
                    <div className="tc-body min-w-0">
                      <span className="tc-yellow">
                        {pickedCount}/{games.length} PICKED
                      </span>
                      {missingConfidence > 0 && (
                        <span style={{ color: AMBER }}>
                          {" "}· {missingConfidence} draft{missingConfidence === 1 ? "" : "s"} sans #
                          (kept on this phone)
                        </span>
                      )}
                      {parlayIncomplete && <span style={{ color: AMBER }}> · parlay needs 2-3</span>}
                      {parlayMissingConf && (
                        <span style={{ color: AMBER }}> · parlay legs need a #</span>
                      )}
                      {!dirty && savedAt && <span style={{ color: GREEN }}> · SAVED ✓</span>}
                      <span className="tc-dim block sm:inline sm:before:content-['_·_']">
                        scale 1–{maxConfidence}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => void save()}
                      disabled={saving || !dirty || parlayIncomplete || parlayMissingConf}
                      className="tc-btn tc-btn--go shrink-0"
                    >
                      {saving ? "Saving…" : "Save"}
                    </button>
                  </div>

                  {/* Parlay slip */}
                  {parlayInfo && (
                    <div className="tc-panel" style={{ background: "#241b02", borderColor: AMBER }}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="tc-label tc-yellow">
                          🎰 Parlay · {parlayInfo.legs.length} leg
                          {parlayInfo.legs.length === 1 ? "" : "s"}
                        </span>
                        <span className="tc-body tc-dim tabular-nums">
                          {parlayInfo.missingLine
                            ? "waiting on a line"
                            : `${parlayInfo.combined.toFixed(2)}x combined`}
                        </span>
                      </div>
                      <div className="tc-body mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                        {parlayInfo.legs.map((l) => (
                          <span key={l.gid}>
                            {l.team}
                            <span className="tc-dim">
                              {" "}({l.confidence ?? "—"}
                              {l.dec !== null ? ` · ${l.dec.toFixed(2)}x` : ""})
                            </span>
                          </span>
                        ))}
                      </div>
                      <div className="tc-body mt-1.5 tc-dim">
                        Stake <span className="tc-yellow">{parlayInfo.stake}</span> pts → all win:{" "}
                        <span style={{ color: GREEN }}>
                          +{parlayInfo.missingLine ? "?" : Math.round(parlayInfo.stake * parlayInfo.combined)}
                        </span>{" "}
                        · any loss: <span style={{ color: RED }}>-{parlayInfo.stake}</span>
                        {parlayIncomplete && <span style={{ color: AMBER }}> · add 1-2 more</span>}
                      </div>
                    </div>
                  )}

                  {/* Games — on the field */}
                  <div className="tc-panel--field space-y-3 p-3">
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
                      <div className="tc-panel tc-body tc-dim">No games found for this week.</div>
                    )}
                  </div>

                  <p className="tc-body tc-dim">
                    Lines via ESPN
                    {schedule?.fetched_at
                      ? ` · last updated ${new Date(schedule.fetched_at).toLocaleString(undefined, {
                          month: "numeric",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}`
                      : ""}
                    , refreshed every few minutes. Win % is the vig-removed implied probability from
                    the moneylines. Bet & parlay odds lock in when you save. Picks lock at kickoff;
                    everyone&rsquo;s picks reveal per game once it kicks off.
                  </p>
                </>
              )}
            </>
          )}
        </div>
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
        "tc-team",
        selected ? "tc-team--selected" : "",
        locked ? "tc-team--locked" : "",
      ].join(" ")}
    >
      <TeamHelmet abbr={side.abbr} className="tc-team__logo" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="tc-team__abbr truncate">{side.abbr}</span>
          {winner && <span className="tc-label tc-green">W</span>}
          {selected && <span className="tc-label">✓</span>}
        </span>
        <span className="tc-body block" style={{ opacity: 0.85 }}>
          {side.record ?? ""}
          {ml && <span className="tabular-nums"> · {ml}</span>}
        </span>
      </span>
      {side.score !== null && <span className="tc-score shrink-0 tabular-nums">{side.score}</span>}
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
    <section className="tc-panel">
      <div className="tc-label mb-2 flex items-center justify-between gap-2">
        <span>{kickoffLabel(game.kickoff)}</span>
        <span className="flex items-center gap-2">
          {game.odds?.details && (
            <span className="tc-yellow">{game.odds.details}</span>
          )}
          {game.odds?.over_under !== null && game.odds?.over_under !== undefined && (
            <span className="tabular-nums">O/U {game.odds.over_under}</span>
          )}
          {game.locked && (
            <span className={game.state === "post" ? "tc-dim" : "tc-yellow"}>
              {game.state === "post"
                ? "Final"
                : game.state === "in"
                  ? game.status_detail || "Live"
                  : "Locked"}
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
        <span className="tc-label self-center">@</span>
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
          <div className="tc-meter">
            <div className="tc-meter__away" style={{ width: `${awayProb}%` }} />
            <div className="tc-meter__home" style={{ width: `${homeProb}%` }} />
          </div>
          <div className="tc-label mt-1 flex justify-between tabular-nums">
            <span>
              <span className="tc-blue">{game.away.abbr}</span> {awayProb}%
            </span>
            <span>
              {homeProb}% <span className="tc-red">{game.home.abbr}</span>
            </span>
          </div>
        </div>
      )}

      {/* Confidence + wager controls */}
      {pick && !game.locked && (
        <div className="mt-2.5 space-y-2 border-t-2 border-dashed pt-2.5" style={{ borderColor: "#2a3a6a" }}>
          <div className="flex items-center justify-between gap-2">
            <span className="tc-body tc-dim">
              Confidence in <span className="tc-yellow">{pick.team}</span>
            </span>
            <select
              value={pick.confidence ?? ""}
              onChange={(e) => onConfidence(e.target.value === "" ? null : Number(e.target.value))}
              className="tc-select"
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

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onToggleBet}
              disabled={pickDec === null}
              aria-pressed={pick.bet}
              className={`tc-chip ${pick.bet ? "tc-chip--bet" : ""}`}
            >
              💰 Bet{pick.bet && betPayout !== null ? ` +${betPayout}` : ""}
            </button>
            <button
              type="button"
              onClick={onToggleParlay}
              disabled={pickDec === null || (!pick.parlay && parlayFull)}
              aria-pressed={pick.parlay}
              className={`tc-chip ${pick.parlay ? "tc-chip--parlay" : ""}`}
            >
              🎰 Parlay
            </button>
            {pick.bet && pick.confidence != null && (
              <span className="tc-body tc-dim">
                risk <span style={{ color: RED }}>-{pick.confidence}</span> on a loss
              </span>
            )}
            {pickDec === null && (
              <span className="tc-body tc-dim">no line yet — betting off</span>
            )}
          </div>
        </div>
      )}

      {/* Revealed picks after kickoff */}
      {game.locked && (reveals.length > 0 || pick) && (
        <div className="mt-2.5 border-t-2 border-dashed pt-2" style={{ borderColor: "#2a3a6a" }}>
          <div className="tc-label">Picks</div>
          <div className="tc-body mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
            {pick && (
              <span>
                <span className="tc-yellow">You</span>: {pick.team} ({pick.confidence ?? "—"})
                {pick.bet ? " 💰" : ""}{pick.parlay ? " 🎰" : ""}
              </span>
            )}
            {reveals.map((r) => (
              <span key={`${r.game_id}-${r.display_name}`} className="tc-dim">
                {r.display_name}: {r.picked_team} ({r.confidence})
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}


function ScoreboardView({ board }: { board: BoardData | null }) {
  if (!board) {
    return <div className="tc-panel tc-body tc-dim">Loading scoreboard…</div>;
  }
  const { featured_week, weekly, season_rows, revealed_games, counter } = board;
  return (
    <>
      {/* Featured week scoreboard */}
      <section className="tc-panel">
        <div className="flex items-baseline justify-between gap-2">
          <div className="tc-label tc-yellow">Week {featured_week} Scoreboard</div>
          <span className="tc-label">flips Wednesday</span>
        </div>
        {weekly.length === 0 ? (
          <p className="tc-body tc-dim mt-3">No picks in for week {featured_week} yet.</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="tc-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Player</th>
                  <th className="tc-num">W-L</th>
                  <th className="tc-num hidden sm:table-cell">Str</th>
                  <th className="tc-num hidden sm:table-cell">Bets</th>
                  <th className="tc-num">Parlay</th>
                  <th className="tc-num">Pts</th>
                </tr>
              </thead>
              <tbody>
                {weekly.map((row, i) => (
                  <tr key={row.entrant_id}>
                    <td className="tc-dim">{i + 1}</td>
                    <td>{row.display_name}</td>
                    <td className="tc-num tc-dim">
                      {row.correct}-{row.finals_played - row.correct}
                    </td>
                    <td className="tc-num tc-dim hidden sm:table-cell">{row.straight_points}</td>
                    <td className="tc-num hidden sm:table-cell">
                      {row.bet_points !== 0 ? (
                        <span style={{ color: row.bet_points < 0 ? RED : GREEN }}>
                          {row.bet_points > 0 ? "+" : ""}{row.bet_points}
                        </span>
                      ) : (
                        <span className="tc-dim">—</span>
                      )}
                    </td>
                    <td className="tc-num">
                      {row.parlay ? (
                        row.parlay.status === "won" ? (
                          <span style={{ color: GREEN }}>+{row.parlay.points}</span>
                        ) : row.parlay.status === "busted" ? (
                          <span style={{ color: RED }}>{row.parlay.points}</span>
                        ) : (
                          <span style={{ color: AMBER }}>
                            {row.parlay.legs}L · {row.parlay.combined_decimal.toFixed(2)}x
                          </span>
                        )
                      ) : (
                        <span className="tc-dim">—</span>
                      )}
                    </td>
                    <td className="tc-num tc-pts">{row.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Who picked who — a rolling window: games still being played stay
          open; every game that has gone final folds into one collapsed line
          (tap to unfold). The window rolls itself as each set of games ends. */}
      {revealed_games.length > 0 && (() => {
        const finals = revealed_games.filter((g) => g.state === "post");
        const open = revealed_games.filter((g) => g.state !== "post");
        return (
          <section className="tc-panel">
            <div className="tc-label">Who picked who · Wk {featured_week}</div>
            <div className="tc-body mt-2 space-y-2.5">
              {finals.length > 0 && (
                <details className="group">
                  <summary className="tc-dim cursor-pointer select-none text-xs">
                    <span className="inline-block transition-transform group-open:rotate-90">▸</span>{" "}
                    {finals.length} final{finals.length === 1 ? "" : "s"} folded up — tap to unfold
                  </summary>
                  <div className="mt-2 space-y-2.5 border-l-2 pl-2" style={{ borderColor: "#2a3a6a" }}>
                    {finals.map((g) => (
                      <GameRevealRow key={g.game_id} game={g} />
                    ))}
                  </div>
                </details>
              )}
              {open.map((g) => (
                <GameRevealRow key={g.game_id} game={g} />
              ))}
              {open.length === 0 && finals.length > 0 && (
                <div className="tc-dim text-xs">No games on right now — next set opens at kickoff.</div>
              )}
            </div>
            <p className="tc-dim mt-2 text-xs">
              Guesses + confidence only — bets and parlays stay private. Reveals per game at kickoff.
            </p>
          </section>
        );
      })()}

      {/* Meet me at the counter — the week's bet slips, face-down until settled */}
      {counter.length > 0 && (
        <section className="tc-panel">
          <div className="tc-label">🎟️ Meet me at the counter · Wk {featured_week}</div>
          <div className="tc-body mt-2 space-y-3">
            {counter.map((pl) => (
              <div key={pl.display_name} className="border-t-2 border-dashed pt-2 first:border-t-0 first:pt-0" style={{ borderColor: "#2a3a6a" }}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="tc-yellow">{pl.display_name}</span>
                  {pl.settled.length > 0 ? (
                    <span
                      className="tabular-nums"
                      style={{ color: pl.net > 0 ? GREEN : pl.net < 0 ? RED : undefined }}
                    >
                      {pl.net > 0 ? "+" : ""}{pl.net} pts
                    </span>
                  ) : (
                    <span className="tc-dim text-xs">no action settled yet</span>
                  )}
                </div>
                <div className="mt-1 space-y-0.5">
                  {pl.settled.map((t, i) =>
                    t.kind === "bet" ? (
                      <div key={i} className="flex flex-wrap items-baseline justify-between gap-x-2">
                        <span className="tc-dim">
                          💰 {t.team} <span className="text-xs">({t.game})</span> · {t.decimal.toFixed(2)}x · stake {t.stake}
                          {t.outcome === "push" ? " · PUSH" : ""}
                        </span>
                        <span
                          className="tabular-nums"
                          style={{ color: t.points > 0 ? GREEN : t.points < 0 ? RED : undefined }}
                        >
                          {t.points > 0 ? "+" : ""}{t.points}
                        </span>
                      </div>
                    ) : (
                      <div key={i} className="flex flex-wrap items-baseline justify-between gap-x-2">
                        <span className="tc-dim">
                          🎰{" "}
                          {t.legs.map((l, j) => (
                            <span key={j}>
                              {j > 0 ? " + " : ""}
                              {l.team}
                              {l.outcome === "win" ? "✓" : l.outcome === "loss" ? "✗" : "·"}
                            </span>
                          ))}{" "}
                          · {t.combined.toFixed(2)}x · stake {t.stake}
                          {t.status === "busted" ? " · BUSTED" : " · CASHED"}
                        </span>
                        <span
                          className="tabular-nums"
                          style={{ color: t.points > 0 ? GREEN : RED }}
                        >
                          {t.points > 0 ? "+" : ""}{t.points}
                        </span>
                      </div>
                    ),
                  )}
                  {pl.pending > 0 && (
                    <div className="tc-dim">
                      🎫 {pl.pending} ticket{pl.pending === 1 ? "" : "s"} face-down — settles when the games do
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="tc-dim mt-2 text-xs">
            Slips flip face-up only when the whole ticket is settled — a bet at its game&rsquo;s
            final, a parlay when every leg is final. Until then: nothing.
          </p>
        </section>
      )}

      {/* Season leaderboard */}
      <section className="tc-panel">
        <div className="tc-label tc-yellow">Season Leaderboard</div>
        {season_rows.length === 0 ? (
          <p className="tc-body tc-dim mt-3">Nothing scored yet — picks land here after week 1.</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="tc-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Player</th>
                  <th className="tc-num">W-L</th>
                  <th className="tc-num hidden sm:table-cell">Wks won</th>
                  <th className="tc-num hidden sm:table-cell">Best wk</th>
                  <th className="tc-num">Total</th>
                </tr>
              </thead>
              <tbody>
                {season_rows.map((row, i) => (
                  <tr key={row.entrant_id}>
                    <td className="tc-dim">{i === 0 ? "🏆" : i + 1}</td>
                    <td>{row.display_name}</td>
                    <td className="tc-num tc-dim">
                      {row.correct}-{row.finals_played - row.correct}
                    </td>
                    <td className="tc-num tc-dim hidden sm:table-cell">{row.weeks_won}</td>
                    <td className="tc-num tc-dim hidden sm:table-cell">
                      {row.best_week ? `${row.best_week.points} (wk ${row.best_week.week})` : "—"}
                    </td>
                    <td className="tc-num tc-pts">{row.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="tc-body tc-dim mt-2">
          Season totals sum every week&rsquo;s straights, bets, and parlays. &ldquo;Wks won&rdquo;
          counts fully-final weeks where you had the top score (ties share it).
        </p>
      </section>
    </>
  );
}


function GameRevealRow({ game: g }: { game: RevealedGame }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="tc-yellow">
          {g.away} @ {g.home}
        </span>
        <span className="tc-dim text-xs">
          {g.state === "post" ? "FINAL" : g.status_detail || "LIVE"}
        </span>
      </div>
      <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
        {g.picks.map((pk) => {
          const settled = g.winner !== null;
          const won = settled && pk.picked_team === g.winner;
          return (
            <span
              key={`${g.game_id}-${pk.display_name}`}
              style={settled ? { color: won ? GREEN : RED } : undefined}
              className={settled ? "" : "tc-dim"}
            >
              {pk.display_name}: {pk.picked_team} ({pk.confidence})
            </span>
          );
        })}
      </div>
    </div>
  );
}
