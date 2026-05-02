import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getEventBySlug, getCurrentSeasonId } from "@/lib/events/resolve";
import { getEventHandler } from "@/lib/events/registry";
import { getErrorMessage } from "@/lib/error";

export const revalidate = 0;

// Runs the handler's computeFinishes against the current entries without
// writing to event_finishes — useful for bracket events to show live
// standings during playoffs.
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

    const handler = getEventHandler(event);
    const { data: entries } = await supabaseAdmin
      .from("event_entries")
      .select("entrant_id, payload")
      .eq("event_id", event.event_id);

    if (!entries || entries.length === 0) {
      return NextResponse.json({ event, provisional: [] });
    }

    const finishes = await handler.computeFinishes({
      event,
      entries: entries.map((e) => ({
        entrant_id: e.entrant_id as string,
        payload: e.payload as unknown,
      })),
    });

    return NextResponse.json({ event, provisional: finishes });
  } catch (err) {
    return NextResponse.json(
      { error: getErrorMessage(err, "Failed to compute provisional") },
      { status: 500 },
    );
  }
}
