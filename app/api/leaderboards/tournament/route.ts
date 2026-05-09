import { NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/error";
import {
  fetchSlashLeaderboard,
  golferLookupKeys,
  normalizeGolferName,
  resolveSlashTournamentId,
  type SlashLeaderboardRow,
} from "@/lib/slashGolf";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isTournamentEnded, isTournamentSlug, type TournamentSlug } from "@/lib/tournaments";

type StoredScoreRow = {
  golfer: string;
  round_number: number;
  strokes: number | null;
  score_status: string;
  position: number | null;
  position_text: string | null;
};

function buildStoredLeaderboard(scores: StoredScoreRow[], roundPar: number): { rows: SlashLeaderboardRow[] } {
  const byGolfer = new Map<string, { position: number | null; position_text: string | null; rounds: SlashLeaderboardRow["rounds"] }>();
  for (const row of scores) {
    if (!byGolfer.has(row.golfer)) {
      byGolfer.set(row.golfer, { position: row.position, position_text: row.position_text, rounds: [] });
    }
    byGolfer.get(row.golfer)!.rounds.push({
      round_number: row.round_number,
      strokes: row.strokes,
      score_status: row.score_status as "played" | "cut" | "wd",
    });
  }
  return {
    rows: Array.from(byGolfer.entries()).map(([golfer, data]) => {
      const played = data.rounds.filter((r) => r.strokes !== null);
      const gross = played.length > 0 ? played.reduce((s, r) => s + (r.strokes as number), 0) : null;
      return {
        golfer,
        position: data.position,
        position_text: data.position_text,
        total_to_par: gross !== null ? gross - played.length * roundPar : null,
        total_strokes: gross,
        thru: "F",
        current_round_score: null,
        rounds: data.rounds.sort((a, b) => a.round_number - b.round_number),
      };
    }),
  };
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

function leaderboardPositionValue(position: number | null, positionText: string | null) {
  if (typeof position === "number") return position;
  if (positionText) {
    const match = positionText.match(/\d+/);
    if (match) {
      const parsed = Number(match[0]);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return 9999;
}

function thruSortValue(thru: string | null | undefined) {
  const normalized = String(thru ?? "").trim().toUpperCase();
  if (!normalized) return -1;
  if (normalized === "F") return 999;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : -1;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const poolId =
    url.searchParams.get("pool_id") ||
    process.env.POOL_ID ||
    process.env.NEXT_PUBLIC_POOL_ID ||
    "2026-majors-pga-championship";
  const tournament = (url.searchParams.get("tournament") || "pga-championship").trim();
  const year = (url.searchParams.get("year") || new Date().getFullYear().toString()).trim();

  if (!tournament) {
    return NextResponse.json({ error: "tournament is required." }, { status: 400 });
  }

  try {
    const apiKey = process.env.SLASH_GOLF_API_KEY || process.env.RAPIDAPI_KEY;
    const tournamentOver = isTournamentSlug(tournament) && isTournamentEnded(tournament as TournamentSlug);

    if (!apiKey && !tournamentOver) {
      return NextResponse.json(
        { ok: true, poolId, tournament, source: "unavailable", mode: "live-only-v2", rows: [] },
        { headers: { "Cache-Control": "no-store, max-age=0" } }
      );
    }

    const [
      { data: picks, error: picksError },
      { data: handicaps, error: handicapsError },
      { data: meta, error: metaError },
    ] = await Promise.all([
      supabaseAdmin.from("draft_picks").select("entrant_name, golfer").eq("pool_id", poolId),
      supabaseAdmin.from("golfers").select("golfer, handicap, rank").eq("pool_id", poolId),
      supabaseAdmin
        .from("tournament_meta")
        .select("round_par")
        .eq("pool_id", poolId)
        .eq("tournament_slug", tournament)
        .maybeSingle<{ round_par: number | null }>(),
    ]);

    if (picksError) throw new Error(picksError.message);
    if (handicapsError) throw new Error(handicapsError.message);
    if (metaError) throw new Error(metaError.message);

    const roundPar = meta?.round_par ?? 72;

    const draftedBy = new Map<string, string[]>();
    for (const pick of picks ?? []) {
      const golfer = pick.golfer as string;
      for (const key of golferLookupKeys(golfer)) {
        const existing = draftedBy.get(key) ?? [];
        existing.push(pick.entrant_name as string);
        draftedBy.set(key, existing);
      }
    }

    const handicapByGolfer = new Map<string, { handicap: number; rank: number | null }>();
    for (const row of handicaps ?? []) {
      const handicapMeta = {
        handicap: Number(row.handicap ?? 0),
        rank: row.rank == null ? null : Number(row.rank),
      };
      for (const key of golferLookupKeys(String(row.golfer))) {
        handicapByGolfer.set(key, handicapMeta);
      }
    }

    let live: { rows: SlashLeaderboardRow[] };
    let source: string;
    let resolvedTournamentId: string | undefined;

    if (tournamentOver) {
      const { data: storedScores, error: scoresError } = await supabaseAdmin
        .from("tournament_round_scores")
        .select("golfer, round_number, strokes, score_status, position, position_text")
        .eq("pool_id", poolId)
        .eq("tournament_slug", tournament);
      if (scoresError) throw new Error(scoresError.message);
      live = buildStoredLeaderboard((storedScores ?? []) as StoredScoreRow[], roundPar);
      source = "stored";
    } else {
      const tournamentId = await resolveSlashTournamentId(apiKey!, tournament, year);
      if (!tournamentId) {
        return NextResponse.json(
          { ok: true, poolId, tournament, source: "unavailable", mode: "live-only-v2", rows: [] },
          { headers: { "Cache-Control": "no-store, max-age=0" } }
        );
      }
      resolvedTournamentId = tournamentId;
      live = await fetchSlashLeaderboard(apiKey!, tournamentId, year);
      source = "slash-live";
    }

    const liveRows = live.rows.map((row) => {
      const handicapMeta =
        handicapByGolfer.get(normalizeGolferName(row.golfer)) ?? { handicap: 0, rank: null };
      return {
        golfer: row.golfer,
        handicap: handicapMeta.handicap,
        rank: handicapMeta.rank,
        gross_total: row.total_strokes,
        live_total_to_par: row.total_to_par,
        live_current_round_score: row.current_round_score,
        live_thru: row.thru,
        position: row.position,
        position_text: row.position_text,
        drafted_by: draftedBy.get(normalizeGolferName(row.golfer)) ?? [],
        rounds: row.rounds.map((round) => ({
          round_number: round.round_number,
          strokes: round.strokes,
          score_status: round.score_status,
        })),
      };
    }).sort((a, b) => {
      const positionDiff =
        leaderboardPositionValue(a.position, a.position_text) -
        leaderboardPositionValue(b.position, b.position_text);
      if (positionDiff !== 0) return positionDiff;

      const aToPar = a.live_total_to_par ?? 9999;
      const bToPar = b.live_total_to_par ?? 9999;
      if (aToPar !== bToPar) return aToPar - bToPar;

      const thruDiff = thruSortValue(b.live_thru) - thruSortValue(a.live_thru);
      if (thruDiff !== 0) return thruDiff;

      return a.golfer.localeCompare(b.golfer);
    });

    return NextResponse.json(
      {
        ok: true,
        poolId,
        tournament,
        source,
        mode: "live-only-v2",
        ...(resolvedTournamentId ? { tournament_id: resolvedTournamentId } : {}),
        rows: liveRows,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(error, "Failed to calculate tournament leaderboard.") },
      { status: 500 }
    );
  }
}
