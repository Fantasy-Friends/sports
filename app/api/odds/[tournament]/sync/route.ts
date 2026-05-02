import { NextResponse } from "next/server";
import { getAuthenticatedEntrant } from "@/lib/draftAuth";
import { getErrorMessage } from "@/lib/error";
import { fetchHandicaps, isTournamentSlug } from "@/lib/odds";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ tournament: string }> }
) {
  const { tournament } = await params;
  const apiKey = process.env.ODDS_API_KEY;

  if (!isTournamentSlug(tournament)) {
    return NextResponse.json({ error: "Invalid tournament slug." }, { status: 400 });
  }

  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing ODDS_API_KEY environment variable." },
      { status: 500 }
    );
  }

  let body: { pool_id?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const poolId =
    body.pool_id?.trim() ||
    process.env.POOL_ID ||
    process.env.NEXT_PUBLIC_POOL_ID ||
    "2026-majors";

  try {
    const session = await getAuthenticatedEntrant(poolId);
    if (!session) {
      return NextResponse.json({ error: "Not authenticated for this pool." }, { status: 401 });
    }
    if (!session.entrant.is_admin) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }
  } catch (error: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(error, "Failed to validate entrant session.") },
      { status: 500 }
    );
  }

  let handicaps;
  try {
    handicaps = await fetchHandicaps(apiKey, tournament);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(error, `Failed to fetch handicaps for ${tournament}.`) },
      { status: 502 }
    );
  }

  const rows = handicaps.map((row) => ({
    pool_id: poolId,
    rank: row.rank,
    golfer: row.golfer,
    handicap: row.handicap,
  }));

  const { error: deleteError } = await supabaseAdmin
    .from("golfers")
    .delete()
    .eq("pool_id", poolId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  const { error } = await supabaseAdmin.from("golfers").insert(rows);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    tournament,
    pool_id: poolId,
    count: rows.length,
    golfers: rows,
  });
}
