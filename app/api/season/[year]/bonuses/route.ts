import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getErrorMessage } from "@/lib/error";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/season/[year]/bonuses
 *
 * Returns recent bonus awards for the season, newest first. Used by the
 * companion rail's Bonuses tile. Limit is hardcoded at 10 — that's the
 * tile's max anyway.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ year: string }> },
) {
  try {
    const { year } = await context.params;
    const yearNum = Number(year);
    if (!Number.isFinite(yearNum)) {
      return NextResponse.json({ error: "invalid year" }, { status: 400 });
    }

    const { data: season } = await supabaseAdmin
      .from("seasons")
      .select("season_id")
      .eq("year", yearNum)
      .maybeSingle<{ season_id: string }>();

    if (!season) {
      return NextResponse.json({ bonuses: [] });
    }

    const { data: bonuses, error: bonusErr } = await supabaseAdmin
      .from("bonus_awards")
      .select("bonus_id, entrant_id, event_id, bonus_type, points, note, awarded_at")
      .eq("season_id", season.season_id)
      .order("awarded_at", { ascending: false })
      .limit(10);
    if (bonusErr) throw new Error(bonusErr.message);

    type BonusRow = {
      bonus_id: string;
      entrant_id: string;
      event_id: string | null;
      bonus_type: string;
      points: number;
      note: string | null;
      awarded_at: string;
    };
    const rows = (bonuses ?? []) as BonusRow[];

    // Hydrate display names + event slugs in two small joins.
    const entrantIds = Array.from(new Set(rows.map((r) => r.entrant_id)));
    const eventIds = Array.from(
      new Set(rows.map((r) => r.event_id).filter((id): id is string => Boolean(id))),
    );

    const [{ data: members }, { data: events }] = await Promise.all([
      entrantIds.length
        ? supabaseAdmin
            .from("season_members")
            .select("entrant_id, display_name")
            .in("entrant_id", entrantIds)
        : Promise.resolve({ data: [] as { entrant_id: string; display_name: string }[] }),
      eventIds.length
        ? supabaseAdmin
            .from("events")
            .select("event_id, slug, name")
            .in("event_id", eventIds)
        : Promise.resolve({
            data: [] as { event_id: string; slug: string; name: string }[],
          }),
    ]);

    const nameByEntrant = new Map<string, string>();
    for (const m of members ?? []) nameByEntrant.set(m.entrant_id, m.display_name);
    const eventBySlug = new Map<string, { slug: string; name: string }>();
    for (const e of events ?? []) eventBySlug.set(e.event_id, { slug: e.slug, name: e.name });

    const out = rows.map((r) => ({
      bonus_id: r.bonus_id,
      entrant_id: r.entrant_id,
      display_name: nameByEntrant.get(r.entrant_id) ?? "Unknown",
      bonus_type: r.bonus_type,
      points: Number(r.points),
      note: r.note,
      awarded_at: r.awarded_at,
      event: r.event_id ? eventBySlug.get(r.event_id) ?? null : null,
    }));

    return NextResponse.json(
      { bonuses: out },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: getErrorMessage(err, "Failed to load bonuses") },
      { status: 500 },
    );
  }
}
