import { NextResponse } from "next/server";
import { getAuthenticatedEntrant } from "@/lib/draftAuth";
import { buildDraftState } from "@/lib/draftOrder";
import { getErrorMessage } from "@/lib/error";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type PickRow = {
  golfer: string;
  pick_number: number;
};

export async function POST(req: Request) {
  let body: { pool_id?: string; golfer?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const poolId = body.pool_id?.trim();
  const golfer = body.golfer?.trim();

  if (!poolId || !golfer) {
    return NextResponse.json({ error: "pool_id and golfer are required." }, { status: 400 });
  }

  try {
    const session = await getAuthenticatedEntrant(poolId);
    if (!session) {
      return NextResponse.json({ error: "Not authenticated for this pool." }, { status: 401 });
    }

    const draftState = await buildDraftState(poolId);
    if (draftState.total_picks > 0) {
      return NextResponse.json(
        { error: "Individual pick removal is disabled after the draft has started." },
        { status: 423 }
      );
    }

    const { error: deleteError } = await supabaseAdmin
      .from("draft_picks")
      .delete()
      .eq("pool_id", poolId)
      .eq("entrant_id", session.entrant.entrant_id)
      .eq("golfer", golfer);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    const { data: remainingRows, error: loadError } = await supabaseAdmin
      .from("draft_picks")
      .select("golfer, pick_number")
      .eq("pool_id", poolId)
      .eq("entrant_id", session.entrant.entrant_id)
      .order("pick_number", { ascending: true });

    if (loadError) {
      return NextResponse.json({ error: loadError.message }, { status: 500 });
    }

    const updates = ((remainingRows ?? []) as PickRow[])
      .map((row, index) => ({
        golfer: row.golfer,
        old_pick_number: row.pick_number,
        new_pick_number: index + 1,
      }))
      .filter((row) => row.old_pick_number !== row.new_pick_number);

    for (const update of updates) {
      const { error: updateError } = await supabaseAdmin
        .from("draft_picks")
        .update({ pick_number: update.new_pick_number })
        .eq("pool_id", poolId)
        .eq("entrant_id", session.entrant.entrant_id)
        .eq("golfer", update.golfer);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
    }

    return NextResponse.json({
      ok: true,
      poolId,
      entrant: session.entrant.entrant_name,
      golfer,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(error, "Failed to remove draft pick.") },
      { status: 500 }
    );
  }
}
