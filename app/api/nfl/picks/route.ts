import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthenticatedEntrant } from "@/lib/draftAuth";
import { getErrorMessage } from "@/lib/error";
import { currentNflSeason, fetchNflWeek } from "@/lib/nfl";
import {
  canonicalEntrantId,
  decimalFor,
  seasonDisplayNames,
  type PickRow,
} from "@/lib/nflPickem";

export const revalidate = 0;

const PICK_COLUMNS =
  "season, week, entrant_id, game_id, picked_team, confidence, is_bet, bet_decimal, parlay_group";

// GET ?week=N → your picks for the week, plus everyone's picks for games
// that have kicked off (pre-kickoff picks stay hidden so nobody can copy).
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedEntrant();
    if (!auth) return NextResponse.json({ error: "auth required" }, { status: 401 });

    const week = Number(request.nextUrl.searchParams.get("week"));
    if (!Number.isInteger(week) || week < 1 || week > 18) {
      return NextResponse.json({ error: "week must be 1-18" }, { status: 400 });
    }

    const me = await canonicalEntrantId(auth.entrant.entrant_id, auth.entrant.entrant_name);
    const season = currentNflSeason();
    const [{ data: rows }, schedule, names] = await Promise.all([
      supabaseAdmin
        .from("nfl_pickem_picks")
        .select(PICK_COLUMNS)
        .eq("season", season)
        .eq("week", week),
      fetchNflWeek(week),
      seasonDisplayNames(),
    ]);

    const lockedGames = new Set(schedule.games.filter((g) => g.locked).map((g) => g.game_id));
    const mine: PickRow[] = [];
    const revealed: Array<PickRow & { display_name: string }> = [];
    for (const row of (rows ?? []) as PickRow[]) {
      if (row.entrant_id === me) mine.push(row);
      else if (lockedGames.has(row.game_id)) {
        revealed.push({ ...row, display_name: names.get(row.entrant_id) ?? "Player" });
      }
    }

    return NextResponse.json({ season, week, me, mine, revealed });
  } catch (err) {
    return NextResponse.json(
      { error: getErrorMessage(err, "Failed to load picks") },
      { status: 500 },
    );
  }
}

// POST { week, picks: [{ game_id, picked_team, confidence, is_bet, parlay }] }
// Replaces your picks for the week's UNLOCKED games. Locked-game picks (and
// their bet/parlay flags + snapshotted odds) are immutable. Bets and parlay
// legs snapshot the picked team's decimal moneyline server-side at save time.
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedEntrant();
    if (!auth) return NextResponse.json({ error: "auth required" }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as {
      week?: number;
      picks?: Array<{
        game_id?: string;
        picked_team?: string;
        confidence?: number;
        is_bet?: boolean;
        parlay?: boolean;
      }>;
    };
    const week = Number(body.week);
    if (!Number.isInteger(week) || week < 1 || week > 18) {
      return NextResponse.json({ error: "week must be 1-18" }, { status: 400 });
    }
    const submitted = Array.isArray(body.picks) ? body.picks : [];

    const schedule = await fetchNflWeek(week);
    const gameById = new Map(schedule.games.map((g) => [g.game_id, g]));
    const maxConfidence = schedule.game_count;

    const me = await canonicalEntrantId(auth.entrant.entrant_id, auth.entrant.entrant_name);
    const season = currentNflSeason();

    // Existing picks on locked games are kept; their confidences and parlay
    // legs stay reserved.
    const { data: existingRows } = await supabaseAdmin
      .from("nfl_pickem_picks")
      .select(PICK_COLUMNS)
      .eq("season", season)
      .eq("week", week)
      .eq("entrant_id", me);
    const lockedExisting = ((existingRows ?? []) as PickRow[]).filter(
      (r) => gameById.get(r.game_id)?.locked,
    );
    const reservedConfidence = new Set(lockedExisting.map((r) => r.confidence));
    const lockedGameIds = new Set(lockedExisting.map((r) => r.game_id));
    const lockedParlayLegs = lockedExisting.filter((r) => r.parlay_group !== null).length;

    // Validate the submitted set.
    const clean: PickRow[] = [];
    const usedConfidence = new Set<number>();
    const usedGames = new Set<string>();
    let parlayLegs = lockedParlayLegs;
    for (const p of submitted) {
      const gameId = String(p.game_id ?? "");
      const team = String(p.picked_team ?? "");
      const confidence = Number(p.confidence);
      const isBet = p.is_bet === true;
      const isParlay = p.parlay === true;
      const game = gameById.get(gameId);
      if (!game) return NextResponse.json({ error: `unknown game ${gameId}` }, { status: 400 });
      if (game.locked || lockedGameIds.has(gameId)) {
        return NextResponse.json(
          { error: `${game.away.abbr} @ ${game.home.abbr} has kicked off — that pick is locked` },
          { status: 409 },
        );
      }
      if (team !== game.home.abbr && team !== game.away.abbr) {
        return NextResponse.json({ error: `invalid team ${team} for ${gameId}` }, { status: 400 });
      }
      if (!Number.isInteger(confidence) || confidence < 1 || confidence > maxConfidence) {
        return NextResponse.json(
          { error: `confidence must be 1-${maxConfidence} this week` },
          { status: 400 },
        );
      }
      if (usedConfidence.has(confidence) || reservedConfidence.has(confidence)) {
        return NextResponse.json(
          { error: `confidence ${confidence} used more than once` },
          { status: 400 },
        );
      }
      if (usedGames.has(gameId)) {
        return NextResponse.json({ error: `duplicate pick for ${gameId}` }, { status: 400 });
      }

      // Bets and parlay legs snapshot the payout decimal (real ML, or the
      // fair spread-derived odds when no ML is posted yet).
      let betDecimal: number | null = null;
      if (isBet || isParlay) {
        const dec = decimalFor(game, team);
        if (dec === null) {
          return NextResponse.json(
            { error: `no line available to bet on ${team} yet` },
            { status: 400 },
          );
        }
        betDecimal = Number(dec.toFixed(4));
      }
      if (isParlay) parlayLegs += 1;

      usedConfidence.add(confidence);
      usedGames.add(gameId);
      clean.push({
        season,
        week,
        entrant_id: me,
        game_id: gameId,
        picked_team: team,
        confidence,
        is_bet: isBet && !isParlay, // a parlay leg scores only via the parlay
        bet_decimal: betDecimal,
        parlay_group: isParlay ? 1 : null,
      });
    }

    if (parlayLegs === 1) {
      return NextResponse.json({ error: "a parlay needs 2-3 legs" }, { status: 400 });
    }
    if (parlayLegs > 3) {
      return NextResponse.json({ error: "parlays are capped at 3 legs" }, { status: 400 });
    }

    // Replace unlocked picks: delete mine for this week except locked games,
    // then insert the validated set.
    let del = supabaseAdmin
      .from("nfl_pickem_picks")
      .delete()
      .eq("season", season)
      .eq("week", week)
      .eq("entrant_id", me);
    if (lockedGameIds.size > 0) {
      del = del.not("game_id", "in", `(${[...lockedGameIds].map((g) => `"${g}"`).join(",")})`);
    }
    const { error: delErr } = await del;
    if (delErr) throw new Error(delErr.message);

    if (clean.length > 0) {
      const { error: insErr } = await supabaseAdmin.from("nfl_pickem_picks").insert(clean);
      if (insErr) throw new Error(insErr.message);
    }

    return NextResponse.json({ ok: true, saved: clean.length, kept_locked: lockedExisting.length });
  } catch (err) {
    return NextResponse.json(
      { error: getErrorMessage(err, "Failed to save picks") },
      { status: 500 },
    );
  }
}
