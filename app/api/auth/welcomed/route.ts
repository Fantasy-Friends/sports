import { NextResponse } from "next/server";
import { getAuthenticatedEntrant } from "@/lib/draftAuth";
import { getErrorMessage } from "@/lib/error";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * POST /api/auth/welcomed — mark the current entrant as having seen the
 * first-login welcome experience. Idempotent; subsequent calls no-op.
 */
export async function POST() {
  try {
    const session = await getAuthenticatedEntrant();
    if (!session) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const now = new Date().toISOString();

    // Only set welcomed_at if it's not already set — keeps the first-time
    // timestamp accurate even if this endpoint is called again.
    const { error } = await supabaseAdmin
      .from("draft_entrants")
      .update({ welcomed_at: now })
      .eq("entrant_id", session.entrant.entrant_id)
      .is("welcomed_at", null);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, welcomed_at: session.entrant.welcomed_at ?? now });
  } catch (err) {
    return NextResponse.json(
      { error: getErrorMessage(err, "Failed to mark welcomed") },
      { status: 500 },
    );
  }
}
