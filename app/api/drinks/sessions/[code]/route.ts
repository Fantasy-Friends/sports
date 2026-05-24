import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthenticatedEntrant } from "@/lib/draftAuth";
import { getErrorMessage } from "@/lib/error";

export const revalidate = 0;

type SessionRow = {
  session_id: string;
  code: string;
  name: string;
  created_by: string;
  started_at: string;
  ended_at: string | null;
};

type MemberRow = {
  session_id: string;
  entrant_id: string;
  display_name: string;
  weight_lbs: number;
  sex: "male" | "female" | "other";
  joined_at: string;
  left_at: string | null;
};

type EntryRow = {
  entry_id: string;
  session_id: string;
  entrant_id: string | null;
  guest_id: string | null;
  kind: "drink" | "caffeine" | "water" | "substance";
  payload: Record<string, unknown>;
  occurred_at: string;
};

type GuestRow = {
  guest_id: string;
  session_id: string;
  display_name: string;
  weight_lbs: number;
  sex: "male" | "female" | "other";
  added_by: string;
  created_at: string;
  removed_at: string | null;
};

// Full session snapshot: session meta + members + guests + entries.
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const auth = await getAuthenticatedEntrant();
    if (!auth) return NextResponse.json({ error: "auth required" }, { status: 401 });

    const { code: rawCode } = await context.params;
    const code = rawCode.toUpperCase();

    const { data: session } = await supabaseAdmin
      .from("drink_sessions")
      .select("session_id, code, name, created_by, started_at, ended_at")
      .eq("code", code)
      .maybeSingle<SessionRow>();
    if (!session) {
      return NextResponse.json({ error: "session not found" }, { status: 404 });
    }

    const [{ data: members }, { data: guests }, { data: entries }] = await Promise.all([
      supabaseAdmin
        .from("drink_session_members")
        .select("session_id, entrant_id, display_name, weight_lbs, sex, joined_at, left_at")
        .eq("session_id", session.session_id)
        .order("joined_at", { ascending: true }),
      supabaseAdmin
        .from("drink_session_guests")
        .select("guest_id, session_id, display_name, weight_lbs, sex, added_by, created_at, removed_at")
        .eq("session_id", session.session_id)
        .order("created_at", { ascending: true }),
      supabaseAdmin
        .from("drink_session_entries")
        .select("entry_id, session_id, entrant_id, guest_id, kind, payload, occurred_at")
        .eq("session_id", session.session_id)
        .order("occurred_at", { ascending: true }),
    ]);

    const memberRows = (members ?? []) as MemberRow[];
    const isMember = memberRows.some(
      (m) => m.entrant_id === auth.entrant.entrant_id && !m.left_at,
    );

    // Age is used by the Hangover Forecast. Pull it once for all members from
    // drink_profiles so each Stadium card can include it without N round-trips.
    const entrantIds = memberRows.map((m) => m.entrant_id);
    const ageByEntrant: Record<string, number> = {};
    if (entrantIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from("drink_profiles")
        .select("entrant_id, age_years")
        .in("entrant_id", entrantIds);
      for (const row of (profiles ?? []) as Array<{ entrant_id: string; age_years: number | null }>) {
        if (row.age_years !== null && row.age_years !== undefined) {
          ageByEntrant[row.entrant_id] = row.age_years;
        }
      }
    }

    return NextResponse.json({
      session,
      members: memberRows,
      guests: (guests ?? []) as GuestRow[],
      entries: (entries ?? []) as EntryRow[],
      age_by_entrant: ageByEntrant,
      is_member: isMember,
      me: auth.entrant.entrant_id,
    });
  } catch (err) {
    return NextResponse.json(
      { error: getErrorMessage(err, "Failed to load session") },
      { status: 500 },
    );
  }
}
