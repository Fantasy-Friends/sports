import { getErrorMessage } from "@/lib/error";

type SlashScheduleRow = {
  tournId?: number;
  tournamentId?: number;
  year?: number;
  name?: string;
  tournName?: string;
  startDate?: string;
  endDate?: string;
  date?: { start?: string; end?: string };
  course?: string;
  venue?: string;
  status?: string;
};

type SlashLeaderboardPlayer = {
  firstName?: string;
  lastName?: string;
  playerName?: string;
  name?: string;
  position?: number | string | null;
  pos?: number | string | null;
  positionText?: string | null;
  thru?: string | number | null;
  total?: number | string | null;
  totalStrokes?: number | string | null;
  totalStrokesFromCompletedRounds?: number | string | null;
  status?: string | null;
  currentRoundScore?: number | string | null;
  rounds?: Array<{ roundId?: number; round?: number; score?: number | string | null; strokes?: number | string | null }>;
  scorecards?: Array<{ roundId?: number; round?: number; score?: number | string | null; strokes?: number | string | null }>;
};

export type SlashTournament = {
  tournId: number;
  year: number | null;
  name: string;
  startDate: string | null;
  endDate: string | null;
  venue: string | null;
  status: string | null;
};

export type SlashLeaderboardRow = {
  golfer: string;
  position: number | null;
  position_text: string | null;
  total_to_par: number | null;
  total_strokes: number | null;
  thru: string | null;
  current_round_score: number | null;
  rounds: Array<{
    round_number: number;
    strokes: number | null;
    score_status: "played" | "cut" | "wd";
  }>;
};

const TOURNAMENT_NAME_MATCHERS: Record<string, string[]> = {
  masters: ["masters tournament", "the masters", "masters"],
  "pga-championship": ["pga championship"],
  "us-open": ["u.s. open", "us open"],
  "the-open": ["the open championship", "the open"],
};

const GOLFER_NAME_ALIASES: Record<string, string> = {
  "nicolai hojgaard": "nicolai hojgaard",
  "rasmus hojgaard": "rasmus hojgaard",
  "ludvig aberg": "ludvig aberg",
  "maverick mcnealy": "maverick mcnealy",
  "matt fitzpatrick": "matthew fitzpatrick",
  "chris gotterup": "christopher gotterup",
  "alex noren": "alexander noren",
};

const DEFAULT_HOSTS = ["live-golf-data.p.rapidapi.com"];

// Per-request fetch timeout. Keeps a slow/hung Slash response from blocking
// the route until the Vercel function timeout fires.
const FETCH_TIMEOUT_MS = 6000;

// In-memory cache for resolved tournament IDs. The ID for a given slug+year
// never changes mid-season, so one successful lookup covers the whole event.
const tournamentIdCache = new Map<string, { id: string; fetchedAt: number }>();
const TOURNAMENT_ID_CACHE_TTL_MS = 1000 * 60 * 60 * 6; // 6 hours

function getHosts() {
  const configured = process.env.SLASH_GOLF_API_HOST?.trim();
  if (configured) {
    return [configured, ...DEFAULT_HOSTS.filter((host) => host !== configured)];
  }
  return DEFAULT_HOSTS;
}

function coerceNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseGolfScore(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return null;

  const normalized = value.trim().toUpperCase();
  if (!normalized) return null;
  if (normalized === "E") return 0;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeGolferName(value: string) {
  return value
    .replace(/[Øø]/g, "o")
    .replace(/[Ææ]/g, "ae")
    .replace(/[Œœ]/g, "oe")
    .replace(/[Ðð]/g, "d")
    .replace(/[Þþ]/g, "th")
    .replace(/[Łł]/g, "l")
    .replace(/[ß]/g, "ss")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function golferLookupKeys(value: string) {
  const normalized = normalizeGolferName(value);
  const alias = GOLFER_NAME_ALIASES[normalized];
  return Array.from(new Set([normalized, alias].filter((entry): entry is string => Boolean(entry))));
}

function nameFromPlayer(player: SlashLeaderboardPlayer) {
  const direct = String(player.playerName ?? player.name ?? "").trim();
  if (direct) return direct;
  const joined = `${String(player.firstName ?? "").trim()} ${String(player.lastName ?? "").trim()}`.trim();
  return joined;
}

function normalizeStatus(player: SlashLeaderboardPlayer): "played" | "cut" | "wd" {
  const raw = `${String(player.status ?? "").trim().toLowerCase()} ${String(player.thru ?? "")
    .trim()
    .toLowerCase()}`.trim();
  if (raw === "cut") return "cut";
  if (raw === "wd") return "wd";
  if (raw.includes("cut")) return "cut";
  if (raw.includes("wd") || raw.includes("withdraw")) return "wd";
  return "played";
}

async function fetchSlashJson(
  path: string,
  params: URLSearchParams,
  apiKey: string
) {
  const attempts: Array<{ host: string; path: string; status: number | string }> = [];

  for (const host of getHosts()) {
    const url = new URL(`https://${host}${path}`);
    for (const [key, value] of params.entries()) {
      url.searchParams.set(key, value);
    }

    try {
      const res = await fetch(url.toString(), {
        method: "GET",
        cache: "no-store",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          "x-rapidapi-key": apiKey,
          "x-rapidapi-host": host,
          Accept: "application/json",
        },
      });

      attempts.push({ host, path: url.pathname + url.search, status: res.status });

      if (!res.ok) {
        continue;
      }

      const json = await res.json();
      return { host, json, attempts };
    } catch (error: unknown) {
      attempts.push({
        host,
        path: url.pathname + url.search,
        status: `ERR: ${getErrorMessage(error, "request failed")}`,
      });
    }
  }

  throw new Error(
    `Slash Golf request failed. Tried: ${attempts
      .map((attempt) => `${attempt.host} ${attempt.status} ${attempt.path}`)
      .join(" | ")}`
  );
}

async function fetchSlashWithFallback(
  path: string,
  paramSets: Array<Record<string, string | number>>,
  apiKey: string
) {
  const allAttempts: Array<{ host: string; path: string; status: number | string }> = [];

  for (const paramSet of paramSets) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(paramSet)) {
      params.set(key, String(value));
    }

    try {
      const result = await fetchSlashJson(path, params, apiKey);
      return {
        host: result.host,
        json: result.json,
        attempts: [...allAttempts, ...result.attempts],
      };
    } catch (error: unknown) {
      const message = getErrorMessage(error, "request failed");
      allAttempts.push({ host: "all-hosts", path: `${path}?${params.toString()}`, status: message });
    }
  }

  throw new Error(
    `Slash Golf request failed. Tried: ${allAttempts
      .map((attempt) => `${attempt.status} ${attempt.path}`)
      .join(" | ")}`
  );
}

export async function fetchSlashSchedules(apiKey: string, season: string) {
  const result = await fetchSlashWithFallback(
    "/schedule",
    [
      { orgId: 1, year: season },
    ],
    apiKey
  );

  const payload = result.json as Record<string, unknown>;
  const schedule = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.schedule)
      ? payload.schedule
      : Array.isArray(payload.data)
        ? payload.data
        : [];

  const tournaments = (schedule as SlashScheduleRow[])
    .map((row) => ({
      tournId: row.tournId ?? row.tournamentId ?? 0,
      year: row.year ?? null,
      name: row.name ?? row.tournName ?? "Unknown Tournament",
      startDate: row.startDate ?? row.date?.start ?? null,
      endDate: row.endDate ?? row.date?.end ?? null,
      venue: row.course ?? row.venue ?? null,
      status: row.status ?? null,
    }))
    .filter((row) => row.tournId > 0);

  return {
    host: result.host,
    attempts: result.attempts,
    tournaments,
  };
}

export async function fetchSlashLeaderboard(apiKey: string, tournId: string, year: string) {
  const normalizedId = tournId.trim();
  const paddedId = /^\d+$/.test(normalizedId) ? normalizedId.padStart(3, "0") : normalizedId;

  const result = await fetchSlashWithFallback(
    "/leaderboard",
    [
      { orgId: 1, tournId: paddedId, year },
      { orgId: 1, tournamentId: paddedId, year },
    ],
    apiKey
  );

  const payload = result.json as Record<string, unknown>;
  const leaderboard = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.leaderboard)
      ? payload.leaderboard
      : Array.isArray(payload.leaderboardRows)
        ? payload.leaderboardRows
      : Array.isArray(payload.data)
        ? payload.data
        : [];

  const rows = (leaderboard as SlashLeaderboardPlayer[])
    .map((player) => {
      const golfer = nameFromPlayer(player);
      if (!golfer) return null;

      const roundsSource = Array.isArray(player.rounds)
        ? player.rounds
        : Array.isArray(player.scorecards)
          ? player.scorecards
          : [];

      return {
        golfer,
        position:
          coerceNumber(player.position) ??
          coerceNumber(player.pos),
        position_text:
          typeof player.positionText === "string"
            ? player.positionText
            : typeof player.position === "string"
              ? player.position
              : null,
        total_to_par: parseGolfScore(player.total),
        total_strokes:
          coerceNumber(player.totalStrokes) ??
          coerceNumber(player.totalStrokesFromCompletedRounds),
        thru: player.thru == null ? null : String(player.thru),
        current_round_score: parseGolfScore(player.currentRoundScore),
        rounds: roundsSource
          .map((round, index) => ({
            round_number:
              coerceNumber(round.roundId) ??
              coerceNumber(round.round) ??
              index + 1,
            strokes:
              coerceNumber(round.strokes) ??
              coerceNumber(round.score),
            score_status: normalizeStatus(player),
          }))
          .filter((round) => round.strokes !== null),
      } satisfies SlashLeaderboardRow;
    })
    .filter((row): row is SlashLeaderboardRow => Boolean(row));

  return {
    host: result.host,
    attempts: result.attempts,
    rows,
    raw: result.json,
  };
}

export async function resolveSlashTournamentId(
  apiKey: string,
  tournamentSlug: string,
  year: string
) {
  const cacheKey = `${tournamentSlug}-${year}`;
  const cached = tournamentIdCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < TOURNAMENT_ID_CACHE_TTL_MS) {
    return cached.id;
  }

  const matchers = TOURNAMENT_NAME_MATCHERS[tournamentSlug] ?? [tournamentSlug];
  const schedule = await fetchSlashSchedules(apiKey, year);
  const normalizedMatchers = matchers.map((value) => value.toLowerCase());

  const match = schedule.tournaments.find((tournament) => {
    const name = tournament.name.toLowerCase();
    return normalizedMatchers.some((matcher) => name.includes(matcher));
  });

  const id = match ? String(match.tournId).padStart(3, "0") : null;
  if (id) {
    tournamentIdCache.set(cacheKey, { id, fetchedAt: Date.now() });
  }
  return id;
}
