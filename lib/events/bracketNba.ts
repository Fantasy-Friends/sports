import { supabaseAdmin } from "@/lib/supabase";
import { awardPointsFromScores } from "@/lib/scoring/awardPoints";
import type {
  EntryValidation,
  EventEntry,
  EventTypeHandler,
  FinishRanking,
} from "./types";

export type NbaSeriesPick = {
  match_id: string;
  winner_team_id: string;
  games: 4 | 5 | 6 | 7;
};

export type NbaBracketPayload = {
  rounds: {
    r1: NbaSeriesPick[];
    r2: NbaSeriesPick[];
    conf_finals: NbaSeriesPick[];
    finals: {
      winner_team_id: string;
      games: 4 | 5 | 6 | 7;
      mvp_player_id?: string;
    };
  };
  tiebreaker_finals_total_points: number;
};

const ROUND_CONFIG = {
  r1: { series: 8, base: 2, exact_games: 1 },
  r2: { series: 4, base: 4, exact_games: 2 },
  conf_finals: { series: 2, base: 7, exact_games: 3 },
  finals: { base: 12, exact_games: 5, mvp: 3 },
} as const;

function validateSeries(picks: NbaSeriesPick[], expected: number): EntryValidation {
  if (picks.length !== expected) {
    return { ok: false, reason: `expected ${expected} series picks, got ${picks.length}` };
  }
  for (const pick of picks) {
    if (!pick.winner_team_id) {
      return { ok: false, reason: `series ${pick.match_id} missing winner` };
    }
    if (![4, 5, 6, 7].includes(pick.games)) {
      return { ok: false, reason: `series ${pick.match_id} games must be 4-7` };
    }
  }
  return { ok: true };
}

type NbaSeriesResultRow = {
  event_id: string;
  round: string;
  match_id: string;
  winner_team_id: string | null;
  games: number | null;
  finals_mvp_player_id?: string | null;
  finals_total_points?: number | null;
};

async function loadResults(eventId: string) {
  const { data, error } = await supabaseAdmin
    .from("nba_series_results")
    .select("event_id, round, match_id, winner_team_id, games, finals_mvp_player_id, finals_total_points")
    .eq("event_id", eventId);
  if (error) return [] as NbaSeriesResultRow[];
  return (data ?? []) as NbaSeriesResultRow[];
}

export function scoreBracket(payload: NbaBracketPayload, results: NbaSeriesResultRow[]) {
  const byRoundMatch = new Map<string, NbaSeriesResultRow>();
  for (const row of results) {
    byRoundMatch.set(`${row.round}:${row.match_id}`, row);
  }

  let points = 0;

  const scoreSeries = (round: keyof typeof ROUND_CONFIG, picks: NbaSeriesPick[]) => {
    if (round === "finals") return;
    const cfg = ROUND_CONFIG[round];
    for (const pick of picks) {
      const result = byRoundMatch.get(`${round}:${pick.match_id}`);
      if (!result || !result.winner_team_id) continue;
      if (pick.winner_team_id === result.winner_team_id) {
        points += cfg.base;
        if (result.games !== null && pick.games === result.games) {
          points += cfg.exact_games;
        }
      }
    }
  };

  scoreSeries("r1", payload.rounds.r1);
  scoreSeries("r2", payload.rounds.r2);
  scoreSeries("conf_finals", payload.rounds.conf_finals);

  const finalsResult = byRoundMatch.get("finals:finals");
  if (finalsResult?.winner_team_id) {
    if (payload.rounds.finals.winner_team_id === finalsResult.winner_team_id) {
      points += ROUND_CONFIG.finals.base;
      if (finalsResult.games !== null && payload.rounds.finals.games === finalsResult.games) {
        points += ROUND_CONFIG.finals.exact_games;
      }
      if (
        finalsResult.finals_mvp_player_id &&
        payload.rounds.finals.mvp_player_id === finalsResult.finals_mvp_player_id
      ) {
        points += ROUND_CONFIG.finals.mvp;
      }
    }
  }

  return { points, finalsTotal: finalsResult?.finals_total_points ?? null };
}

export const bracketNbaHandler: EventTypeHandler<NbaBracketPayload> = {
  kind: "bracket-nba",
  label: "NBA Playoffs — Full Bracket",

  validateEntry(payload) {
    if (!payload || typeof payload !== "object") return { ok: false, reason: "payload required" };
    const r1 = validateSeries(payload.rounds?.r1 ?? [], 8);
    if (!r1.ok) return r1;
    const r2 = validateSeries(payload.rounds?.r2 ?? [], 4);
    if (!r2.ok) return r2;
    const cf = validateSeries(payload.rounds?.conf_finals ?? [], 2);
    if (!cf.ok) return cf;
    const finals = payload.rounds?.finals;
    if (!finals?.winner_team_id) return { ok: false, reason: "finals winner required" };
    if (![4, 5, 6, 7].includes(finals.games)) return { ok: false, reason: "finals games 4-7" };
    if (!Number.isFinite(payload.tiebreaker_finals_total_points)) {
      return { ok: false, reason: "tiebreaker required" };
    }
    return { ok: true };
  },

  async computeFinishes({ event, entries }) {
    const results = await loadResults(event.event_id);
    const finalsResult = results.find((r) => r.round === "finals" && r.match_id === "finals");
    const finalsActualTotal = finalsResult?.finals_total_points ?? null;

    const scored = entries.map((entry: EventEntry<NbaBracketPayload>) => {
      const { points } = scoreBracket(entry.payload, results);
      const tiebreakDelta = finalsActualTotal !== null
        ? Math.abs(entry.payload.tiebreaker_finals_total_points - finalsActualTotal)
        : 0;
      return {
        entrant_id: entry.entrant_id,
        raw_score: points,
        tiebreak: tiebreakDelta,
      };
    });

    // Apply tiebreaker: within tied raw_score groups, closer tiebreak wins.
    // We achieve this by perturbing raw_score by a tiny epsilon based on
    // tiebreak proximity only when ties actually occur.
    const grouped = new Map<number, typeof scored>();
    for (const row of scored) {
      const list = grouped.get(row.raw_score) ?? [];
      list.push(row);
      grouped.set(row.raw_score, list);
    }

    const resolvedScores = scored.map((row) => ({
      entrant_id: row.entrant_id,
      raw_score: row.raw_score,
      tie_break_notes:
        (grouped.get(row.raw_score)?.length ?? 0) > 1 && finalsActualTotal !== null
          ? `Finals total tiebreak delta ${row.tiebreak}`
          : undefined,
    }));

    // Re-sort using awardPoints (higher raw_score better), but because the
    // shared helper treats ties as identical-slot, nudge raw_score by a
    // tiny fraction based on inverse tiebreak delta so closer guesses sort
    // ahead. Max fractional bump < 1 so integer ordering is preserved.
    if (finalsActualTotal !== null) {
      for (const row of resolvedScores) {
        const original = grouped.get(row.raw_score);
        if (!original || original.length <= 1) continue;
        const entry = original.find((r) => r.entrant_id === row.entrant_id);
        if (!entry) continue;
        // 1 / (1 + delta) scaled very small: ensures closer guesses rank higher.
        row.raw_score = row.raw_score + 1 / (1 + entry.tiebreak) * 0.001;
      }
    }

    const awarded = await awardPointsFromScores(resolvedScores, event.tier, { invert: true });
    const finishes: FinishRanking[] = awarded.map((a) => ({
      entrant_id: a.entrant_id,
      finish_rank: a.finish_rank,
      raw_score: Math.round(a.raw_score),
      base_points: a.base_points,
      awarded_points: a.awarded_points,
      tie_break_notes: a.tie_break_notes,
    }));
    return finishes;
  },

  getEntryUI() {
    return "bracket-nba";
  },

  getLeaderboardUI() {
    return "bracket-nba";
  },
};
