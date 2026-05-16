import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getErrorMessage } from "@/lib/error";

export const revalidate = 0;

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

    const { data: season } = await supabaseAdmin
      .from("seasons")
      .select("season_id")
      .eq("year", yearNum)
      .maybeSingle<{ season_id: string }>();

    if (!season) return NextResponse.json({ events: [], finishes: [] });

    const [{ data: events, error: eventsError }, { data: finishes, error: finishesError }] = await Promise.all([
      supabaseAdmin
        .from("events")
        .select("event_id, slug, name, event_type, tier, status, starts_at, ends_at, group_key")
        .eq("season_id", season.season_id)
        .order("starts_at", { ascending: true }),
      supabaseAdmin
        .from("event_finishes")
        .select("event_id, entrant_id, finish_rank, awarded_points"),
    ]);

    if (eventsError) throw new Error(eventsError.message);
    if (finishesError) throw new Error(finishesError.message);

    const eventIds = new Set((events ?? []).map((e) => e.event_id));
    const relevantFinishes = (finishes ?? []).filter((f) => eventIds.has(f.event_id));

    return NextResponse.json({ events: events ?? [], finishes: relevantFinishes });
  } catch (err) {
    return NextResponse.json(
      { error: getErrorMessage(err, "Failed to load events") },
      { status: 500 },
    );
  }
}
