import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getCurrentSeasonId } from "@/lib/events/resolve";
import { getErrorMessage } from "@/lib/error";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/presence
 *
 * Returns the most-recent last_seen_at per season member, derived from
 * draft_sessions. The shell uses this to render presence avatars with a
 * "here now" indicator when last_seen_at is within the last 5 minutes.
 *
 * Shape: { members: [{ entrant_id, display_name, seat_order, last_seen_at }] }
 */
export async function GET() {
  try {
    const seasonId = await getCurrentSeasonId();
    if (!seasonId) {
      return NextResponse.json({ members: [] });
    }

    const { data: members, error: membersErr } = await supabaseAdmin
      .from("season_members")
      .select("entrant_id, display_name, seat_order")
      .eq("season_id", seasonId);
    if (membersErr) throw new Error(membersErr.message);

    type Member = { entrant_id: string; display_name: string; seat_order: number | null };
    const memberRows = (members ?? []) as Member[];

    if (memberRows.length === 0) {
      return NextResponse.json({ members: [] });
    }

    // Person can be authenticated via multiple draft_entrants rows (one per
    // pool). Resolve to the same person via draft_entrants.person_key, then
    // pick the most-recent last_seen_at across all of that person's sessions.
    const memberIds = memberRows.map((m) => m.entrant_id);

    const { data: entrants, error: entrantsErr } = await supabaseAdmin
      .from("draft_entrants")
      .select("entrant_id, person_key")
      .in("entrant_id", memberIds);
    if (entrantsErr) throw new Error(entrantsErr.message);

    type EntrantPersonKey = { entrant_id: string; person_key: string | null };
    const personKeyByMember = new Map<string, string | null>(
      ((entrants ?? []) as EntrantPersonKey[]).map((e) => [e.entrant_id, e.person_key]),
    );

    const allKeys = Array.from(
      new Set(
        ((entrants ?? []) as EntrantPersonKey[])
          .map((e) => e.person_key)
          .filter((k): k is string => Boolean(k)),
      ),
    );

    let entrantsForKeys: EntrantPersonKey[] = [];
    if (allKeys.length > 0) {
      const { data: sameKey, error: sameKeyErr } = await supabaseAdmin
        .from("draft_entrants")
        .select("entrant_id, person_key")
        .in("person_key", allKeys);
      if (sameKeyErr) throw new Error(sameKeyErr.message);
      entrantsForKeys = (sameKey ?? []) as EntrantPersonKey[];
    }

    const allEntrantIds = Array.from(
      new Set([
        ...memberIds,
        ...entrantsForKeys.map((e) => e.entrant_id),
      ]),
    );

    const { data: sessions, error: sessionsErr } = await supabaseAdmin
      .from("draft_sessions")
      .select("entrant_id, last_seen_at")
      .in("entrant_id", allEntrantIds)
      .order("last_seen_at", { ascending: false });
    if (sessionsErr) throw new Error(sessionsErr.message);

    type SessionRow = { entrant_id: string; last_seen_at: string };
    const lastSeenByEntrantId = new Map<string, string>();
    for (const row of (sessions ?? []) as SessionRow[]) {
      if (!lastSeenByEntrantId.has(row.entrant_id)) {
        lastSeenByEntrantId.set(row.entrant_id, row.last_seen_at);
      }
    }

    // Roll up: each season member can match other entrants via person_key, so
    // pick the latest last_seen_at across all of them.
    const out = memberRows.map((m) => {
      const personKey = personKeyByMember.get(m.entrant_id) ?? null;
      const candidateIds = personKey
        ? entrantsForKeys.filter((e) => e.person_key === personKey).map((e) => e.entrant_id)
        : [m.entrant_id];

      let latest: string | null = null;
      for (const id of candidateIds) {
        const ts = lastSeenByEntrantId.get(id);
        if (ts && (!latest || ts > latest)) latest = ts;
      }

      return {
        entrant_id: m.entrant_id,
        display_name: m.display_name,
        seat_order: m.seat_order,
        last_seen_at: latest,
      };
    });

    return NextResponse.json(
      { members: out },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: getErrorMessage(err, "Failed to load presence") },
      { status: 500 },
    );
  }
}
