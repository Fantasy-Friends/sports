// NFL schedule + Vegas odds via ESPN's public scoreboard API (no key needed):
//   https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard
//     ?seasontype=2&week=N&dates=YYYY
// The response shape is stable but everything here is parsed defensively —
// a missing odds block degrades to "no line yet", never a crash.

export type NflTeamSide = {
  abbr: string;
  name: string;
  logo: string | null;
  record: string | null;
  score: number | null;
  winner: boolean;
};

export type NflOdds = {
  details: string | null;      // e.g. "DAL -3.5"
  spread: number | null;       // home-relative: negative = home favored
  over_under: number | null;
  home_ml: number | null;      // American moneyline
  away_ml: number | null;
  provider: string | null;
};

export type NflGame = {
  game_id: string;
  kickoff: string;             // ISO
  state: "pre" | "in" | "post";
  status_detail: string;       // "Sun 12:00 PM", "Q3 4:12", "Final"
  locked: boolean;             // kickoff passed or game underway/over
  home: NflTeamSide;
  away: NflTeamSide;
  odds: NflOdds | null;
  home_win_prob: number | null; // 0..100, vig-removed
  away_win_prob: number | null;
};

export type NflWeek = {
  season: number;
  week: number;
  games: NflGame[];
  game_count: number;          // = the confidence scale max for the week
};

// NFL season year: Jan/Feb games belong to the prior season's playoffs.
export function currentNflSeason(now = new Date()): number {
  const y = now.getUTCFullYear();
  return now.getUTCMonth() >= 2 ? y : y - 1;
}

function impliedProb(ml: number): number {
  return ml < 0 ? -ml / (-ml + 100) : 100 / (ml + 100);
}

// Win probability for the home team from the odds. Moneylines first
// (vig-removed); fall back to a linear ~2.95%/point approximation from the
// spread; null when there's no line at all.
export function homeWinProbability(odds: NflOdds | null): number | null {
  if (!odds) return null;
  if (odds.home_ml !== null && odds.away_ml !== null) {
    const h = impliedProb(odds.home_ml);
    const a = impliedProb(odds.away_ml);
    if (h + a > 0) return Math.round((h / (h + a)) * 100);
  }
  if (odds.spread !== null) {
    const p = 0.5 - 0.0295 * odds.spread; // negative spread = home favored
    return Math.round(Math.min(0.95, Math.max(0.05, p)) * 100);
  }
  return null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function normalizeCompetitor(c: any): NflTeamSide {
  const team = c?.team ?? {};
  const records = Array.isArray(c?.records) ? c.records : [];
  return {
    abbr: String(team.abbreviation ?? "?"),
    name: String(team.displayName ?? team.name ?? "Unknown"),
    logo: typeof team.logo === "string" ? team.logo : null,
    record: typeof records[0]?.summary === "string" ? records[0].summary : null,
    score: num(c?.score),
    winner: c?.winner === true,
  };
}

function normalizeEvent(event: any, nowMs: number): NflGame | null {
  const comp = event?.competitions?.[0];
  if (!comp || !event?.id) return null;
  const competitors = Array.isArray(comp.competitors) ? comp.competitors : [];
  const homeRaw = competitors.find((c: any) => c?.homeAway === "home");
  const awayRaw = competitors.find((c: any) => c?.homeAway === "away");
  if (!homeRaw || !awayRaw) return null;

  const stateRaw = event?.status?.type?.state;
  const state: NflGame["state"] = stateRaw === "in" ? "in" : stateRaw === "post" ? "post" : "pre";
  const kickoff = typeof event.date === "string" ? event.date : new Date(nowMs).toISOString();
  const kickoffMs = new Date(kickoff).getTime();

  const oddsRaw = Array.isArray(comp.odds) ? comp.odds[0] : null;
  const odds: NflOdds | null = oddsRaw
    ? {
        details: typeof oddsRaw.details === "string" ? oddsRaw.details : null,
        spread: num(oddsRaw.spread),
        over_under: num(oddsRaw.overUnder),
        home_ml: num(oddsRaw.homeTeamOdds?.moneyLine),
        away_ml: num(oddsRaw.awayTeamOdds?.moneyLine),
        provider: typeof oddsRaw.provider?.name === "string" ? oddsRaw.provider.name : null,
      }
    : null;

  const homeProb = homeWinProbability(odds);

  return {
    game_id: String(event.id),
    kickoff,
    state,
    status_detail: String(event?.status?.type?.shortDetail ?? ""),
    locked: state !== "pre" || (Number.isFinite(kickoffMs) && kickoffMs <= nowMs),
    home: normalizeCompetitor(homeRaw),
    away: normalizeCompetitor(awayRaw),
    odds,
    home_win_prob: homeProb,
    away_win_prob: homeProb === null ? null : 100 - homeProb,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// 5-minute in-memory cache per week — plenty fresh for lines, and keeps
// polling from hammering ESPN.
const cache = new Map<string, { at: number; data: NflWeek }>();
const CACHE_TTL_MS = 5 * 60_000;

export async function fetchNflWeek(week?: number, season?: number): Promise<NflWeek> {
  const seasonYear = season ?? currentNflSeason();
  const key = `${seasonYear}:${week ?? "current"}`;
  const hit = cache.get(key);
  const nowMs = Date.now();
  if (hit && nowMs - hit.at < CACHE_TTL_MS) return hit.data;

  const params = new URLSearchParams({ seasontype: "2", dates: String(seasonYear) });
  if (week) params.set("week", String(week));
  const res = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?${params}`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error(`ESPN scoreboard returned ${res.status}`);
  const json = (await res.json()) as {
    week?: { number?: number };
    events?: unknown[];
  };

  const games = (json.events ?? [])
    .map((e) => normalizeEvent(e, nowMs))
    .filter((g): g is NflGame => g !== null)
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff) || a.game_id.localeCompare(b.game_id));

  const data: NflWeek = {
    season: seasonYear,
    week: week ?? json.week?.number ?? 1,
    games,
    game_count: games.length,
  };
  cache.set(key, { at: nowMs, data });
  // Also cache under the resolved week number so "current" and explicit
  // requests share entries.
  cache.set(`${seasonYear}:${data.week}`, { at: nowMs, data });
  return data;
}
