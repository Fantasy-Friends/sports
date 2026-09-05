import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthenticatedEntrant } from "@/lib/draftAuth";
import { getErrorMessage } from "@/lib/error";
import { currentNflSeason, fetchNflWeek } from "@/lib/nfl";

export const revalidate = 0;

type PickRow = {
  season: number;
  week: number;
  entrant_id: string;
  game_id: string;
  picked_team: string;
  confidence: number;
};

// The same person has a different entrant_id per pool; season_members holds
// the canonical id. Resolve by display name (the same bridge golfDraft uses)
// so picks land on one identity no matter which pool session you're in.
async function canonicalEntrantId(entrantId: string, entrantName: string): Promise<string> {
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

async function displayNames(): Promise<Map<string, string>> {
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
        .select("season, week, entrant_id, game_id, picked_team, confidence")
        .eq("season", season)
        .eq("week", week),
      fetchNflWeek(week),
      displayNames(),
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

// POST { week, picks: [{ game_id, picked_team, confidence }] } — replaces your
// picks for the week's UNLOCKED games. Locked-game picks are immutable.
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedEntrant();
    if (!auth) return NextResponse.json({ error: "auth required" }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as {
      week?: number;
      picks?: Array<{ game_id?: string; picked_team?: string; confidence?: number }>;
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

    // Existing picks on locked games are kept and their confidences reserved.
    const { data: existingRows } = await supabaseAdmin
      .from("nfl_pickem_picks")
      .select("game_id, picked_team, confidence")
      .eq("season", season)
      .eq("week", week)
      .eq("entrant_id", me);
    const lockedExisting = ((existingRows ?? []) as Array<{ game_id: string; confidence: number }>)
      .filter((r) => gameById.get(r.game_id)?.locked);
    const reservedConfidence = new Set(lockedExisting.map((r) => r.confidence));
    const lockedGameIds = new Set(lockedExisting.map((r) => r.game_id));

    // Validate the submitted set.
    const clean: PickRow[] = [];
    const usedConfidence = new Set<number>();
    const usedGames = new Set<string>();
    for (const p of submitted) {
      const gameId = String(p.game_id ?? "");
      const team = String(p.picked_team ?? "");
      const confidence = Number(p.confidence);
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
      usedConfidence.add(confidence);
      usedGames.add(gameId);
      clean.push({ season, week, entrant_id: me, game_id: gameId, picked_team: team, confidence });
    }

    // Replace unlocked picks: delete mine for this week except locked games,
    // then insert the validated set (fully validated above, so the window
    // between delete and insert only risks a re-submit, not bad data).
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
