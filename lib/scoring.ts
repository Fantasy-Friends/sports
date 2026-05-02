import { supabaseAdmin } from "@/lib/supabaseAdmin";

const DEFAULT_ROUND_PAR = 72;

type DraftPickRow = {
  entrant_name: string;
  golfer: string;
};

type HandicapRow = {
  golfer: string;
  handicap: number | null;
  rank: number | null;
};

type RoundScoreRow = {
  golfer: string;
  round_number: number;
  strokes: number | null;
  score_status: string;
  position: number | null;
  position_text: string | null;
};

type TournamentMetaRow = {
  round_par: number | null;
};

type GolferScorecard = {
  golfer: string;
  handicap: number;
  rank: number | null;
  gross_total: number;
  net_total: number;
  rounds: Array<{
    round_number: number;
    strokes: number;
    score_status: string;
  }>;
  position: number | null;
  position_text: string | null;
};

export type PlayerLeaderboardRow = {
  entrant_name: string;
  team_total: number;
  scoring_golfers: GolferScorecard[];
  bench_golfers: GolferScorecard[];
  tie_break_5_position: number | null;
  tie_break_6_position: number | null;
};

export type TournamentLeaderboardRow = GolferScorecard & {
  drafted_by: string[];
};

function parseScoreStatus(value: string | null | undefined) {
  const normalized = (value ?? "played").trim().toLowerCase();
  if (["played", "cut", "wd", "dq", "dns"].includes(normalized)) {
    return normalized;
  }
  return "played";
}

function positionSortValue(position: number | null) {
  return position ?? 9999;
}

function displayPositionSortValue(position: number | null, positionText: string | null) {
  if (position !== null) return position;
  if (positionText) {
    const match = positionText.match(/\d+/);
    if (match) {
      const parsed = Number(match[0]);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return 9999;
}

function scoreStatusPenalty(status: string, roundPar: number, fieldWorst: number) {
  if (status === "wd" || status === "dq" || status === "dns") {
    return roundPar + 8;
  }
  if (status === "cut") {
    return fieldWorst;
  }
  return fieldWorst;
}

async function loadPoolData(poolId: string, tournament: string) {
  const [{ data: picks, error: picksError }, { data: handicaps, error: handicapsError }, { data: scores, error: scoresError }, { data: meta, error: metaError }] =
    await Promise.all([
      supabaseAdmin
        .from("draft_picks")
        .select("entrant_name, golfer")
        .eq("pool_id", poolId)
        .order("entrant_name", { ascending: true })
        .order("pick_number", { ascending: true }),
      supabaseAdmin
        .from("golfers")
        .select("golfer, handicap, rank")
        .eq("pool_id", poolId),
      supabaseAdmin
        .from("tournament_round_scores")
        .select("golfer, round_number, strokes, score_status, position, position_text")
        .eq("pool_id", poolId)
        .eq("tournament_slug", tournament)
        .order("round_number", { ascending: true })
        .order("golfer", { ascending: true }),
      supabaseAdmin
        .from("tournament_meta")
        .select("round_par")
        .eq("pool_id", poolId)
        .eq("tournament_slug", tournament)
        .maybeSingle<TournamentMetaRow>(),
    ]);

  if (picksError) throw new Error(picksError.message);
  if (handicapsError) throw new Error(handicapsError.message);
  if (scoresError) throw new Error(scoresError.message);
  if (metaError) throw new Error(metaError.message);

  return {
    picks: (picks ?? []) as DraftPickRow[],
    handicaps: (handicaps ?? []) as HandicapRow[],
    scores: (scores ?? []) as RoundScoreRow[],
    roundPar: meta?.round_par ?? DEFAULT_ROUND_PAR,
  };
}

function buildGolferScorecards(
  handicaps: HandicapRow[],
  scores: RoundScoreRow[],
  roundPar: number
) {
  const handicapByGolfer = new Map(
    handicaps.map((row) => [
      row.golfer,
      {
        handicap: row.handicap ?? 0,
        rank: row.rank,
      },
    ])
  );

  const startedRounds = Array.from(
    new Set(
      scores
        .filter((row) => row.strokes !== null || parseScoreStatus(row.score_status) !== "played")
        .map((row) => row.round_number)
    )
  ).sort((a, b) => a - b);

  const fieldWorstByRound = new Map<number, number>();
  for (const round of startedRounds) {
    const playedScores = scores
      .filter((row) => row.round_number === round && parseScoreStatus(row.score_status) === "played")
      .map((row) => row.strokes ?? 0);
    fieldWorstByRound.set(
      round,
      playedScores.length > 0 ? Math.max(...playedScores) : roundPar + 10
    );
  }

  const byGolfer = new Map<string, RoundScoreRow[]>();
  for (const row of scores) {
    const rows = byGolfer.get(row.golfer) ?? [];
    rows.push(row);
    byGolfer.set(row.golfer, rows);
  }

  const allGolfers = new Set<string>([
    ...handicaps.map((row) => row.golfer),
    ...scores.map((row) => row.golfer),
  ]);

  const scorecards = new Map<string, GolferScorecard>();
  for (const golfer of allGolfers) {
    const handicapMeta = handicapByGolfer.get(golfer) ?? { handicap: 0, rank: null };
    const rows = byGolfer.get(golfer) ?? [];

    const rounds = startedRounds.map((roundNumber) => {
      const row = rows.find((item) => item.round_number === roundNumber);
      const scoreStatus = parseScoreStatus(row?.score_status);
      const fieldWorst = fieldWorstByRound.get(roundNumber) ?? roundPar + 10;
      const hasRecordedStrokes = row?.strokes !== null && row?.strokes !== undefined;
      const strokes = hasRecordedStrokes
        ? row!.strokes!
        : row
          ? scoreStatusPenalty(scoreStatus, roundPar, fieldWorst)
          : fieldWorst;

      return {
        round_number: roundNumber,
        strokes,
        score_status: scoreStatus,
      };
    });

    const positionRow = rows.find((row) => row.position !== null || row.position_text !== null);
    const grossTotal = rounds.reduce((sum, round) => sum + round.strokes, 0);

    scorecards.set(golfer, {
      golfer,
      handicap: handicapMeta.handicap,
      rank: handicapMeta.rank,
      gross_total: grossTotal,
      net_total: grossTotal - handicapMeta.handicap,
      rounds,
      position: positionRow?.position ?? null,
      position_text: positionRow?.position_text ?? null,
    });
  }

  return scorecards;
}

export async function calculatePlayerLeaderboard(poolId: string, tournament: string) {
  const { picks, handicaps, scores, roundPar } = await loadPoolData(poolId, tournament);
  const scorecards = buildGolferScorecards(handicaps, scores, roundPar);

  const picksByEntrant = new Map<string, string[]>();
  for (const pick of picks) {
    const existing = picksByEntrant.get(pick.entrant_name) ?? [];
    existing.push(pick.golfer);
    picksByEntrant.set(pick.entrant_name, existing);
  }

  const rows: PlayerLeaderboardRow[] = Array.from(picksByEntrant.entries()).map(([entrantName, golfers]) => {
    const cards = golfers
      .map((golfer) => scorecards.get(golfer))
      .filter((card): card is GolferScorecard => Boolean(card))
      .sort((a, b) => {
        if (a.net_total !== b.net_total) return a.net_total - b.net_total;
        return (
          displayPositionSortValue(a.position, a.position_text) -
          displayPositionSortValue(b.position, b.position_text)
        );
      });

    const scoringGolfers = cards.slice(0, 4);
    const benchGolfers = cards.slice(4);
    const teamTotal = scoringGolfers.reduce((sum, golfer) => sum + golfer.net_total, 0);

    return {
      entrant_name: entrantName,
      team_total: teamTotal,
      scoring_golfers: scoringGolfers,
      bench_golfers: benchGolfers,
      tie_break_5_position: benchGolfers[0]?.position ?? null,
      tie_break_6_position: benchGolfers[1]?.position ?? null,
    };
  });

  return rows.sort((a, b) => {
    if (a.team_total !== b.team_total) return a.team_total - b.team_total;
    if (positionSortValue(a.tie_break_5_position) !== positionSortValue(b.tie_break_5_position)) {
      return positionSortValue(a.tie_break_5_position) - positionSortValue(b.tie_break_5_position);
    }
    return positionSortValue(a.tie_break_6_position) - positionSortValue(b.tie_break_6_position);
  });
}

export async function calculateTournamentLeaderboard(poolId: string, tournament: string) {
  const { picks, handicaps, scores, roundPar } = await loadPoolData(poolId, tournament);
  const scorecards = buildGolferScorecards(handicaps, scores, roundPar);

  const draftedBy = new Map<string, string[]>();
  for (const pick of picks) {
    const existing = draftedBy.get(pick.golfer) ?? [];
    existing.push(pick.entrant_name);
    draftedBy.set(pick.golfer, existing);
  }

  const rows: TournamentLeaderboardRow[] = Array.from(scorecards.values()).map((card) => ({
    ...card,
    drafted_by: draftedBy.get(card.golfer) ?? [],
  }));

  return rows.sort((a, b) => {
    const aPos = displayPositionSortValue(a.position, a.position_text);
    const bPos = displayPositionSortValue(b.position, b.position_text);
    if (aPos !== bPos) {
      return aPos - bPos;
    }
    if (a.net_total !== b.net_total) return a.net_total - b.net_total;
    return a.golfer.localeCompare(b.golfer);
  });
}
