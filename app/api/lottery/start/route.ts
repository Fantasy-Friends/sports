import { NextResponse } from "next/server";
import { getAuthenticatedEntrant } from "@/lib/draftAuth";
import { getErrorMessage } from "@/lib/error";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type EntrantRow = {
  entrant_id: string;
  entrant_name: string;
};

type LotteryResultEntry = {
  entrant_id: string;
  entrant_name: string;
  draft_position: number;
};

function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

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
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }
    if (!session.entrant.is_admin) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const { data: entrants, error: entrantsError } = await supabaseAdmin
      .from("draft_entrants")
      .select("entrant_id, entrant_name")
      .eq("pool_id", poolId);

    if (entrantsError) throw new Error(entrantsError.message);
    if (!entrants || entrants.length === 0) {
      return NextResponse.json({ error: "No entrants found for this pool." }, { status: 400 });
    }

    // Shuffle and assign positions. The first entrant in the shuffled array
    // gets pick 1 (best pick); last gets pick N.
    // Stored in reveal order: pick N revealed first, pick 1 revealed last.
    const shuffled = shuffle(entrants as EntrantRow[]);
    const totalEntrants = shuffled.length;

    const result: LotteryResultEntry[] = shuffled.map((e, i) => ({
      entrant_id: e.entrant_id,
      entrant_name: e.entrant_name,
      draft_position: i + 1, // 1 = best pick (revealed last)
    }));

    // Reveal order: highest pick number first → sort descending by draft_position
    const revealOrder = [...result].sort((a, b) => b.draft_position - a.draft_position);

    const now = new Date().toISOString();

    // Upsert lottery row
    const { error: lotteryError } = await supabaseAdmin
      .from("draft_lottery")
      .upsert(
        {
          pool_id: poolId,
          started_at: now,
          status: "completed",
          result: revealOrder,
          updated_at: now,
        },
        { onConflict: "pool_id" }
      );

    if (lotteryError) throw new Error(lotteryError.message);

    // Write draft_position to each entrant
    await Promise.all(
      result.map(({ entrant_id, draft_position }) =>
        supabaseAdmin
          .from("draft_entrants")
          .update({ draft_position })
          .eq("entrant_id", entrant_id)
          .eq("pool_id", poolId)
      )
    );

    return NextResponse.json({
      ok: true,
      pool_id: poolId,
      entrant_count: totalEntrants,
      result: revealOrder,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(error, "Failed to start lottery.") },
      { status: 500 }
    );
  }
}
