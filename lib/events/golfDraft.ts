import { supabaseAdmin } from "@/lib/supabase";
import {
  fetchSlashLeaderboard,
  golferLookupKeys,
  normalizeGolferName,
  resolveSlashTournamentId,
} from "@/lib/slashGolf";
import { awardPointsFromScores } from "@/lib/scoring/awardPoints";
import type {
  BonusCandidate,
  EventRow,
  EventTypeHandler,
  FinishRanking,
} from "./types";

// Golf events keep their existing data in the legacy pool_id-keyed tables
// (draft_picks, golfers, etc.). This handler uses the live Slash Golf API
// (same source as /api/leaderboards/player) to compute finishes, ensuring
// the finalized results match exactly what players see on the leaderboard.

type GolfConfig = {
  tournament_slug?: string;
  round_par?: number;
};

function resolveLegacyKey(event: EventRow): { poolId: string; tournament: string } | null {
  if (!event.legacy_pool_id) return null;
  const config = (event.config ?? {}) as GolfConfig;
  const tournament = config.tournament_slug ?? event.slug.replace(/^\d+-/, "");
  return { poolId: event.legacy_pool_id, tournament };
}

/**
 * Builds a map of pool entrant_name -> canonical season_member entrant_id
 * by matching directly on display_name (case-insensitive trim).
 */
async function buildCanonicalByName(
  seasonId: string,
): Promise<Map<string, string>> {
  const { data: seasonMembers } = await supabaseAdmin
    .from("season_members")
    .select("entrant_id, display_name")
    .eq("season_id", seasonId);

  const result = new Map<string, string>();
  for (const m of seasonMembers ?? []) {
    result.set((m.display_name as string).trim().toLowerCase(), m.entrant_id as string);
  }
  return result;
}

type LiveGolferData = {
  net_to_par: number | null;
  total_strokes: number | null;
  made_cut: boolean;
  position: number | null;
  golfer_name: string;
};

/**
 * Fetches the Slash Golf leaderboard and returns per-golfer data using the
 * same net-to-par formula as /api/leaderboards/player, including cut/WD
 * penalties for rounds the golfer didn't play.
 */
async function fetchLiveGolferData(
  poolId: string,
  tournament: string,
  year: string,
): Promise<{ liveByGolfer: Map<string, LiveGolferData>; champion: string | null }> {
  const apiKey = process.env.SLASH_GOLF_API_KEY || process.env.RAPIDAPI_KEY;
  if (!apiKey) {
    throw new Error("Missing SLASH_GOLF_API_KEY; cannot finalize golf-draft event via live API");
  }

  const tournamentId = await resolveSlashTournamentId(apiKey, tournament, year);
  if (!tournamentId) {
    throw new Error(`Could not resolve Slash Golf tournament ID for "${tournament}"`);
  }

  const [live, handicapRes, metaRes] = await Promise.all([
    fetchSlashLeaderboard(apiKey, tournamentId, year),
    supabaseAdmin.from("golfers").select("golfer, handicap").eq("pool_id", poolId),
    supabaseAdmin
      .from("tournament_meta")
      .select("round_par")
      .eq("pool_id", poolId)
      .eq("tournament_slug", tournament)
      .maybeSingle<{ round_par: number | null }>(),
  ]);

  const roundPar = metaRes.data?.round_par ?? 72;

  const handicapByGolfer = new Map<string, number>();
  for (const row of handicapRes.data ?? []) {
    for (const key of golferLookupKeys(String(row.golfer))) {
      handicapByGolfer.set(key, Number(row.handicap ?? 0));
    }
  }

  // Field-worst strokes per started round (for cut/WD penalties)
  const startedRoundNums = Array.from(
    new Set(live.rows.flatMap((r) => r.rounds.map((round) => round.round_number)))
  ).sort((a, b) => a - b);

  const fieldWorstByRound = new Map<number, number>();
  for (const roundNum of startedRoundNums) {
    const strokes = live.rows
      .flatMap((r) => r.rounds)
      .filter((r) => r.round_number === roundNum && r.strokes !== null)
      .map((r) => r.strokes as number);
    fieldWorstByRound.set(roundNum, strokes.length > 0 ? Math.max(...strokes) : roundPar + 10);
  }

  const liveByGolfer = new Map<string, LiveGolferData>();
  let champion: string | null = null;

  for (const row of live.rows) {
    const handicap = handicapByGolfer.get(normalizeGolferName(row.golfer)) ?? 0;
    const playerStatus = row.rounds[0]?.score_status ?? "played";
    const madeCut = playerStatus === "played";

    // Apply cut/WD penalty strokes (to-par) for rounds the player didn't play
    let grossToPar = row.total_to_par;
    if (grossToPar !== null && !madeCut) {
      const playedRoundNums = new Set(row.rounds.map((r) => r.round_number));
      for (const roundNum of startedRoundNums) {
        if (!playedRoundNums.has(roundNum)) {
          if (playerStatus === "wd") {
            grossToPar += 8;
          } else {
            const fieldWorst = fieldWorstByRound.get(roundNum) ?? roundPar + 10;
            grossToPar += fieldWorst - roundPar;
          }
        }
      }
    }

    const netToPar = grossToPar !== null ? grossToPar - handicap : null;

    if (row.position === 1 && !champion) {
      champion = row.golfer;
    }

    const value: LiveGolferData = {
      net_to_par: netToPar,
      total_strokes: row.total_strokes,
      made_cut: madeCut,
      position: row.position,
      golfer_name: row.golfer,
    };

    for (const key of golferLookupKeys(row.golfer)) {
      liveByGolfer.set(key, value);
    }
  }

  return { liveByGolfer, champion };
}

export const golfDraftHandler: EventTypeHandler = {
  kind: "golf-draft",
  label: "Golf — Draft 6, Score Best 4",

  validateEntry() {
    // Entries for golf events come through the existing draft flow, not
    // through /events/[slug]/entry. Nothing to validate here.
    return { ok: true };
  },

  async computeFinishes({ event }) {
    const legacy = resolveLegacyKey(event);
    if (!legacy) {
      throw new Error(
        `golf-draft event ${event.slug} has no legacy_pool_id; cannot compute finishes`,
      );
    }

    const year = String(new Date().getFullYear());
    const { liveByGolfer } = await fetchLiveGolferData(legacy.poolId, legacy.tournament, year);

    const { data: picks, error: picksError } = await supabaseAdmin
      .from("draft_picks")
      .select("entrant_name, golfer, pick_number")
      .eq("pool_id", legacy.poolId)
      .order("pick_number", { ascending: true });
    if (picksError) throw new Error(picksError.message);

    // Group picks by entrant
    const picksByEntrant = new Map<string, string[]>();
    for (const pick of picks ?? []) {
      const list = picksByEntrant.get(pick.entrant_name as string) ?? [];
      list.push(pick.golfer as string);
      picksByEntrant.set(pick.entrant_name as string, list);
    }

    // Compute team totals using same formula as /api/leaderboards/player
    const teamRows = Array.from(picksByEntrant.entries()).map(([name, golfers]) => {
      const scorecards = golfers
        .map((g) => {
          const data = liveByGolfer.get(normalizeGolferName(g));
          return { golfer: g, net_to_par: data?.net_to_par ?? null, position: data?.position ?? null };
        })
        .sort((a, b) => (a.net_to_par ?? 9999) - (b.net_to_par ?? 9999));

      const scoring = scorecards.slice(0, 4);
      const bench = scorecards.slice(4);
      const teamTotal = scoring.reduce((sum, g) => sum + (g.net_to_par ?? 0), 0);

      return {
        entrant_name: name,
        team_total: teamTotal,
        tie_break_5_position: bench[0]?.position ?? null,
      };
    });

    teamRows.sort((a, b) => {
      if (a.team_total !== b.team_total) return a.team_total - b.team_total;
      return (a.tie_break_5_position ?? 9999) - (b.tie_break_5_position ?? 9999);
    });

    // Map entrant names to canonical season_member IDs
    const canonicalByName = await buildCanonicalByName(event.season_id);
    const { data: poolEntrants, error: entrantError } = await supabaseAdmin
      .from("draft_entrants")
      .select("entrant_id, entrant_name")
      .eq("pool_id", legacy.poolId);
    if (entrantError) throw new Error(entrantError.message);

    const poolIdByName = new Map<string, string>();
    for (const row of poolEntrants ?? []) {
      poolIdByName.set((row.entrant_name as string).trim().toLowerCase(), row.entrant_id as string);
    }

    const scores = teamRows
      .map((row) => {
        const key = row.entrant_name.trim().toLowerCase();
        const canonicalId = canonicalByName.get(key) ?? null;
        const entrantId = canonicalId ?? poolIdByName.get(key);
        if (!entrantId) return null;
        return {
          entrant_id: entrantId,
          raw_score: row.team_total,
          tie_break_notes: row.tie_break_5_position !== null
            ? `5th-golfer pos ${row.tie_break_5_position}`
            : undefined,
        };
      })
      .filter((s): s is NonNullable<typeof s> => Boolean(s));

    const awarded = await awardPointsFromScores(scores, event.tier);
    const finishes: FinishRanking[] = awarded.map((a) => ({
      entrant_id: a.entrant_id,
      finish_rank: a.finish_rank,
      raw_score: a.raw_score,
      base_points: a.base_points,
      awarded_points: a.awarded_points,
      tie_break_notes: a.tie_break_notes,
    }));
    return finishes;
  },

  async emitBonuses({ event, finishes }) {
    const legacy = resolveLegacyKey(event);
    if (!legacy) return [];

    const year = String(new Date().getFullYear());
    let liveData: { liveByGolfer: Map<string, LiveGolferData>; champion: string | null };
    try {
      liveData = await fetchLiveGolferData(legacy.poolId, legacy.tournament, year);
    } catch {
      // If live API is unavailable for bonuses, skip rather than fail finalize
      return [];
    }
    const { liveByGolfer, champion } = liveData;

    const { data: poolData } = await supabaseAdmin
      .from("draft_picks")
      .select("entrant_name, golfer")
      .eq("pool_id", legacy.poolId);

    const picksByEntrant = new Map<string, string[]>();
    for (const row of poolData ?? []) {
      const list = picksByEntrant.get(row.entrant_name as string) ?? [];
      list.push(row.golfer as string);
      picksByEntrant.set(row.entrant_name as string, list);
    }

    const canonicalByName = await buildCanonicalByName(event.season_id);
    const { data: poolEntrants } = await supabaseAdmin
      .from("draft_entrants")
      .select("entrant_id, entrant_name")
      .eq("pool_id", legacy.poolId);

    const entrantIdByName = new Map<string, string>();
    for (const row of poolEntrants ?? []) {
      const canonical = canonicalByName.get((row.entrant_name as string).trim().toLowerCase()) ?? null;
      entrantIdByName.set((row.entrant_name as string).trim().toLowerCase(), canonical ?? row.entrant_id as string);
    }

    const candidates: BonusCandidate[] = [];

    // Survivor (+6): all 6 golfers made the cut; lowest combined gross total.
    let survivorWinner: { entrant_id: string; total: number } | null = null;
    for (const [name, golfers] of picksByEntrant.entries()) {
      const allMadeCut = golfers.every((g) => {
        const data = liveByGolfer.get(normalizeGolferName(g));
        return data ? data.made_cut : true; // unknown golfers assumed made cut
      });
      if (!allMadeCut) continue;

      const total = golfers.reduce((sum, g) => {
        const data = liveByGolfer.get(normalizeGolferName(g));
        return sum + (data?.total_strokes ?? 0);
      }, 0);

      const entrantId = entrantIdByName.get(name.trim().toLowerCase());
      if (!entrantId) continue;
      if (!survivorWinner || total < survivorWinner.total) {
        survivorWinner = { entrant_id: entrantId, total };
      }
    }
    if (survivorWinner) {
      candidates.push({
        entrant_id: survivorWinner.entrant_id,
        bonus_type: "survivor",
        points: 6,
        note: `Lowest 6-golfer gross total ${survivorWinner.total} (all made the cut)`,
      });
    }

    // Golden Ticket (+4): drafted the actual tournament champion.
    if (champion) {
      for (const [name, golfers] of picksByEntrant.entries()) {
        const pickedChampion = golfers.some(
          (g) => normalizeGolferName(g) === normalizeGolferName(champion!)
        );
        if (!pickedChampion) continue;
        const entrantId = entrantIdByName.get(name.trim().toLowerCase());
        if (!entrantId) continue;
        candidates.push({
          entrant_id: entrantId,
          bonus_type: "golden_ticket",
          points: 4,
          note: `Drafted tournament champion ${champion}`,
        });
      }
    }

    void finishes;

    return candidates;
  },

  getEntryUI() {
    return "golf-draft-room";
  },

  getLeaderboardUI() {
    return "golf-draft";
  },
};
