import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthenticatedEntrant } from "@/lib/draftAuth";
import { getErrorMessage } from "@/lib/error";

export const revalidate = 0;

type SubscriptionBody = {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
};

// POST /api/push/subscribe  body: PushSubscription.toJSON()
// Saves (or re-points) this device's subscription to the signed-in entrant.
export async function POST(request: NextRequest) {
  try {
    const session = await getAuthenticatedEntrant();
    if (!session) return NextResponse.json({ error: "auth required" }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as SubscriptionBody;
    const endpoint = body.endpoint;
    const p256dh = body.keys?.p256dh;
    const auth = body.keys?.auth;
    if (!endpoint || !p256dh || !auth || !/^https:\/\//.test(endpoint)) {
      return NextResponse.json({ error: "invalid subscription" }, { status: 400 });
    }

    const { entrant } = session;
    const { error } = await supabaseAdmin.from("push_subscriptions").upsert(
      {
        entrant_id: entrant.entrant_id,
        person_key: entrant.person_key,
        google_email: entrant.google_email?.toLowerCase() ?? null,
        endpoint,
        p256dh,
        auth,
        user_agent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
        failure_count: 0,
      },
      { onConflict: "endpoint" },
    );
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: getErrorMessage(err, "Failed to save subscription") },
      { status: 500 },
    );
  }
}

// DELETE /api/push/subscribe  body: { endpoint }
export async function DELETE(request: NextRequest) {
  try {
    const session = await getAuthenticatedEntrant();
    if (!session) return NextResponse.json({ error: "auth required" }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as { endpoint?: string };
    if (!body.endpoint) return NextResponse.json({ error: "endpoint required" }, { status: 400 });

    const { error } = await supabaseAdmin
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", body.endpoint);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: getErrorMessage(err, "Failed to remove subscription") },
      { status: 500 },
    );
  }
}
