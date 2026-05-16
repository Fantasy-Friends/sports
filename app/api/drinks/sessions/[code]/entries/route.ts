import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
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
  entrant_id: string;
  kind: "drink" | "caffeine" | "water" | "substance";
  payload: Record<string, unknown>;
  occurred_at: string;
};

const VALID_KINDS = new Set(["drink", "caffeine", "water", "substance"]);

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

// Log a drink / caffeine / water / substance entry.
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

    const occurredAt = body.occurred_at ? new Date(body.occurred_at) : new Date();
    if (Number.isNaN(occurredAt.getTime())) {
      return NextResponse.json({ error: "invalid occurred_at" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("drink_session_entries")
      .insert({
        session_id: drinkSession.session_id,
        entrant_id: auth.entrant.entrant_id,
        kind: body.kind,
        payload: body.payload ?? {},
        occurred_at: occurredAt.toISOString(),
      })
      .select("entry_id, session_id, entrant_id, kind, payload, occurred_at")
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

// Delete an entry I logged (or that I'm the session creator for cleanup).
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
      .select("entry_id, entrant_id, session_id")
      .eq("entry_id", entryId)
      .maybeSingle<{ entry_id: string; entrant_id: string; session_id: string }>();
    if (!entry || entry.session_id !== drinkSession.session_id) {
      return NextResponse.json({ error: "entry not found" }, { status: 404 });
    }
    if (entry.entrant_id !== auth.entrant.entrant_id) {
      return NextResponse.json({ error: "you can only delete your own entries" }, { status: 403 });
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
