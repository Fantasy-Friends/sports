import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
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
  entrant_id: string;
  kind: "drink" | "caffeine" | "water" | "substance";
  payload: Record<string, unknown>;
  occurred_at: string;
};

// Full session snapshot: session meta + members + entries.
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

    const [{ data: members }, { data: entries }] = await Promise.all([
      supabaseAdmin
        .from("drink_session_members")
        .select("session_id, entrant_id, display_name, weight_lbs, sex, joined_at, left_at")
        .eq("session_id", session.session_id)
        .order("joined_at", { ascending: true }),
      supabaseAdmin
        .from("drink_session_entries")
        .select("entry_id, session_id, entrant_id, kind, payload, occurred_at")
        .eq("session_id", session.session_id)
        .order("occurred_at", { ascending: true }),
    ]);

    const isMember = (members ?? []).some(
      (m) => (m as MemberRow).entrant_id === auth.entrant.entrant_id && !(m as MemberRow).left_at,
    );

    return NextResponse.json({
      session,
      members: (members ?? []) as MemberRow[],
      entries: (entries ?? []) as EntryRow[],
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
