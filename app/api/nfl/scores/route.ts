import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthenticatedEntrant } from "@/lib/draftAuth";
import { getErrorMessage } from "@/lib/error";
import { currentNflSeason, fetchNflWeek } from "@/lib/nfl";
import { scoreWeek, seasonDisplayNames, type PickRow } from "@/lib/nflPickem";

export const revalidate = 0;

// GET ?week=N → the week's Pick'em standings (straights + bets + parlay
// logic applied). Only FINAL games score; pending bets/parlays show as such.
// Per-pick detail is stripped for other players' non-kicked-off games so the
// standings can't leak picks early.
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedEntrant();
    if (!auth) return NextResponse.json({ error: "auth required" }, { status: 401 });

    const week = Number(request.nextUrl.searchParams.get("week"));
    if (!Number.isInteger(week) || week < 1 || week > 18) {
      return NextResponse.json({ error: "week must be 1-18" }, { status: 400 });
    }

    const season = currentNflSeason();
    const [{ data: rows }, schedule, names] = await Promise.all([
      supabaseAdmin
        .from("nfl_pickem_picks")
        .select(
          "season, week, entrant_id, game_id, picked_team, confidence, is_bet, bet_decimal, parlay_group",
        )
        .eq("season", season)
        .eq("week", week),
      fetchNflWeek(week),
      seasonDisplayNames(),
    ]);

    const standings = scoreWeek(schedule.games, (rows ?? []) as PickRow[], names);

    // Strip pick-level detail; the standings only need aggregates (the picks
    // API handles per-game reveal rules).
    const safe = standings.map(({ picks: _picks, ...rest }) => rest);

    return NextResponse.json({ season, week, standings: safe });
  } catch (err) {
    return NextResponse.json(
      { error: getErrorMessage(err, "Failed to score the week") },
      { status: 500 },
    );
  }
}
