import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { currentNflSeason, type NflGame } from "@/lib/nfl";

// ─── Shared types ───────────────────────────────────────────────────────────

export type PickRow = {
  season: number;
  week: number;
  entrant_id: string;
  game_id: string;
  picked_team: string;
  confidence: number;
  is_bet: boolean;
  bet_decimal: number | null;
  parlay_group: number | null;
};

// ─── Odds ───────────────────────────────────────────────────────────────────

export function americanToDecimal(ml: number): number {
  return ml > 0 ? 1 + ml / 100 : 1 + 100 / -ml;
}

export function moneylineFor(game: NflGame, team: string): number | null {
  if (!game.odds) return null;
  if (team === game.home.abbr) return game.odds.home_ml;
  if (team === game.away.abbr) return game.odds.away_ml;
  return null;
}

// ─── Identity (same person = different entrant_id per pool; season_members
//     holds the canonical id — resolve by display name, the golfDraft bridge) ─

export async function canonicalEntrantId(entrantId: string, entrantName: string): Promise<string> {
  const { data: season } = await supabaseAdmin
    .from("seasons")
    .select("season_id")
    .eq("year", currentNflSeason())
    .maybeSingle<{ season_id: string }>();
  if (!season) return entrantId;
  const { data: members } = await supabaseAdmin
    .from("season_members")
    .select("entrant_id, display_name")
    .eq("season_id", season.season_id);
  const match = (members ?? []).find(
    (m) => m.display_name.trim().toLowerCase() === entrantName.trim().toLowerCase(),
  );
  return match?.entrant_id ?? entrantId;
}

export async function seasonDisplayNames(): Promise<Map<string, string>> {
  const { data: season } = await supabaseAdmin
    .from("seasons")
    .select("season_id")
    .eq("year", currentNflSeason())
    .maybeSingle<{ season_id: string }>();
  const out = new Map<string, string>();
  if (!season) return out;
  const { data: members } = await supabaseAdmin
    .from("season_members")
    .select("entrant_id, display_name")
    .eq("season_id", season.season_id);
  for (const m of members ?? []) out.set(m.entrant_id, m.display_name);
  return out;
}

// ─── Scoring engine ─────────────────────────────────────────────────────────
// Pure function over the week's games + everyone's picks. Only FINAL games
// score. Rules:
//   straight pick: win → +confidence, loss → 0
//   bet:           win → round(confidence × bet_decimal), loss → -confidence
//   parlay:        stake = Σ leg confidences; every final leg must win; any
//                  final leg lost → -stake immediately (busted); ties PUSH
//                  (leg decimal drops to 1.0, doesn't bust); payout once all
//                  legs are final: round(stake × Π effective leg decimals)
//   Ties on straight picks and bets are pushes: 0 points either way.

export type LegOutcome = "pending" | "win" | "loss" | "push";

export type ScoredPick = PickRow & {
  outcome: LegOutcome;
  points: number; // contribution counted OUTSIDE the parlay (0 for parlay legs)
};

export type ParlaySummary = {
  legs: number;
  stake: number;
  combined_decimal: number; // product of snapshotted leg decimals (pushes → 1)
  status: "pending" | "won" | "busted";
  points: number;
};

export type PlayerWeekScore = {
  entrant_id: string;
  display_name: string;
  total: number;
  correct: number;
  finals_played: number; // this player's picks on final games
  straight_points: number;
  bet_points: number;
  parlay: ParlaySummary | null;
  picks: ScoredPick[];
};

function pickOutcome(game: NflGame | undefined, team: string): LegOutcome {
  if (!game || game.state !== "post") return "pending";
  if (game.home.winner) return team === game.home.abbr ? "win" : "loss";
  if (game.away.winner) return team === game.away.abbr ? "win" : "loss";
  return "push"; // final with no winner flag = tie
}

export function scoreWeek(
  games: NflGame[],
  picks: PickRow[],
  names: Map<string, string>,
): PlayerWeekScore[] {
  const gameById = new Map(games.map((g) => [g.game_id, g]));
  const byEntrant = new Map<string, PickRow[]>();
  for (const p of picks) {
    const arr = byEntrant.get(p.entrant_id) ?? [];
    arr.push(p);
    byEntrant.set(p.entrant_id, arr);
  }

  const out: PlayerWeekScore[] = [];
  for (const [entrantId, rows] of byEntrant) {
    let straightPoints = 0;
    let betPoints = 0;
    let correct = 0;
    let finalsPlayed = 0;
    const scored: ScoredPick[] = [];
    const parlayLegs: Array<{ row: PickRow; outcome: LegOutcome }> = [];

    for (const row of rows) {
      const outcome = pickOutcome(gameById.get(row.game_id), row.picked_team);
      if (outcome !== "pending") finalsPlayed += 1;
      if (outcome === "win") correct += 1;

      let points = 0;
      if (row.parlay_group !== null) {
        parlayLegs.push({ row, outcome });
      } else if (row.is_bet) {
        const dec = row.bet_decimal ?? 1;
        if (outcome === "win") points = Math.round(row.confidence * dec);
        else if (outcome === "loss") points = -row.confidence;
        betPoints += points;
      } else {
        if (outcome === "win") points = row.confidence;
        straightPoints += points;
      }
      scored.push({ ...row, outcome, points });
    }

    let parlay: ParlaySummary | null = null;
    if (parlayLegs.length > 0) {
      const stake = parlayLegs.reduce((s, l) => s + l.row.confidence, 0);
      // Pushed legs contribute 1.0; everything else its snapshotted decimal.
      const combined = parlayLegs.reduce(
        (prod, l) => prod * (l.outcome === "push" ? 1 : l.row.bet_decimal ?? 1),
        1,
      );
      const anyLoss = parlayLegs.some((l) => l.outcome === "loss");
      const allSettled = parlayLegs.every((l) => l.outcome !== "pending");
      const status: ParlaySummary["status"] = anyLoss ? "busted" : allSettled ? "won" : "pending";
      const points = status === "busted" ? -stake : status === "won" ? Math.round(stake * combined) : 0;
      parlay = { legs: parlayLegs.length, stake, combined_decimal: combined, status, points };
    }

    out.push({
      entrant_id: entrantId,
      display_name: names.get(entrantId) ?? "Player",
      total: straightPoints + betPoints + (parlay?.points ?? 0),
      correct,
      finals_played: finalsPlayed,
      straight_points: straightPoints,
      bet_points: betPoints,
      parlay,
      picks: scored,
    });
  }

  return out.sort((a, b) => b.total - a.total || a.display_name.localeCompare(b.display_name));
}
