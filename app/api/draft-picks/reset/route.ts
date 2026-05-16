import { NextResponse } from "next/server";
import { getAuthenticatedEntrant } from "@/lib/draftAuth";
import { syncDraftState } from "@/lib/draftOrder";
import { getErrorMessage } from "@/lib/error";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
  let body: { pool_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const poolId = body.pool_id?.trim();
  if (!poolId) {
    return NextResponse.json({ error: "pool_id is required." }, { status: 400 });
  }

  try {
    const session = await getAuthenticatedEntrant(poolId);
    if (!session) {
      return NextResponse.json({ error: "Not authenticated for this pool." }, { status: 401 });
    }
    if (!session.entrant.is_admin) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const { error } = await supabaseAdmin
      .from("draft_picks")
      .delete()
      .eq("pool_id", poolId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await syncDraftState(poolId, false);

    return NextResponse.json({ ok: true, poolId });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(error, "Failed to reset draft board.") },
      { status: 500 }
    );
  }
}
