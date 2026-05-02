import { NextResponse } from "next/server";
import { getAuthenticatedEntrant } from "@/lib/draftAuth";
import { supabaseAdmin } from "@/lib/supabase";

const SEASON_YEAR = 2026;
const PAGE_SIZE = 50;

async function getSeasonId(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("seasons")
    .select("season_id")
    .eq("year", SEASON_YEAR)
    .single();
  return data?.season_id ?? null;
}

export async function GET() {
  try {
    const seasonId = await getSeasonId();
    if (!seasonId) return NextResponse.json({ messages: [] });

    const { data, error } = await supabaseAdmin
      .from("chat_messages")
      .select("message_id, entrant_id, display_name, body, created_at")
      .eq("season_id", seasonId)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);

    if (error) throw error;

    return NextResponse.json({ messages: (data ?? []).reverse() });
  } catch {
    return NextResponse.json({ messages: [] });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getAuthenticatedEntrant();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const text = typeof body?.body === "string" ? body.body.trim() : "";
    if (!text || text.length > 500) {
      return NextResponse.json({ error: "Invalid message" }, { status: 400 });
    }

    const seasonId = await getSeasonId();
    if (!seasonId) {
      return NextResponse.json({ error: "Season not found" }, { status: 404 });
    }

    // Resolve display_name from season_members; fall back to entrant_name.
    const { data: memberRow } = await supabaseAdmin
      .from("season_members")
      .select("display_name")
      .eq("entrant_id", session.entrant.entrant_id)
      .single();

    const displayName = memberRow?.display_name ?? session.entrant.entrant_name;

    const { data, error } = await supabaseAdmin
      .from("chat_messages")
      .insert({
        season_id: seasonId,
        entrant_id: session.entrant.entrant_id,
        display_name: displayName,
        body: text,
      })
      .select("message_id, entrant_id, display_name, body, created_at")
      .single();

    if (error) throw error;

    return NextResponse.json({ message: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }
}
