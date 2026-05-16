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

type ProfileRow = {
  weight_lbs: number;
  sex: "male" | "female" | "other";
  display_name: string | null;
};

type MemberRow = {
  session_id: string;
  entrant_id: string;
  left_at: string | null;
};

// Join an existing session by code.
export async function POST(request: NextRequest) {
  try {
    const session = await getAuthenticatedEntrant();
    if (!session) return NextResponse.json({ error: "auth required" }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as { code?: string };
    const code = body.code?.trim().toUpperCase();
    if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });

    const { data: drinkSession } = await supabaseAdmin
      .from("drink_sessions")
      .select("session_id, code, name, created_by, started_at, ended_at")
      .eq("code", code)
      .maybeSingle<SessionRow>();

    if (!drinkSession) {
      return NextResponse.json({ error: "session not found" }, { status: 404 });
    }
    if (drinkSession.ended_at) {
      return NextResponse.json({ error: "session has ended" }, { status: 410 });
    }

    const { data: profile } = await supabaseAdmin
      .from("drink_profiles")
      .select("weight_lbs, sex, display_name")
      .eq("entrant_id", session.entrant.entrant_id)
      .maybeSingle<ProfileRow>();

    if (!profile) {
      return NextResponse.json(
        { error: "profile required: set your weight & sex before joining" },
        { status: 400 },
      );
    }

    // Reuse the membership row if the entrant previously joined this session.
    const { data: existing } = await supabaseAdmin
      .from("drink_session_members")
      .select("session_id, entrant_id, left_at")
      .eq("session_id", drinkSession.session_id)
      .eq("entrant_id", session.entrant.entrant_id)
      .maybeSingle<MemberRow>();

    if (existing) {
      if (existing.left_at) {
        const { error: updErr } = await supabaseAdmin
          .from("drink_session_members")
          .update({
            left_at: null,
            joined_at: new Date().toISOString(),
            weight_lbs: profile.weight_lbs,
            sex: profile.sex,
            display_name: profile.display_name ?? session.entrant.entrant_name,
          })
          .eq("session_id", drinkSession.session_id)
          .eq("entrant_id", session.entrant.entrant_id);
        if (updErr) throw new Error(updErr.message);
      }
    } else {
      const { error: insErr } = await supabaseAdmin
        .from("drink_session_members")
        .insert({
          session_id: drinkSession.session_id,
          entrant_id: session.entrant.entrant_id,
          display_name: profile.display_name ?? session.entrant.entrant_name,
          weight_lbs: profile.weight_lbs,
          sex: profile.sex,
        });
      if (insErr) throw new Error(insErr.message);
    }

    return NextResponse.json({ session: drinkSession });
  } catch (err) {
    return NextResponse.json(
      { error: getErrorMessage(err, "Failed to join session") },
      { status: 500 },
    );
  }
}
