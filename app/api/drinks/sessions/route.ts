import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getAuthenticatedEntrant, generateAccessCode } from "@/lib/draftAuth";
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

type ProfileRow = {
  weight_lbs: number;
  sex: "male" | "female" | "other";
  display_name: string | null;
};

// List sessions I'm currently a member of (active = ended_at null).
export async function GET() {
  try {
    const session = await getAuthenticatedEntrant();
    if (!session) return NextResponse.json({ error: "auth required" }, { status: 401 });

    const { data: memberships } = await supabaseAdmin
      .from("drink_session_members")
      .select("session_id, joined_at, left_at, drink_sessions(session_id, code, name, created_by, started_at, ended_at)")
      .eq("entrant_id", session.entrant.entrant_id)
      .is("left_at", null);

    type Row = { drink_sessions: SessionRow | null };
    const sessions = ((memberships ?? []) as unknown as Row[])
      .map((r) => r.drink_sessions)
      .filter((s): s is SessionRow => !!s && !s.ended_at)
      .sort((a, b) => b.started_at.localeCompare(a.started_at));

    return NextResponse.json({ sessions });
  } catch (err) {
    return NextResponse.json(
      { error: getErrorMessage(err, "Failed to list sessions") },
      { status: 500 },
    );
  }
}

// Create a new session. Requires the caller to have a drink_profile (we need
// weight + sex for BAC math). The creator is auto-joined.
export async function POST(request: NextRequest) {
  try {
    const session = await getAuthenticatedEntrant();
    if (!session) return NextResponse.json({ error: "auth required" }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as { name?: string };
    const name = body.name?.trim() || `${session.entrant.entrant_name}'s session`;
    if (name.length > 80) {
      return NextResponse.json({ error: "name too long (max 80 chars)" }, { status: 400 });
    }

    const { data: profile } = await supabaseAdmin
      .from("drink_profiles")
      .select("weight_lbs, sex, display_name")
      .eq("entrant_id", session.entrant.entrant_id)
      .maybeSingle<ProfileRow>();

    if (!profile) {
      return NextResponse.json(
        { error: "profile required: set your weight & sex before starting a session" },
        { status: 400 },
      );
    }

    // Generate a code; retry on the rare unique collision.
    let code = generateAccessCode(6);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const { data: existing } = await supabaseAdmin
        .from("drink_sessions")
        .select("session_id")
        .eq("code", code)
        .maybeSingle();
      if (!existing) break;
      code = generateAccessCode(6);
    }

    const { data: created, error } = await supabaseAdmin
      .from("drink_sessions")
      .insert({
        code,
        name,
        created_by: session.entrant.entrant_id,
      })
      .select("session_id, code, name, created_by, started_at, ended_at")
      .single<SessionRow>();
    if (error) throw new Error(error.message);

    // Auto-join the creator with a profile snapshot.
    const { error: memberErr } = await supabaseAdmin
      .from("drink_session_members")
      .insert({
        session_id: created.session_id,
        entrant_id: session.entrant.entrant_id,
        display_name: profile.display_name ?? session.entrant.entrant_name,
        weight_lbs: profile.weight_lbs,
        sex: profile.sex,
      });
    if (memberErr) throw new Error(memberErr.message);

    return NextResponse.json({ session: created });
  } catch (err) {
    return NextResponse.json(
      { error: getErrorMessage(err, "Failed to create session") },
      { status: 500 },
    );
  }
}
