import { NextResponse } from "next/server";
import { getAuthenticatedEntrant } from "@/lib/draftAuth";
import { getErrorMessage } from "@/lib/error";
import { fetchSlashLeaderboard } from "@/lib/slashGolf";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
  const apiKey = process.env.SLASH_GOLF_API_KEY || process.env.RAPIDAPI_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing SLASH_GOLF_API_KEY or RAPIDAPI_KEY environment variable." },
      { status: 500 }
    );
  }

  let body: {
    pool_id?: string;
    tournament_slug?: string;
    tournament_id?: string;
    year?: string | number;
    round_par?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const poolId = body.pool_id?.trim();
  const tournamentSlug = body.tournament_slug?.trim();
  const tournamentId = String(body.tournament_id ?? "").trim();
  const year = String(body.year ?? new Date().getFullYear()).trim();
  const roundPar = Number(body.round_par ?? 72);

  if (!poolId || !tournamentSlug || !tournamentId) {
    return NextResponse.json(
      { error: "pool_id, tournament_slug, and tournament_id are required." },
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

    const leaderboard = await fetchSlashLeaderboard(apiKey, tournamentId, year);

    const roundRows = leaderboard.rows.flatMap((player) =>
      player.rounds.map((round) => ({
        pool_id: poolId,
        tournament_slug: tournamentSlug,
        golfer: player.golfer,
        round_number: round.round_number,
        strokes: round.strokes,
        score_status: round.score_status,
        position: player.position,
        position_text: player.position_text,
      }))
    );

    const roundCount = Math.max(
      1,
      Math.min(
        4,
        leaderboard.rows.reduce((max, player) => Math.max(max, player.rounds.length), 0) || 4
      )
    );

    const { error: metaError } = await supabaseAdmin
      .from("tournament_meta")
      .upsert(
        {
          pool_id: poolId,
          tournament_slug: tournamentSlug,
          round_count: roundCount,
          round_par: roundPar,
        },
        { onConflict: "pool_id,tournament_slug" }
      );

    if (metaError) {
      return NextResponse.json({ error: metaError.message }, { status: 500 });
    }

    // Upsert first so a failed write never leaves the tournament with zero
    // scores (the old delete-then-insert wiped everything if the insert threw).
    // PK is (pool_id, tournament_slug, golfer, round_number).
    if (roundRows.length > 0) {
      const { error: upsertError } = await supabaseAdmin
        .from("tournament_round_scores")
        .upsert(roundRows, { onConflict: "pool_id,tournament_slug,golfer,round_number" });

      if (upsertError) {
        return NextResponse.json({ error: upsertError.message }, { status: 500 });
      }

      // Prune only stale golfers (dropped from the leaderboard) — the fresh
      // rows we just wrote are always kept.
      const liveGolfers = Array.from(new Set(roundRows.map((r) => r.golfer)));
      const { error: pruneError } = await supabaseAdmin
        .from("tournament_round_scores")
        .delete()
        .eq("pool_id", poolId)
        .eq("tournament_slug", tournamentSlug)
        .not("golfer", "in", `(${liveGolfers.map((g) => `"${g.replace(/"/g, '""')}"`).join(",")})`);

      if (pruneError) {
        return NextResponse.json({ error: pruneError.message }, { status: 500 });
      }
    }

    return NextResponse.json({
      ok: true,
      pool_id: poolId,
      tournament_slug: tournamentSlug,
      tournament_id: tournamentId,
      year,
      count: roundRows.length,
      round_count: roundCount,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(error, "Failed to sync Slash Golf leaderboard.") },
      { status: 502 }
    );
  }
}
