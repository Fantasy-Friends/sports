import { NextResponse } from "next/server";
import { getAuthenticatedEntrant } from "@/lib/draftAuth";
import { buildDraftState, EXPECTED_ENTRANT_COUNT } from "@/lib/draftOrder";
import { getErrorMessage } from "@/lib/error";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
  let body: { pool_id?: string; tournament_slug?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const poolId = body.pool_id?.trim();
  const tournamentSlug = body.tournament_slug?.trim();

  if (!poolId || !tournamentSlug) {
    return NextResponse.json(
      { error: "pool_id and tournament_slug are required." },
      { status: 400 }
    );
  }

  try {
    const session = await getAuthenticatedEntrant(poolId);
    if (!session) {
      return NextResponse.json({ error: "Not authenticated for this pool." }, { status: 401 });
    }
    if (!session.entrant.is_admin) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const { error: picksError } = await supabaseAdmin.from("draft_picks").delete().eq("pool_id", poolId);
    if (picksError) {
      return NextResponse.json({ error: picksError.message }, { status: 500 });
    }

    const { error: stateError } = await supabaseAdmin.from("draft_state").delete().eq("pool_id", poolId);
    if (stateError) {
      return NextResponse.json({ error: stateError.message }, { status: 500 });
    }

    const { error: entrantError } = await supabaseAdmin
      .from("draft_entrants")
      .update({ auto_draft_enabled: false })
      .eq("pool_id", poolId);
    if (entrantError) {
      return NextResponse.json({ error: entrantError.message }, { status: 500 });
    }

    const { error: metaError } = await supabaseAdmin
      .from("tournament_meta")
      .update({ draft_open: false })
      .eq("pool_id", poolId)
      .eq("tournament_slug", tournamentSlug);
    if (metaError) {
      return NextResponse.json({ error: metaError.message }, { status: 500 });
    }

    const summary = await buildDraftState(poolId);

    return NextResponse.json({
      ok: true,
      pool_id: poolId,
      tournament_slug: tournamentSlug,
      draft_open: false,
      draft_started: false,
      current_pick: null,
      current_round: null,
      current_entrant_id: null,
      current_entrant_name: null,
      entrant_count: summary.entrant_count,
      expected_entrant_count: EXPECTED_ENTRANT_COUNT,
      total_picks: 0,
      max_picks: summary.max_picks,
      is_complete: false,
      turn_started_at: null,
      turn_expires_at: null,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(error, "Failed to reset pool to pre-draft state.") },
      { status: 500 }
    );
  }
}
