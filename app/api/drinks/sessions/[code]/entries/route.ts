import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthenticatedEntrant } from "@/lib/draftAuth";
import { getErrorMessage } from "@/lib/error";

export const revalidate = 0;

type SessionRow = {
  session_id: string;
  ended_at: string | null;
};

type EntryRow = {
  entry_id: string;
  session_id: string;
  entrant_id: string | null;
  guest_id: string | null;
  kind: "drink" | "caffeine" | "water" | "substance" | "activity" | "food" | "sleep";
  payload: Record<string, unknown>;
  occurred_at: string;
};

const VALID_KINDS = new Set(["drink", "caffeine", "water", "substance", "activity", "food", "sleep"]);

async function loadSession(code: string) {
  const { data } = await supabaseAdmin
    .from("drink_sessions")
    .select("session_id, ended_at")
    .eq("code", code)
    .maybeSingle<SessionRow>();
  return data;
}

async function assertMember(sessionId: string, entrantId: string) {
  const { data } = await supabaseAdmin
    .from("drink_session_members")
    .select("session_id, left_at")
    .eq("session_id", sessionId)
    .eq("entrant_id", entrantId)
    .maybeSingle<{ session_id: string; left_at: string | null }>();
  return !!data && !data.left_at;
}

async function guestBelongsToSession(sessionId: string, guestId: string) {
  const { data } = await supabaseAdmin
    .from("drink_session_guests")
    .select("guest_id, session_id, removed_at")
    .eq("guest_id", guestId)
    .maybeSingle<{ guest_id: string; session_id: string; removed_at: string | null }>();
  return !!data && data.session_id === sessionId && !data.removed_at;
}

// Log a drink / caffeine / water / substance entry — either for the caller
// themselves OR on behalf of a session guest (when `guest_id` is provided).
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
      kind?: string;
      payload?: Record<string, unknown>;
      occurred_at?: string;
      guest_id?: string;
    };

    if (!body.kind || !VALID_KINDS.has(body.kind)) {
      return NextResponse.json({ error: "kind must be 'drink','caffeine','water','substance'" }, { status: 400 });
    }

    const drinkSession = await loadSession(code);
    if (!drinkSession) {
      return NextResponse.json({ error: "session not found" }, { status: 404 });
    }
    if (drinkSession.ended_at) {
      return NextResponse.json({ error: "session has ended" }, { status: 410 });
    }

    if (!(await assertMember(drinkSession.session_id, auth.entrant.entrant_id))) {
      return NextResponse.json({ error: "join the session first" }, { status: 403 });
    }

    if (body.guest_id && !(await guestBelongsToSession(drinkSession.session_id, body.guest_id))) {
      return NextResponse.json({ error: "guest not found in this session" }, { status: 404 });
    }

    const occurredAt = body.occurred_at ? new Date(body.occurred_at) : new Date();
    if (Number.isNaN(occurredAt.getTime())) {
      return NextResponse.json({ error: "invalid occurred_at" }, { status: 400 });
    }

    const insert = body.guest_id
      ? {
          session_id: drinkSession.session_id,
          entrant_id: null,
          guest_id: body.guest_id,
          kind: body.kind,
          payload: body.payload ?? {},
          occurred_at: occurredAt.toISOString(),
          logged_by_entrant_id: auth.entrant.entrant_id,
        }
      : {
          session_id: drinkSession.session_id,
          entrant_id: auth.entrant.entrant_id,
          guest_id: null,
          kind: body.kind,
          payload: body.payload ?? {},
          occurred_at: occurredAt.toISOString(),
          logged_by_entrant_id: auth.entrant.entrant_id,
        };

    const { data, error } = await supabaseAdmin
      .from("drink_session_entries")
      .insert(insert)
      .select("entry_id, session_id, entrant_id, guest_id, kind, payload, occurred_at")
      .single<EntryRow>();
    if (error) throw new Error(error.message);

    return NextResponse.json({ entry: data });
  } catch (err) {
    return NextResponse.json(
      { error: getErrorMessage(err, "Failed to log entry") },
      { status: 500 },
    );
  }
}

// Edit an entry (currently: just the timestamp, optionally payload).
// Self-entries: only the author can edit. Guest entries: any session member.
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const auth = await getAuthenticatedEntrant();
    if (!auth) return NextResponse.json({ error: "auth required" }, { status: 401 });

    const { code: rawCode } = await context.params;
    const code = rawCode.toUpperCase();
    const body = (await request.json().catch(() => ({}))) as {
      id?: string;
      occurred_at?: string;
      payload?: Record<string, unknown>;
    };
    if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const drinkSession = await loadSession(code);
    if (!drinkSession) {
      return NextResponse.json({ error: "session not found" }, { status: 404 });
    }

    const { data: entry } = await supabaseAdmin
      .from("drink_session_entries")
      .select("entry_id, entrant_id, guest_id, session_id")
      .eq("entry_id", body.id)
      .maybeSingle<{ entry_id: string; entrant_id: string | null; guest_id: string | null; session_id: string }>();
    if (!entry || entry.session_id !== drinkSession.session_id) {
      return NextResponse.json({ error: "entry not found" }, { status: 404 });
    }

    const isSelfEntry = entry.entrant_id !== null;
    const isAuthor = isSelfEntry && entry.entrant_id === auth.entrant.entrant_id;
    const callerInSession = await assertMember(drinkSession.session_id, auth.entrant.entrant_id);

    if (isSelfEntry && !isAuthor) {
      return NextResponse.json({ error: "only the author can edit their own entry" }, { status: 403 });
    }
    if (!isSelfEntry && !callerInSession) {
      return NextResponse.json({ error: "must be a session member to edit a guest entry" }, { status: 403 });
    }

    const update: Record<string, unknown> = {};
    if (body.occurred_at) {
      const t = new Date(body.occurred_at);
      if (Number.isNaN(t.getTime())) {
        return NextResponse.json({ error: "invalid occurred_at" }, { status: 400 });
      }
      update.occurred_at = t.toISOString();
    }
    if (body.payload && typeof body.payload === "object") {
      update.payload = body.payload;
    }
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "nothing to update" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("drink_session_entries")
      .update(update)
      .eq("entry_id", body.id)
      .select("entry_id, session_id, entrant_id, guest_id, kind, payload, occurred_at")
      .single<EntryRow>();
    if (error) throw new Error(error.message);

    return NextResponse.json({ entry: data });
  } catch (err) {
    return NextResponse.json(
      { error: getErrorMessage(err, "Failed to update entry") },
      { status: 500 },
    );
  }
}

// Delete an entry. Self-entries: only the author. Guest entries: any member.
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const auth = await getAuthenticatedEntrant();
    if (!auth) return NextResponse.json({ error: "auth required" }, { status: 401 });

    const { code: rawCode } = await context.params;
    const code = rawCode.toUpperCase();
    const entryId = request.nextUrl.searchParams.get("id");
    if (!entryId) return NextResponse.json({ error: "id required" }, { status: 400 });

    const drinkSession = await loadSession(code);
    if (!drinkSession) {
      return NextResponse.json({ error: "session not found" }, { status: 404 });
    }

    const { data: entry } = await supabaseAdmin
      .from("drink_session_entries")
      .select("entry_id, entrant_id, guest_id, session_id")
      .eq("entry_id", entryId)
      .maybeSingle<{ entry_id: string; entrant_id: string | null; guest_id: string | null; session_id: string }>();
    if (!entry || entry.session_id !== drinkSession.session_id) {
      return NextResponse.json({ error: "entry not found" }, { status: 404 });
    }

    const isSelfEntry = entry.entrant_id !== null;
    const isAuthor = isSelfEntry && entry.entrant_id === auth.entrant.entrant_id;
    const callerInSession = await assertMember(drinkSession.session_id, auth.entrant.entrant_id);

    if (isSelfEntry && !isAuthor) {
      return NextResponse.json({ error: "only the author can delete their own entry" }, { status: 403 });
    }
    if (!isSelfEntry && !callerInSession) {
      return NextResponse.json({ error: "must be a session member to delete a guest entry" }, { status: 403 });
    }

    const { error } = await supabaseAdmin
      .from("drink_session_entries")
      .delete()
      .eq("entry_id", entryId);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: getErrorMessage(err, "Failed to delete entry") },
      { status: 500 },
    );
  }
}
