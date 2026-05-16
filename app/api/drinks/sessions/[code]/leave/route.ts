import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthenticatedEntrant } from "@/lib/draftAuth";
import { getErrorMessage } from "@/lib/error";

export const revalidate = 0;

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
      .select("session_id")
      .eq("code", code)
      .maybeSingle<{ session_id: string }>();
    if (!session) {
      return NextResponse.json({ error: "session not found" }, { status: 404 });
    }

    const { error } = await supabaseAdmin
      .from("drink_session_members")
      .update({ left_at: new Date().toISOString() })
      .eq("session_id", session.session_id)
      .eq("entrant_id", auth.entrant.entrant_id);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: getErrorMessage(err, "Failed to leave session") },
      { status: 500 },
    );
  }
}
