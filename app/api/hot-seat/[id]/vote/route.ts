import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthenticatedEntrant } from "@/lib/draftAuth";
import { getCurrentSeasonId } from "@/lib/events/resolve";
import { getErrorMessage } from "@/lib/error";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const session = await getAuthenticatedEntrant();
    if (!session) return NextResponse.json({ error: "auth required" }, { status: 401 });

    const seasonId = await getCurrentSeasonId();
    if (!seasonId) return NextResponse.json({ error: "no active season" }, { status: 404 });

    const body = (await request.json().catch(() => ({}))) as { vote?: string };
    if (body.vote !== "veto" && body.vote !== "approve") {
      return NextResponse.json({ error: "vote must be veto or approve" }, { status: 400 });
    }

    const { data: hs } = await supabaseAdmin
      .from("hot_seat_weeks")
      .select("hot_seat_id, entrant_id, status, veto_deadline")
      .eq("hot_seat_id", id)
      .maybeSingle<{
        hot_seat_id: string;
        entrant_id: string;
        status: string;
        veto_deadline: string | null;
      }>();

    if (!hs) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (hs.status !== "pending") {
      return NextResponse.json({ error: "voting closed" }, { status: 409 });
    }
    if (hs.veto_deadline && new Date(hs.veto_deadline).getTime() <= Date.now()) {
      return NextResponse.json({ error: "veto deadline passed" }, { status: 409 });
    }

    const { data: myEntrant } = await supabaseAdmin
      .from("draft_entrants")
      .select("person_key")
      .eq("entrant_id", session.entrant.entrant_id)
      .maybeSingle<{ person_key: string | null }>();

    let canonicalId = session.entrant.entrant_id;
    if (myEntrant?.person_key) {
      const { data: membership } = await supabaseAdmin
        .from("season_members")
        .select("entrant_id, draft_entrants!inner(person_key)")
        .eq("season_id", seasonId);
      type MembershipRow = {
        entrant_id: string;
        draft_entrants: { person_key: string | null } | { person_key: string | null }[] | null;
      };
      for (const row of (membership ?? []) as MembershipRow[]) {
        const related = Array.isArray(row.draft_entrants) ? row.draft_entrants[0] : row.draft_entrants;
        if (related?.person_key === myEntrant.person_key) {
          canonicalId = row.entrant_id;
          break;
        }
      }
    }

    if (canonicalId === hs.entrant_id) {
      return NextResponse.json({ error: "declarer cannot vote" }, { status: 403 });
    }

    await supabaseAdmin.from("hot_seat_vetos").upsert(
      {
        hot_seat_id: id,
        voter_entrant_id: canonicalId,
        vote: body.vote,
      },
      { onConflict: "hot_seat_id,voter_entrant_id" },
    );

    const { data: votes } = await supabaseAdmin
      .from("hot_seat_vetos")
      .select("vote")
      .eq("hot_seat_id", id);
    const vetoCount = (votes ?? []).filter((v) => v.vote === "veto").length;
    if (vetoCount >= 3) {
      await supabaseAdmin
        .from("hot_seat_weeks")
        .update({ status: "vetoed", resolved_at: new Date().toISOString() })
        .eq("hot_seat_id", id);
    }

    return NextResponse.json({ ok: true, veto_count: vetoCount });
  } catch (err) {
    return NextResponse.json(
      { error: getErrorMessage(err, "Failed to vote") },
      { status: 500 },
    );
  }
}
