import { NextResponse } from "next/server";
import { getAuthenticatedEntrant } from "@/lib/draftAuth";
import { getErrorMessage } from "@/lib/error";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

// A personal draft queue is private to its entrant. Both reads and writes are
// scoped to the authenticated session's entrant for the requested pool.

export async function GET(req: Request) {
  const url = new URL(req.url);
  const poolId = url.searchParams.get("pool_id")?.trim();

  if (!poolId) {
    return NextResponse.json({ error: "pool_id is required." }, { status: 400 });
  }

  try {
    const session = await getAuthenticatedEntrant(poolId);
    if (!session) {
      return NextResponse.json({ error: "Not authenticated for this pool." }, { status: 401 });
    }

    const { data, error } = await supabaseAdmin
      .from("draft_queue")
      .select("golfer, sort_order")
      .eq("pool_id", poolId)
      .eq("entrant_id", session.entrant.entrant_id)
      .order("sort_order", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      poolId,
      golfers: (data ?? []).map((row) => row.golfer as string),
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(error, "Failed to load draft queue.") },
      { status: 500 },
    );
  }
}

// Replace the entrant's whole queue with the supplied ordered list. Sending the
// full array on every change keeps add / remove / reorder to a single endpoint.
export async function POST(req: Request) {
  let body: { pool_id?: string; golfers?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const poolId = body.pool_id?.trim();
  if (!poolId) {
    return NextResponse.json({ error: "pool_id is required." }, { status: 400 });
  }
  if (!Array.isArray(body.golfers)) {
    return NextResponse.json({ error: "golfers must be an array." }, { status: 400 });
  }

  try {
    const session = await getAuthenticatedEntrant(poolId);
    if (!session) {
      return NextResponse.json({ error: "Not authenticated for this pool." }, { status: 401 });
    }
    const entrantId = session.entrant.entrant_id;

    // Normalize: trim, drop blanks, de-dupe while preserving order.
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const value of body.golfers) {
      const golfer = typeof value === "string" ? value.trim() : "";
      if (!golfer || seen.has(golfer)) continue;
      seen.add(golfer);
      ordered.push(golfer);
    }

    // Keep only golfers that actually belong to this pool, so a stale client
    // can't queue a name that isn't draftable.
    if (ordered.length > 0) {
      const { data: poolGolfers, error: poolError } = await supabaseAdmin
        .from("golfers")
        .select("golfer")
        .eq("pool_id", poolId)
        .in("golfer", ordered);

      if (poolError) {
        return NextResponse.json({ error: poolError.message }, { status: 500 });
      }
      const valid = new Set((poolGolfers ?? []).map((row) => row.golfer as string));
      for (let i = ordered.length - 1; i >= 0; i -= 1) {
        if (!valid.has(ordered[i])) ordered.splice(i, 1);
      }
    }

    const { error: deleteError } = await supabaseAdmin
      .from("draft_queue")
      .delete()
      .eq("pool_id", poolId)
      .eq("entrant_id", entrantId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    if (ordered.length > 0) {
      const rows = ordered.map((golfer, index) => ({
        pool_id: poolId,
        entrant_id: entrantId,
        golfer,
        sort_order: index,
      }));
      const { error: insertError } = await supabaseAdmin.from("draft_queue").insert(rows);
      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true, poolId, golfers: ordered });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(error, "Failed to save draft queue.") },
      { status: 500 },
    );
  }
}
