import { NextResponse } from "next/server";
import { getAuthenticatedEntrant } from "@/lib/draftAuth";
import { advanceDraftState } from "@/lib/draftOrder";
import { getErrorMessage } from "@/lib/error";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
  let body: { pool_id?: string; entrant_id?: string; auto_draft_enabled?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const poolId = body.pool_id?.trim();
  const entrantId = body.entrant_id?.trim();
  const autoDraftEnabled = body.auto_draft_enabled;

  if (!poolId || !entrantId || typeof autoDraftEnabled !== "boolean") {
    return NextResponse.json(
      { error: "pool_id, entrant_id, and auto_draft_enabled are required." },
      { status: 400 }
    );
  }

  try {
    const session = await getAuthenticatedEntrant(poolId);
    if (!session) {
      return NextResponse.json({ error: "Not authenticated for this pool." }, { status: 401 });
    }
    const isSelfToggle = session.entrant.entrant_id === entrantId;
    if (!session.entrant.is_admin && !isSelfToggle) {
      return NextResponse.json(
        { error: "You can only update your own auto-draft setting." },
        { status: 403 }
      );
    }

    const { error } = await supabaseAdmin
      .from("draft_entrants")
      .update({ auto_draft_enabled: autoDraftEnabled })
      .eq("pool_id", poolId)
      .eq("entrant_id", entrantId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const summary = await advanceDraftState(poolId);

    return NextResponse.json({
      ok: true,
      pool_id: poolId,
      entrant_id: entrantId,
      auto_draft_enabled: autoDraftEnabled,
      draft_state: summary,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(error, "Failed to update auto-draft.") },
      { status: 500 }
    );
  }
}
