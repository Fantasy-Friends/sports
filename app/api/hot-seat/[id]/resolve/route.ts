import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthenticatedEntrant } from "@/lib/draftAuth";
import { getCurrentSeasonId } from "@/lib/events/resolve";
import { getErrorMessage } from "@/lib/error";

// Admin-only. Marks a hot-seat take as hit or miss. On hit, writes a
// bonus_awards row (+10). Idempotent: re-resolving removes prior bonus
// and re-inserts if still a hit.
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const session = await getAuthenticatedEntrant();
    if (!session?.entrant.is_admin) {
      return NextResponse.json({ error: "admin required" }, { status: 403 });
    }
    const seasonId = await getCurrentSeasonId();
    if (!seasonId) return NextResponse.json({ error: "no active season" }, { status: 404 });

    const body = (await request.json().catch(() => ({}))) as { outcome?: string };
    if (body.outcome !== "hit" && body.outcome !== "miss") {
      return NextResponse.json({ error: "outcome must be hit or miss" }, { status: 400 });
    }

    const { data: hs } = await supabaseAdmin
      .from("hot_seat_weeks")
      .select("hot_seat_id, entrant_id, status")
      .eq("hot_seat_id", id)
      .maybeSingle<{ hot_seat_id: string; entrant_id: string; status: string }>();
    if (!hs) return NextResponse.json({ error: "not found" }, { status: 404 });

    // Clear any prior hot-seat bonus for this hot seat (idempotent).
    await supabaseAdmin
      .from("bonus_awards")
      .delete()
      .eq("season_id", seasonId)
      .eq("entrant_id", hs.entrant_id)
      .eq("bonus_type", "hot_seat")
      .is("event_id", null);

    if (body.outcome === "hit") {
      const { error } = await supabaseAdmin.from("bonus_awards").insert({
        season_id: seasonId,
        entrant_id: hs.entrant_id,
        event_id: null,
        bonus_type: "hot_seat",
        points: 10,
        note: `Hot Seat hit (${hs.hot_seat_id})`,
      });
      if (error) throw new Error(error.message);
    }

    const { error: upd } = await supabaseAdmin
      .from("hot_seat_weeks")
      .update({ status: body.outcome, resolved_at: new Date().toISOString() })
      .eq("hot_seat_id", id);
    if (upd) throw new Error(upd.message);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: getErrorMessage(err, "Failed to resolve") },
      { status: 500 },
    );
  }
}
