import { NextResponse } from "next/server";
import {
  advanceDraftState,
  buildDraftState,
  EXPECTED_ENTRANT_COUNT,
  isDraftWindowOpen,
} from "@/lib/draftOrder";
import { getErrorMessage } from "@/lib/error";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type TournamentMetaRow = {
  draft_open: boolean | null;
  tournament_slug: string;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const poolId =
    url.searchParams.get("pool_id") ||
    process.env.POOL_ID ||
    process.env.NEXT_PUBLIC_POOL_ID ||
    "2026-majors";

  try {
    const { data: metaRows, error: metaError } = await supabaseAdmin
      .from("tournament_meta")
      .select("tournament_slug, draft_open")
      .eq("pool_id", poolId)
      .order("tournament_slug", { ascending: true })
      .limit(1);

    if (metaError) {
      return NextResponse.json({ error: metaError.message }, { status: 500 });
    }

    const meta = ((metaRows ?? []) as TournamentMetaRow[])[0];
    const draftActiveNow = (meta?.draft_open ?? false) && isDraftWindowOpen();
    const summary = draftActiveNow ? await advanceDraftState(poolId) : await buildDraftState(poolId);

    return NextResponse.json({
      ok: true,
      pool_id: poolId,
      draft_open: meta?.draft_open ?? false,
      draft_active_now: draftActiveNow,
      draft_started: summary.draft_started,
      current_pick: summary.current_pick,
      current_round: summary.current_round,
      current_entrant_id: summary.current_entrant_id,
      current_entrant_name: summary.current_entrant_name,
      entrant_count: summary.entrant_count,
      expected_entrant_count: EXPECTED_ENTRANT_COUNT,
      total_picks: summary.total_picks,
      max_picks: summary.max_picks,
      is_complete: summary.is_complete,
      turn_started_at: summary.turn_started_at,
      turn_expires_at: summary.turn_expires_at,
    }, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(error, "Failed to load draft state.") },
      { status: 500 }
    );
  }
}
