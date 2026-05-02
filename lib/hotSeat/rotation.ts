import { supabaseAdmin } from "@/lib/supabaseAdmin";

const HOT_SEAT_TZ = "America/Los_Angeles";
const MIN_LONGSHOT_ODDS = 400;

// Monday of the week containing `date`, in America/Los_Angeles.
export function weekStartFor(date: Date): string {
  // Convert to LA time parts.
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: HOT_SEAT_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(date).map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const y = Number(parts.year);
  const m = Number(parts.month);
  const d = Number(parts.day);
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const weekday = weekdayMap[parts.weekday] ?? 0;
  const diff = weekday === 0 ? 6 : weekday - 1; // days back to Monday
  const local = new Date(Date.UTC(y, m - 1, d) - diff * 24 * 60 * 60 * 1000);
  const yy = local.getUTCFullYear();
  const mm = String(local.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(local.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

// Deterministic rotation: sort season_members by seat_order asc, then pick
// the (weeks since season start) % members.length entrant.
export async function entrantForWeek(
  seasonId: string,
  weekStart: string,
): Promise<{ entrant_id: string; display_name: string; seat_order: number | null } | null> {
  const { data: members } = await supabaseAdmin
    .from("season_members")
    .select("entrant_id, display_name, seat_order")
    .eq("season_id", seasonId)
    .order("seat_order", { ascending: true, nullsFirst: false })
    .order("display_name", { ascending: true });

  if (!members || members.length === 0) return null;

  const { data: season } = await supabaseAdmin
    .from("seasons")
    .select("started_at")
    .eq("season_id", seasonId)
    .maybeSingle<{ started_at: string | null }>();

  const startIso = season?.started_at ?? `2026-01-05T00:00:00-08:00`;
  const startMonday = weekStartFor(new Date(startIso));

  const startDate = new Date(`${startMonday}T00:00:00Z`);
  const current = new Date(`${weekStart}T00:00:00Z`);
  const diffWeeks = Math.floor(
    (current.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 7),
  );
  const index = ((diffWeeks % members.length) + members.length) % members.length;
  return members[index];
}

export function isLongshotOdds(americanOdds: number): boolean {
  // +400 or longer means 400 or greater. Negative odds are never long enough.
  if (!Number.isFinite(americanOdds)) return false;
  if (americanOdds < 0) return false;
  return americanOdds >= MIN_LONGSHOT_ODDS;
}
