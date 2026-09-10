import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthenticatedEntrant } from "@/lib/draftAuth";
import { getErrorMessage } from "@/lib/error";
import { currentNflSeason, fetchNflWeek } from "@/lib/nfl";
import {
  featuredScoreboardWeek,
  scoreWeek,
  seasonDisplayNames,
  type PickRow,
} from "@/lib/nflPickem";

export const revalidate = 0;

export type SeasonLeaderboardRow = {
  entrant_id: string;
  display_name: string;
  total: number;
  correct: number;
  finals_played: number;
  weeks_played: number;
  weeks_won: number; // most points in a fully-final week (ties share credit)
  best_week: { week: number; points: number } | null;
};

// GET → the Pick'em scoreboard screen in one call:
//   featured_week  — the just-played week until Wednesday (CT), then the new week
//   weekly         — that week's standings (aggregates only)
//   season         — yearly leaderboard summed across every week with picks
export async function GET() {
  try {
    const auth = await getAuthenticatedEntrant();
    if (!auth) return NextResponse.json({ error: "auth required" }, { status: 401 });

    const season = currentNflSeason();
    const [featured, names, { data: rows }] = await Promise.all([
      featuredScoreboardWeek(),
      seasonDisplayNames(),
      supabaseAdmin
        .from("nfl_pickem_picks")
        .select(
          "season, week, entrant_id, game_id, picked_team, confidence, is_bet, bet_decimal, parlay_group",
        )
        .eq("season", season),
    ]);

    const allPicks = (rows ?? []) as PickRow[];
    const picksByWeek = new Map<number, PickRow[]>();
    for (const p of allPicks) {
      const arr = picksByWeek.get(p.week) ?? [];
      arr.push(p);
      picksByWeek.set(p.week, arr);
    }

    // Score every week that has picks, plus the featured week (so the weekly
    // board renders even before anyone has picked it). Schedules are cached
    // 5 min server-side, so this stays cheap.
    const weekNumbers = [...new Set([...picksByWeek.keys(), featured])].sort((a, b) => a - b);
    const schedules = await Promise.all(weekNumbers.map((w) => fetchNflWeek(w)));

    type Agg = {
      total: number;
      correct: number;
      finals: number;
      weeksPlayed: number;
      weeksWon: number;
      best: { week: number; points: number } | null;
    };
    const agg = new Map<string, Agg>();
    let weeklyStandings: ReturnType<typeof scoreWeek> = [];

    for (let i = 0; i < weekNumbers.length; i += 1) {
      const w = weekNumbers[i];
      const sched = schedules[i];
      const weekPicks = picksByWeek.get(w) ?? [];
      const standings = scoreWeek(sched.games, weekPicks, names);
      if (w === featured) weeklyStandings = standings;
      if (weekPicks.length === 0) continue;

      const weekDone =
        sched.games.length > 0 && sched.games.every((g) => g.state === "post");
      const top = standings.length > 0 ? Math.max(...standings.map((s) => s.total)) : 0;

      for (const s of standings) {
        const a = agg.get(s.entrant_id) ?? {
          total: 0, correct: 0, finals: 0, weeksPlayed: 0, weeksWon: 0, best: null,
        };
        a.total += s.total;
        a.correct += s.correct;
        a.finals += s.finals_played;
        a.weeksPlayed += 1;
        if (weekDone && s.total === top) a.weeksWon += 1;
        if (weekDone && (a.best === null || s.total > a.best.points)) {
          a.best = { week: w, points: s.total };
        }
        agg.set(s.entrant_id, a);
      }
    }

    const seasonRows: SeasonLeaderboardRow[] = [...agg.entries()]
      .map(([entrant_id, a]) => ({
        entrant_id,
        display_name: names.get(entrant_id) ?? "Player",
        total: a.total,
        correct: a.correct,
        finals_played: a.finals,
        weeks_played: a.weeksPlayed,
        weeks_won: a.weeksWon,
        best_week: a.best,
      }))
      .sort((a, b) => b.total - a.total || a.display_name.localeCompare(b.display_name));

    // Aggregates only — per-pick reveal rules live in the picks API.
    const weekly = weeklyStandings.map(({ picks: _picks, ...rest }) => rest);

    // "Who picked who" for the featured week: every kicked-off game with
    // everyone's guess + confidence. Betting details (bet flag, odds, parlay
    // membership) are deliberately NOT included — guesses only.
    const featuredIdx = weekNumbers.indexOf(featured);
    const featuredSched = featuredIdx >= 0 ? schedules[featuredIdx] : null;
    const featuredPicks = picksByWeek.get(featured) ?? [];
    const revealedGames = (featuredSched?.games ?? [])
      .filter((g) => g.locked)
      .map((g) => ({
        game_id: g.game_id,
        away: g.away.abbr,
        home: g.home.abbr,
        state: g.state,
        status_detail: g.status_detail,
        winner: g.home.winner ? g.home.abbr : g.away.winner ? g.away.abbr : null,
        picks: featuredPicks
          .filter((p) => p.game_id === g.game_id)
          .map((p) => ({
            display_name: names.get(p.entrant_id) ?? "Player",
            picked_team: p.picked_team,
            confidence: p.confidence,
          }))
          .sort((a, b) => b.confidence - a.confidence),
      }))
      .filter((g) => g.picks.length > 0);

    return NextResponse.json({
      season,
      featured_week: featured,
      weekly,
      season_rows: seasonRows,
      revealed_games: revealedGames,
    });
  } catch (err) {
    return NextResponse.json(
      { error: getErrorMessage(err, "Failed to load the Pick'em leaderboard") },
      { status: 500 },
    );
  }
}
