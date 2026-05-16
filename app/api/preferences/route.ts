import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthenticatedEntrant } from "@/lib/draftAuth";
import { isE164 } from "@/lib/notifications/twilio";
import { getErrorMessage } from "@/lib/error";

export const revalidate = 0;

type PrefsShape = Record<string, unknown>;

export async function GET() {
  try {
    const session = await getAuthenticatedEntrant();
    if (!session) return NextResponse.json({ error: "auth required" }, { status: 401 });

    const { data } = await supabaseAdmin
      .from("notification_preferences")
      .select("email, phone_e164, prefs")
      .eq("entrant_id", session.entrant.entrant_id)
      .maybeSingle<{ email: string | null; phone_e164: string | null; prefs: PrefsShape | null }>();

    return NextResponse.json({
      email: data?.email ?? null,
      phone_e164: data?.phone_e164 ?? null,
      prefs: data?.prefs ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: getErrorMessage(err, "Failed to load preferences") },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getAuthenticatedEntrant();
    if (!session) return NextResponse.json({ error: "auth required" }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as {
      email?: string | null;
      phone_e164?: string | null;
      prefs?: PrefsShape;
    };

    if (body.phone_e164 && !isE164(body.phone_e164)) {
      return NextResponse.json(
        { error: "phone_e164 must be E.164 format, e.g. +15551234567" },
        { status: 400 },
      );
    }

    const row: Record<string, unknown> = {
      entrant_id: session.entrant.entrant_id,
      email: body.email ?? null,
      phone_e164: body.phone_e164 ?? null,
      updated_at: new Date().toISOString(),
    };
    if (body.prefs !== undefined) row.prefs = body.prefs;

    const { error } = await supabaseAdmin
      .from("notification_preferences")
      .upsert(row, { onConflict: "entrant_id" });
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: getErrorMessage(err, "Failed to save preferences") },
      { status: 500 },
    );
  }
}
