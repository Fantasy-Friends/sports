import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthenticatedEntrant } from "@/lib/draftAuth";
import { getEventBySlug, getCurrentSeasonId } from "@/lib/events/resolve";
import { getErrorMessage } from "@/lib/error";

export const revalidate = 0;

type SeriesResultInput = {
  round: "r1" | "r2" | "conf_finals" | "finals";
  match_id: string;
  winner_team_id?: string | null;
  games?: number | null;
  finals_mvp_player_id?: string | null;
  finals_total_points?: number | null;
};

export async function GET(request: NextRequest) {
  try {
    const slug = new URL(request.url).searchParams.get("slug");
    if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });
    const seasonId = await getCurrentSeasonId();
    if (!seasonId) return NextResponse.json({ results: [] });
    const event = await getEventBySlug(slug, seasonId);
    if (!event) return NextResponse.json({ error: "event not found" }, { status: 404 });

    const { data } = await supabaseAdmin
      .from("nba_series_results")
      .select("round, match_id, winner_team_id, games, finals_mvp_player_id, finals_total_points")
      .eq("event_id", event.event_id);

    return NextResponse.json({ event, results: data ?? [] });
  } catch (err) {
    return NextResponse.json(
      { error: getErrorMessage(err, "Failed to load results") },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthenticatedEntrant();
    if (!session?.entrant.is_admin) {
      return NextResponse.json({ error: "admin required" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      slug?: string;
      results?: SeriesResultInput[];
    };
    if (!body.slug) return NextResponse.json({ error: "slug required" }, { status: 400 });
    if (!Array.isArray(body.results)) {
      return NextResponse.json({ error: "results[] required" }, { status: 400 });
    }

    const seasonId = await getCurrentSeasonId();
    if (!seasonId) return NextResponse.json({ error: "no active season" }, { status: 404 });
    const event = await getEventBySlug(body.slug, seasonId);
    if (!event) return NextResponse.json({ error: "event not found" }, { status: 404 });

    const rows = body.results.map((r) => ({
      event_id: event.event_id,
      round: r.round,
      match_id: r.match_id,
      winner_team_id: r.winner_team_id ?? null,
      games: r.games ?? null,
      finals_mvp_player_id: r.finals_mvp_player_id ?? null,
      finals_total_points: r.finals_total_points ?? null,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabaseAdmin
      .from("nba_series_results")
      .upsert(rows, { onConflict: "event_id,round,match_id" });
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, count: rows.length });
  } catch (err) {
    return NextResponse.json(
      { error: getErrorMessage(err, "Failed to save results") },
      { status: 500 },
    );
  }
}
