import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthenticatedEntrant } from "@/lib/draftAuth";
import { getErrorMessage } from "@/lib/error";

export const revalidate = 0;

// End a session. Only the creator (or an admin) can end it.
export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const auth = await getAuthenticatedEntrant();
    if (!auth) return NextResponse.json({ error: "auth required" }, { status: 401 });

    const { code: rawCode } = await context.params;
    const code = rawCode.toUpperCase();

    const { data: session } = await supabaseAdmin
      .from("drink_sessions")
      .select("session_id, created_by, ended_at")
      .eq("code", code)
      .maybeSingle<{ session_id: string; created_by: string; ended_at: string | null }>();
    if (!session) {
      return NextResponse.json({ error: "session not found" }, { status: 404 });
    }
    if (session.ended_at) {
      return NextResponse.json({ ok: true, already_ended: true });
    }

    if (session.created_by !== auth.entrant.entrant_id && !auth.entrant.is_admin) {
      return NextResponse.json({ error: "only the creator can end this session" }, { status: 403 });
    }

    const { error } = await supabaseAdmin
      .from("drink_sessions")
      .update({ ended_at: new Date().toISOString() })
      .eq("session_id", session.session_id);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: getErrorMessage(err, "Failed to end session") },
      { status: 500 },
    );
  }
}
