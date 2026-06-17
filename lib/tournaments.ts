export type TournamentSlug =
  | "masters"
  | "pga-championship"
  | "us-open"
  | "the-open";

export type TournamentSchedule = {
  /** Inclusive start date in YYYY-MM-DD (tournament timezone) */
  startDate: string;
  /** Inclusive end date in YYYY-MM-DD (tournament timezone) */
  endDate: string;
  /** Hour of day to start polling (0-23, tournament timezone) */
  dailyStartHour: number;
  /** Hour of day to stop polling (0-23, tournament timezone) */
  dailyEndHour: number;
  timezone: string;
};

export type TournamentOption = {
  slug: TournamentSlug;
  label: string;
  schedule?: TournamentSchedule;
};

export const TOURNAMENTS: TournamentOption[] = [
  {
    slug: "masters",
    label: "The Masters",
    schedule: {
      startDate: "2026-04-10",
      endDate: "2026-04-13",
      dailyStartHour: 6,
      dailyEndHour: 21,
      timezone: "America/Chicago",
    },
  },
  {
    slug: "pga-championship",
    label: "PGA Championship",
    schedule: {
      startDate: "2026-05-14",
      endDate: "2026-05-17",
      dailyStartHour: 6,
      dailyEndHour: 21,
      timezone: "America/New_York",
    },
  },
  {
    slug: "us-open",
    label: "U.S. Open",
    schedule: {
      startDate: "2026-06-18",
      endDate: "2026-06-21",
      dailyStartHour: 6,
      dailyEndHour: 21,
      timezone: "America/New_York",
    },
  },
  {
    slug: "the-open",
    label: "The Open Championship",
    schedule: {
      startDate: "2026-07-16",
      endDate: "2026-07-19",
      dailyStartHour: 6,
      dailyEndHour: 21,
      timezone: "Europe/London",
    },
  },
];

function getTournamentDateParts(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "0";
  const dateStr = `${get("year")}-${get("month")}-${get("day")}`;
  const hour = Number(get("hour"));
  return { dateStr, hour };
}

export function isTournamentPollingActive(slug: TournamentSlug, now = new Date()): boolean {
  const tournament = TOURNAMENTS.find((t) => t.slug === slug);
  if (!tournament?.schedule) return false;

  const { startDate, endDate, dailyStartHour, dailyEndHour, timezone } = tournament.schedule;
  const { dateStr, hour } = getTournamentDateParts(now, timezone);

  return dateStr >= startDate && dateStr <= endDate && hour >= dailyStartHour && hour < dailyEndHour;
}

export function isTournamentEnded(slug: TournamentSlug, now = new Date()): boolean {
  const tournament = TOURNAMENTS.find((t) => t.slug === slug);
  if (!tournament?.schedule) return false;
  const { endDate, timezone } = tournament.schedule;
  const { dateStr } = getTournamentDateParts(now, timezone);
  return dateStr > endDate;
}

export function isTournamentSlug(value: string): value is TournamentSlug {
  return TOURNAMENTS.some((option) => option.slug === value);
}

// The "current" major for forward-looking, season-following views (e.g. the
// public lottery page): the first tournament on the calendar whose window
// hasn't ended yet. Once every major has finished, falls back to the last one.
// TOURNAMENTS is maintained in chronological order, so a simple find works.
export function getCurrentTournamentSlug(now = new Date()): TournamentSlug {
  const upcoming = TOURNAMENTS.find((t) => !isTournamentEnded(t.slug, now));
  return (upcoming ?? TOURNAMENTS[TOURNAMENTS.length - 1]).slug;
}

export function buildTournamentPoolId(basePoolId: string, tournament: TournamentSlug) {
  return `${basePoolId}-${tournament}`;
}
