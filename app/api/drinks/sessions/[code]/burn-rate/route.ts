import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthenticatedEntrant } from "@/lib/draftAuth";
import { getErrorMessage } from "@/lib/error";
import { MAX_BURN_RATE, MIN_BURN_RATE, isValidBurnRate } from "@/lib/drinks/math";

export const revalidate = 0;

type SessionRow = {
  session_id: string;
  created_by: string;
};

// Set (or clear, with null) one person's alcohol burn-off rate in a session.
//
// Body: { entrant_id | guest_id, burn_rate: number | null }
//
// Who can set it:
//   member — themselves, the session creator, or an admin. The rate is also
//            written to their drink_profiles row so it carries into every
//            future session they join; nobody has to re-mark them.
//   guest  — any active member (same rule as editing a guest's weight).
//
// Allowed on ended sessions too, so past nights can be re-scored.
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const auth = await getAuthenticatedEntrant();
    if (!auth) return NextResponse.json({ error: "auth required" }, { status: 401 });

    const { code: rawCode } = await context.params;
    const code = rawCode.toUpperCase();

    const body = (await request.json().catch(() => ({}))) as {
      entrant_id?: string;
      guest_id?: string;
      burn_rate?: number | null;
    };

    if (!!body.entrant_id === !!body.guest_id) {
      return NextResponse.json({ error: "exactly one of entrant_id / guest_id is required" }, { status: 400 });
    }
    if (body.burn_rate === undefined) {
      return NextResponse.json({ error: "burn_rate required (number or null)" }, { status: 400 });
    }
    const burnRate = body.burn_rate === null ? null : Number(body.burn_rate);
    if (burnRate !== null && !isValidBurnRate(burnRate)) {
      return NextResponse.json(
        { error: `burn_rate must be between ${MIN_BURN_RATE} and ${MAX_BURN_RATE} BAC/hr` },
        { status: 400 },
      );
    }

    const { data: session } = await supabaseAdmin
      .from("drink_sessions")
      .select("session_id, created_by")
      .eq("code", code)
      .maybeSingle<SessionRow>();
    if (!session) return NextResponse.json({ error: "session not found" }, { status: 404 });

    const callerId = auth.entrant.entrant_id;

    if (body.entrant_id) {
      const targetId = body.entrant_id;
      const allowed =
        targetId === callerId || session.created_by === callerId || auth.entrant.is_admin;
      if (!allowed) {
        return NextResponse.json(
          { error: "only that person, the session creator, or an admin can set a member's burn rate" },
          { status: 403 },
        );
      }

      const { data: updated, error } = await supabaseAdmin
        .from("drink_session_members")
        .update({ burn_rate: burnRate })
        .eq("session_id", session.session_id)
        .eq("entrant_id", targetId)
        .select("entrant_id");
      if (error) throw new Error(error.message);
      if (!updated || updated.length === 0) {
        return NextResponse.json({ error: "member not found in this session" }, { status: 404 });
      }

      // Carry forward. A missing profile row is fine — they couldn't have
      // joined without one, but there's nothing to do if it's gone.
      const { error: profErr } = await supabaseAdmin
        .from("drink_profiles")
        .update({ burn_rate: burnRate, updated_at: new Date().toISOString() })
        .eq("entrant_id", targetId);
      if (profErr) throw new Error(profErr.message);

      return NextResponse.json({ ok: true, entrant_id: targetId, burn_rate: burnRate });
    }

    const guestId = body.guest_id!;
    const { data: member } = await supabaseAdmin
      .from("drink_session_members")
      .select("left_at")
      .eq("session_id", session.session_id)
      .eq("entrant_id", callerId)
      .maybeSingle<{ left_at: string | null }>();
    if ((!member || member.left_at) && !auth.entrant.is_admin) {
      return NextResponse.json({ error: "must be a member to set a guest's burn rate" }, { status: 403 });
    }

    const { data: updated, error } = await supabaseAdmin
      .from("drink_session_guests")
      .update({ burn_rate: burnRate })
      .eq("session_id", session.session_id)
      .eq("guest_id", guestId)
      .select("guest_id");
    if (error) throw new Error(error.message);
    if (!updated || updated.length === 0) {
      return NextResponse.json({ error: "guest not found in this session" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, guest_id: guestId, burn_rate: burnRate });
  } catch (err) {
    return NextResponse.json(
      { error: getErrorMessage(err, "Failed to set burn rate") },
      { status: 500 },
    );
  }
}
