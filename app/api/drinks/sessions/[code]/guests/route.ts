import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthenticatedEntrant } from "@/lib/draftAuth";
import { getErrorMessage } from "@/lib/error";

export const revalidate = 0;

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

type SessionRow = {
  session_id: string;
  ended_at: string | null;
};

async function loadActiveSession(code: string): Promise<SessionRow | null> {
  const { data } = await supabaseAdmin
    .from("drink_sessions")
    .select("session_id, ended_at")
    .eq("code", code)
    .maybeSingle<SessionRow>();
  return data ?? null;
}

async function isMember(sessionId: string, entrantId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("drink_session_members")
    .select("session_id, left_at")
    .eq("session_id", sessionId)
    .eq("entrant_id", entrantId)
    .maybeSingle<{ session_id: string; left_at: string | null }>();
  return !!data && !data.left_at;
}

function parseSex(value: unknown): "male" | "female" | "other" | null {
  if (value === "male" || value === "female" || value === "other") return value;
  return null;
}

// Add a guest. Caller must be an active member of the session.
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const auth = await getAuthenticatedEntrant();
    if (!auth) return NextResponse.json({ error: "auth required" }, { status: 401 });

    const { code: rawCode } = await context.params;
    const code = rawCode.toUpperCase();

    const body = (await request.json().catch(() => ({}))) as {
      display_name?: string;
      weight_lbs?: number;
      sex?: string;
    };
    const name = body.display_name?.trim();
    const weight = Number(body.weight_lbs);
    const sex = parseSex(body.sex);

    if (!name) return NextResponse.json({ error: "display_name required" }, { status: 400 });
    if (name.length > 60) return NextResponse.json({ error: "display_name too long" }, { status: 400 });
    if (!Number.isFinite(weight) || weight <= 0 || weight >= 800) {
      return NextResponse.json({ error: "weight_lbs must be a number between 1 and 799" }, { status: 400 });
    }
    if (!sex) return NextResponse.json({ error: "sex must be 'male', 'female', or 'other'" }, { status: 400 });

    const session = await loadActiveSession(code);
    if (!session) return NextResponse.json({ error: "session not found" }, { status: 404 });
    if (session.ended_at) return NextResponse.json({ error: "session has ended" }, { status: 410 });

    if (!(await isMember(session.session_id, auth.entrant.entrant_id))) {
      return NextResponse.json({ error: "join the session before adding a guest" }, { status: 403 });
    }

    const { data, error } = await supabaseAdmin
      .from("drink_session_guests")
      .insert({
        session_id: session.session_id,
        display_name: name,
        weight_lbs: weight,
        sex,
        added_by: auth.entrant.entrant_id,
      })
      .select("guest_id, session_id, display_name, weight_lbs, sex, added_by, created_at, removed_at")
      .single<GuestRow>();
    if (error) throw new Error(error.message);

    return NextResponse.json({ guest: data });
  } catch (err) {
    return NextResponse.json(
      { error: getErrorMessage(err, "Failed to add guest") },
      { status: 500 },
    );
  }
}

// Update a guest's profile (name, weight, sex). Caller must be a member.
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const auth = await getAuthenticatedEntrant();
    if (!auth) return NextResponse.json({ error: "auth required" }, { status: 401 });

    const { code: rawCode } = await context.params;
    const code = rawCode.toUpperCase();
    const guestId = request.nextUrl.searchParams.get("id");
    if (!guestId) return NextResponse.json({ error: "id required" }, { status: 400 });

    const body = (await request.json().catch(() => ({}))) as {
      display_name?: string;
      weight_lbs?: number;
      sex?: string;
    };

    const session = await loadActiveSession(code);
    if (!session) return NextResponse.json({ error: "session not found" }, { status: 404 });
    if (!(await isMember(session.session_id, auth.entrant.entrant_id))) {
      return NextResponse.json({ error: "must be a member" }, { status: 403 });
    }

    const { data: existing } = await supabaseAdmin
      .from("drink_session_guests")
      .select("guest_id, session_id, removed_at")
      .eq("guest_id", guestId)
      .maybeSingle<{ guest_id: string; session_id: string; removed_at: string | null }>();
    if (!existing || existing.session_id !== session.session_id) {
      return NextResponse.json({ error: "guest not found" }, { status: 404 });
    }
    if (existing.removed_at) {
      return NextResponse.json({ error: "guest has been removed" }, { status: 410 });
    }

    const update: Record<string, unknown> = {};
    if (typeof body.display_name === "string") {
      const trimmed = body.display_name.trim();
      if (!trimmed || trimmed.length > 60) {
        return NextResponse.json({ error: "display_name must be 1-60 chars" }, { status: 400 });
      }
      update.display_name = trimmed;
    }
    if (body.weight_lbs !== undefined) {
      const w = Number(body.weight_lbs);
      if (!Number.isFinite(w) || w <= 0 || w >= 800) {
        return NextResponse.json({ error: "weight_lbs must be 1-799" }, { status: 400 });
      }
      update.weight_lbs = w;
    }
    if (body.sex !== undefined) {
      const sex = parseSex(body.sex);
      if (!sex) return NextResponse.json({ error: "sex must be 'male', 'female', or 'other'" }, { status: 400 });
      update.sex = sex;
    }
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "nothing to update" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("drink_session_guests")
      .update(update)
      .eq("guest_id", guestId)
      .select("guest_id, session_id, display_name, weight_lbs, sex, added_by, created_at, removed_at")
      .single<GuestRow>();
    if (error) throw new Error(error.message);

    return NextResponse.json({ guest: data });
  } catch (err) {
    return NextResponse.json(
      { error: getErrorMessage(err, "Failed to update guest") },
      { status: 500 },
    );
  }
}

// Soft-remove a guest. Entries stay attached for history. Only the original
// chaperone (the entrant who added the guest) or the session creator can remove.
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const auth = await getAuthenticatedEntrant();
    if (!auth) return NextResponse.json({ error: "auth required" }, { status: 401 });

    const { code: rawCode } = await context.params;
    const code = rawCode.toUpperCase();
    const guestId = request.nextUrl.searchParams.get("id");
    if (!guestId) return NextResponse.json({ error: "id required" }, { status: 400 });

    const { data: sessionRow } = await supabaseAdmin
      .from("drink_sessions")
      .select("session_id, created_by")
      .eq("code", code)
      .maybeSingle<{ session_id: string; created_by: string }>();
    if (!sessionRow) return NextResponse.json({ error: "session not found" }, { status: 404 });

    const { data: guest } = await supabaseAdmin
      .from("drink_session_guests")
      .select("guest_id, session_id, added_by, removed_at")
      .eq("guest_id", guestId)
      .maybeSingle<{ guest_id: string; session_id: string; added_by: string; removed_at: string | null }>();
    if (!guest || guest.session_id !== sessionRow.session_id) {
      return NextResponse.json({ error: "guest not found" }, { status: 404 });
    }

    if (
      guest.added_by !== auth.entrant.entrant_id
      && sessionRow.created_by !== auth.entrant.entrant_id
      && !auth.entrant.is_admin
    ) {
      return NextResponse.json({ error: "only the chaperone or session creator can remove" }, { status: 403 });
    }

    if (!guest.removed_at) {
      const { error } = await supabaseAdmin
        .from("drink_session_guests")
        .update({ removed_at: new Date().toISOString() })
        .eq("guest_id", guestId);
      if (error) throw new Error(error.message);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: getErrorMessage(err, "Failed to remove guest") },
      { status: 500 },
    );
  }
}
