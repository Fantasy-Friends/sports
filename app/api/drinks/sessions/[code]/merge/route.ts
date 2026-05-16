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
  ended_at: string | null;
};

type SourceMember = {
  entrant_id: string;
  display_name: string;
  weight_lbs: number;
  sex: "male" | "female" | "other";
  joined_at: string;
  left_at: string | null;
};

type TargetMember = {
  entrant_id: string;
  left_at: string | null;
};

// Merge this session INTO another session: every entry gets re-pointed,
// every member gets added (or reactivated) on the target, and this session
// is marked ended. Useful when somebody (Cody) logged into the wrong trip.
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const auth = await getAuthenticatedEntrant();
    if (!auth) return NextResponse.json({ error: "auth required" }, { status: 401 });

    const { code: sourceCodeRaw } = await context.params;
    const sourceCode = sourceCodeRaw.toUpperCase();

    const body = (await request.json().catch(() => ({}))) as { into?: string };
    const targetCode = body.into?.trim().toUpperCase();
    if (!targetCode) {
      return NextResponse.json({ error: "into (target code) is required" }, { status: 400 });
    }
    if (targetCode === sourceCode) {
      return NextResponse.json({ error: "source and target cannot be the same" }, { status: 400 });
    }

    const [{ data: source }, { data: target }] = await Promise.all([
      supabaseAdmin
        .from("drink_sessions")
        .select("session_id, code, name, created_by, ended_at")
        .eq("code", sourceCode)
        .maybeSingle<SessionRow>(),
      supabaseAdmin
        .from("drink_sessions")
        .select("session_id, code, name, created_by, ended_at")
        .eq("code", targetCode)
        .maybeSingle<SessionRow>(),
    ]);
    if (!source) return NextResponse.json({ error: "source session not found" }, { status: 404 });
    if (!target) return NextResponse.json({ error: "target session not found" }, { status: 404 });
    if (source.ended_at) return NextResponse.json({ error: "source session has already ended" }, { status: 410 });
    if (target.ended_at) return NextResponse.json({ error: "target session has ended" }, { status: 410 });
    if (source.created_by !== auth.entrant.entrant_id && !auth.entrant.is_admin) {
      return NextResponse.json(
        { error: "only the source-session creator (or an admin) can merge" },
        { status: 403 },
      );
    }

    // 1) Re-point every entry from source → target.
    const { error: moveEntriesErr } = await supabaseAdmin
      .from("drink_session_entries")
      .update({ session_id: target.session_id })
      .eq("session_id", source.session_id);
    if (moveEntriesErr) throw new Error(moveEntriesErr.message);

    // 2) Add source's members to target — reactivate if they exist and had left.
    const { data: sourceMembers } = await supabaseAdmin
      .from("drink_session_members")
      .select("entrant_id, display_name, weight_lbs, sex, joined_at, left_at")
      .eq("session_id", source.session_id);

    if (sourceMembers && sourceMembers.length > 0) {
      const { data: targetMembers } = await supabaseAdmin
        .from("drink_session_members")
        .select("entrant_id, left_at")
        .eq("session_id", target.session_id);
      const existing = new Map<string, TargetMember>(
        ((targetMembers ?? []) as TargetMember[]).map((m) => [m.entrant_id, m]),
      );

      for (const m of sourceMembers as SourceMember[]) {
        const t = existing.get(m.entrant_id);
        if (!t) {
          const { error } = await supabaseAdmin
            .from("drink_session_members")
            .insert({
              session_id: target.session_id,
              entrant_id: m.entrant_id,
              display_name: m.display_name,
              weight_lbs: m.weight_lbs,
              sex: m.sex,
              joined_at: m.joined_at,
            });
          if (error) throw new Error(error.message);
        } else if (t.left_at) {
          const { error } = await supabaseAdmin
            .from("drink_session_members")
            .update({ left_at: null })
            .eq("session_id", target.session_id)
            .eq("entrant_id", m.entrant_id);
          if (error) throw new Error(error.message);
        }
      }
    }

    // 3) End the source session so nobody keeps logging into it.
    const { error: endErr } = await supabaseAdmin
      .from("drink_sessions")
      .update({ ended_at: new Date().toISOString() })
      .eq("session_id", source.session_id);
    if (endErr) throw new Error(endErr.message);

    return NextResponse.json({
      ok: true,
      target: { code: target.code, session_id: target.session_id, name: target.name },
    });
  } catch (err) {
    return NextResponse.json(
      { error: getErrorMessage(err, "Failed to merge session") },
      { status: 500 },
    );
  }
}
