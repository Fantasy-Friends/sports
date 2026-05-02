import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthenticatedEntrant } from "@/lib/draftAuth";
import { getCurrentSeasonId } from "@/lib/events/resolve";
import { getErrorMessage } from "@/lib/error";

export const revalidate = 0;

export async function GET() {
  try {
    const session = await getAuthenticatedEntrant();
    if (!session?.entrant.is_admin) {
      return NextResponse.json({ error: "admin required" }, { status: 403 });
    }
    const seasonId = await getCurrentSeasonId();
    if (!seasonId) return NextResponse.json({ events: [] });

    const { data, error } = await supabaseAdmin
      .from("events")
      .select("event_id, slug, name, event_type, tier, status, starts_at, ends_at")
      .eq("season_id", seasonId)
      .order("starts_at", { ascending: true });
    if (error) throw new Error(error.message);
    return NextResponse.json({ events: data ?? [] });
  } catch (err) {
    return NextResponse.json(
      { error: getErrorMessage(err, "Failed to load events") },
      { status: 500 },
    );
  }
}
