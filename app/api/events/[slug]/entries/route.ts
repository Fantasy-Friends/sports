import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthenticatedEntrant } from "@/lib/draftAuth";
import { getEventBySlug, getCurrentSeasonId } from "@/lib/events/resolve";
import { getEventHandler } from "@/lib/events/registry";
import { getErrorMessage } from "@/lib/error";

export const revalidate = 0;

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await context.params;
    const seasonId = await getCurrentSeasonId();
    if (!seasonId) return NextResponse.json({ error: "no active season" }, { status: 404 });
    const event = await getEventBySlug(slug, seasonId);
    if (!event) return NextResponse.json({ error: "event not found" }, { status: 404 });

    const { data } = await supabaseAdmin
      .from("event_entries")
      .select("entrant_id, submitted_at, locked_at, payload")
      .eq("event_id", event.event_id);

    return NextResponse.json({ entries: data ?? [] });
  } catch (err) {
    return NextResponse.json(
      { error: getErrorMessage(err, "Failed to load entries") },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await context.params;
    const session = await getAuthenticatedEntrant();
    if (!session) return NextResponse.json({ error: "auth required" }, { status: 401 });

    const seasonId = await getCurrentSeasonId();
    if (!seasonId) return NextResponse.json({ error: "no active season" }, { status: 404 });
    const event = await getEventBySlug(slug, seasonId);
    if (!event) return NextResponse.json({ error: "event not found" }, { status: 404 });

    if (event.status !== "open-entry" && event.status !== "scheduled") {
      return NextResponse.json({ error: "event not accepting entries" }, { status: 409 });
    }
    if (event.lock_at && new Date(event.lock_at).getTime() <= Date.now()) {
      return NextResponse.json({ error: "entry deadline passed" }, { status: 409 });
    }

    const body = (await request.json().catch(() => null)) as { payload?: unknown } | null;
    if (!body || body.payload === undefined) {
      return NextResponse.json({ error: "payload required" }, { status: 400 });
    }

    const handler = getEventHandler(event);
    const validation = handler.validateEntry(body.payload, event);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.reason }, { status: 400 });
    }

    // Resolve canonical season_members entrant_id for the signed-in entrant.
    const { data: membership } = await supabaseAdmin
      .from("season_members")
      .select("entrant_id, draft_entrants!inner(person_key)")
      .eq("season_id", seasonId);

    type MembershipRow = {
      entrant_id: string;
      draft_entrants: { person_key: string | null } | { person_key: string | null }[] | null;
    };

    const { data: myEntrant } = await supabaseAdmin
      .from("draft_entrants")
      .select("person_key")
      .eq("entrant_id", session.entrant.entrant_id)
      .maybeSingle<{ person_key: string | null }>();

    let canonicalId = session.entrant.entrant_id;
    if (myEntrant?.person_key) {
      for (const row of (membership ?? []) as MembershipRow[]) {
        const related = Array.isArray(row.draft_entrants) ? row.draft_entrants[0] : row.draft_entrants;
        if (related?.person_key === myEntrant.person_key) {
          canonicalId = row.entrant_id;
          break;
        }
      }
    }

    const now = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from("event_entries")
      .upsert(
        {
          event_id: event.event_id,
          entrant_id: canonicalId,
          payload: body.payload,
          submitted_at: now,
          updated_at: now,
        },
        { onConflict: "event_id,entrant_id" },
      );
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: getErrorMessage(err, "Failed to save entry") },
      { status: 500 },
    );
  }
}
