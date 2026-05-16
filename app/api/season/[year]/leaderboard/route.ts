import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getErrorMessage } from "@/lib/error";

export const revalidate = 0;

type LeaderboardRow = {
  season_id: string;
  entrant_id: string;
  display_name: string;
  seat_order: number | null;
  event_points: number;
  bonus_points: number;
  total_points: number;
  events_scored: number;
  bonuses_earned: number;
};

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ year: string }> },
) {
  try {
    const { year } = await context.params;
    const yearNum = Number(year);
    if (!Number.isFinite(yearNum)) {
      return NextResponse.json({ error: "invalid year" }, { status: 400 });
    }

    const { data: season, error: seasonError } = await supabaseAdmin
      .from("seasons")
      .select("season_id, year, label")
      .eq("year", yearNum)
      .maybeSingle<{ season_id: string; year: number; label: string }>();

    if (seasonError) throw new Error(seasonError.message);
    if (!season) {
      return NextResponse.json({ season: null, rows: [] });
    }

    const { data: rows, error: viewError } = await supabaseAdmin
      .from("v_season_leaderboard")
      .select(
        "season_id, entrant_id, display_name, seat_order, event_points, bonus_points, total_points, events_scored, bonuses_earned",
      )
      .eq("season_id", season.season_id);

    if (viewError) throw new Error(viewError.message);

    const sorted = [...((rows ?? []) as LeaderboardRow[])].sort((a, b) => {
      if (b.total_points !== a.total_points) return b.total_points - a.total_points;
      return (a.seat_order ?? 99) - (b.seat_order ?? 99);
    });

    return NextResponse.json({ season, rows: sorted });
  } catch (err) {
    return NextResponse.json(
      { error: getErrorMessage(err, "Failed to load season") },
      { status: 500 },
    );
  }
}
