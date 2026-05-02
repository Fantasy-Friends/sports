import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { EventRow } from "./types";

const CURRENT_YEAR = Number(process.env.NEXT_PUBLIC_CURRENT_SEASON_YEAR ?? 2026);

export async function getCurrentSeasonId(): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("seasons")
    .select("season_id")
    .eq("year", CURRENT_YEAR)
    .maybeSingle<{ season_id: string }>();
  if (error) throw new Error(error.message);
  return data?.season_id ?? null;
}

export async function getSeasonIdForYear(year: number): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("seasons")
    .select("season_id")
    .eq("year", year)
    .maybeSingle<{ season_id: string }>();
  if (error) throw new Error(error.message);
  return data?.season_id ?? null;
}

export async function getEventBySlug(slug: string, seasonId?: string): Promise<EventRow | null> {
  const resolvedSeasonId = seasonId ?? (await getCurrentSeasonId());
  if (!resolvedSeasonId) return null;

  const { data, error } = await supabaseAdmin
    .from("events")
    .select(
      "event_id, season_id, slug, name, event_type, tier, status, starts_at, ends_at, lock_at, legacy_pool_id, group_key, config",
    )
    .eq("season_id", resolvedSeasonId)
    .eq("slug", slug)
    .maybeSingle<EventRow>();
  if (error) throw new Error(error.message);
  return data;
}

export async function listEventsForSeason(seasonId: string): Promise<EventRow[]> {
  const { data, error } = await supabaseAdmin
    .from("events")
    .select(
      "event_id, season_id, slug, name, event_type, tier, status, starts_at, ends_at, lock_at, legacy_pool_id, group_key, config",
    )
    .eq("season_id", seasonId)
    .order("starts_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as EventRow[];
}
