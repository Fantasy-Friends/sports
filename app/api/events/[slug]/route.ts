import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getEventBySlug, getCurrentSeasonId } from "@/lib/events/resolve";
import { getErrorMessage } from "@/lib/error";

export const revalidate = 0;

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await context.params;
    const seasonId = await getCurrentSeasonId();
    if (!seasonId) return NextResponse.json({ error: "no active season" }, { status: 404 });

    const event = await getEventBySlug(slug, seasonId);
    if (!event) return NextResponse.json({ error: "event not found" }, { status: 404 });

    const [{ data: entries }, { data: finishes }] = await Promise.all([
      supabaseAdmin
        .from("event_entries")
        .select("entrant_id, submitted_at, locked_at")
        .eq("event_id", event.event_id),
      supabaseAdmin
        .from("event_finishes")
        .select("entrant_id, finish_rank, raw_score, base_points, awarded_points, tie_break_notes")
        .eq("event_id", event.event_id),
    ]);

    return NextResponse.json({
      event,
      entries: entries ?? [],
      finishes: finishes ?? [],
    });
  } catch (err) {
    return NextResponse.json(
      { error: getErrorMessage(err, "Failed to load event") },
      { status: 500 },
    );
  }
}
