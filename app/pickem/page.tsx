"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { getErrorMessage } from "@/lib/error";
import type { NflGame, NflWeek } from "@/lib/nfl";

type PickRow = {
  game_id: string;
  picked_team: string;
  confidence: number;
};

type RevealedPick = PickRow & { display_name: string };

type LocalPick = { team: string; confidence: number | null };

const WEEKS = Array.from({ length: 18 }, (_, i) => i + 1);

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

export default function PickemPage() {
  const [week, setWeek] = useState<number | null>(null);
  const [schedule, setSchedule] = useState<NflWeek | null>(null);
  const [picks, setPicks] = useState<Record<string, LocalPick>>({});
  const [revealed, setRevealed] = useState<RevealedPick[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [dirty, setDirty] = useState(false);

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
      for (const p of mine) next[p.game_id] = { team: p.picked_team, confidence: p.confidence };
      setPicks(next);
      setRevealed((picksJson.revealed ?? []) as RevealedPick[]);
      setDirty(false);
    } catch (e) {
      setError(getErrorMessage(e, "Failed to load Pick'em"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWeek(null);
  }, [loadWeek]);

  // Refresh odds/status every 2 minutes without touching in-progress picks.
  useEffect(() => {
    if (week === null) return;
    const id = setInterval(() => {
      void fetch(`/api/nfl/schedule?week=${week}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((s) => { if (s) setSchedule(s as NflWeek); })
        .catch(() => {});
    }, 120_000);
    return () => clearInterval(id);
  }, [week]);

  const games = schedule?.games ?? [];
  const maxConfidence = schedule?.game_count ?? 0;

  const usedConfidences = useMemo(() => {
    const used = new Map<number, string>(); // confidence -> game_id
    for (const [gid, p] of Object.entries(picks) as Array<[string, LocalPick]>) {
      if (p.confidence !== null) used.set(p.confidence, gid);
    }
    return used;
  }, [picks]);

  const pickedCount = Object.keys(picks).length;
  const missingConfidence = (Object.values(picks) as LocalPick[]).filter((p) => p.confidence === null).length;
  const unlockedGameIds = useMemo(
    () => new Set(games.filter((g) => !g.locked).map((g) => g.game_id)),
    [games],
  );

  function toggleTeam(game: NflGame, team: string) {
    if (game.locked) return;
    setDirty(true);
    setSavedAt(null);
    setPicks((cur) => {
      const existing = cur[game.game_id];
      const next = { ...cur };
      if (existing?.team === team) delete next[game.game_id];
      else next[game.game_id] = { team, confidence: existing?.confidence ?? null };
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

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const payload = (Object.entries(picks) as Array<[string, LocalPick]>)
        .filter(([gid, p]) => unlockedGameIds.has(gid) && p.confidence !== null)
        .map(([gid, p]) => ({ game_id: gid, picked_team: p.team, confidence: p.confidence }));
      const res = await fetch("/api/nfl/picks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ week, picks: payload }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to save picks");
      setDirty(false);
      setSavedAt(new Date());
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

  return (
    <AppShell
      title="NFL Pick'em"
      subtitle="Pick every winner · rank your confidence · byes shrink the scale"
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
                  <span style={{ color: "#f59e0b" }}> · {missingConfidence} need a confidence #</span>
                )}
                {!dirty && savedAt && (
                  <span style={{ color: "#22c55e" }}> · saved ✓</span>
                )}
                <span className="block sm:inline sm:before:content-['_·_']">
                  scale 1–{maxConfidence} this week
                </span>
              </div>
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving || !dirty || missingConfidence > 0}
                className="shrink-0 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
              >
                {saving ? "Saving…" : "Save picks"}
              </button>
            </div>

            {/* Games */}
            <div className="space-y-3">
              {games.map((game) => {
                const pick = picks[game.game_id];
                const reveals = revealedByGame.get(game.game_id) ?? [];
                return (
                  <GameCard
                    key={game.game_id}
                    game={game}
                    pick={pick}
                    maxConfidence={maxConfidence}
                    usedConfidences={usedConfidences}
                    reveals={reveals}
                    onPick={(team) => toggleTeam(game, team)}
                    onConfidence={(v) => setConfidence(game.game_id, v)}
                  />
                );
              })}
              {games.length === 0 && (
                <div className="rounded-[1.5rem] border border-border/30 bg-surface/40 p-6 text-sm text-muted">
                  No games found for this week.
                </div>
              )}
            </div>

            <p className="text-[11px] text-muted">
              Lines{schedule?.games.find((g) => g.odds?.provider)?.odds?.provider
                ? ` from ${schedule.games.find((g) => g.odds?.provider)!.odds!.provider}`
                : ""}{" "}
              via ESPN, refreshed every few minutes. Win % is the vig-removed implied probability
              from the moneylines. Picks lock at kickoff, game by game; everyone&rsquo;s picks reveal
              once a game kicks off.
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
          {ml && <span className="tabular-nums"> · ML {ml}</span>}
        </span>
      </span>
      {side.score !== null && (
        <span className="shrink-0 text-lg font-bold tabular-nums text-text">{side.score}</span>
      )}
    </button>
  );
}

function GameCard({
  game, pick, maxConfidence, usedConfidences, reveals, onPick, onConfidence,
}: {
  game: NflGame;
  pick: LocalPick | undefined;
  maxConfidence: number;
  usedConfidences: Map<number, string>;
  reveals: RevealedPick[];
  onPick: (team: string) => void;
  onConfidence: (v: number | null) => void;
}) {
  const awayProb = game.away_win_prob;
  const homeProb = game.home_win_prob;

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
            <span className={`font-bold uppercase ${game.state === "post" ? "text-muted" : "text-[#f59e0b]"}`}>
              {game.state === "post" ? "Final" : game.state === "in" ? game.status_detail || "Live" : "Locked"}
            </span>
          )}
        </span>
      </div>

      <div className="flex items-stretch gap-2">
        <TeamButton
          side={game.away}
          ml={mlLabel(game.odds?.away_ml ?? null)}
          selected={pick?.team === game.away.abbr}
          locked={game.locked}
          winner={game.away.winner}
          onClick={() => onPick(game.away.abbr)}
        />
        <span className="self-center text-[10px] font-semibold text-muted">@</span>
        <TeamButton
          side={game.home}
          ml={mlLabel(game.odds?.home_ml ?? null)}
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

      {/* Confidence assignment */}
      {pick && !game.locked && (
        <div className="mt-2.5 flex items-center justify-between gap-2 rounded-xl border border-border/40 bg-bg/40 px-3 py-2">
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
      )}

      {/* Revealed picks after kickoff */}
      {game.locked && reveals.length > 0 && (
        <div className="mt-2.5 rounded-xl border border-border/30 bg-bg/30 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-muted">Picks</div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
            {pick && (
              <span className="text-text">
                <span className="font-semibold">You</span>: {pick.team} ({pick.confidence ?? "—"})
              </span>
            )}
            {reveals.map((r) => (
              <span key={`${r.game_id}-${r.display_name}`} className="text-muted">
                {r.display_name}: {r.picked_team} ({r.confidence})
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
