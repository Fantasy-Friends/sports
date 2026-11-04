import { NextRequest, NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/error";
import { runNflNotifications } from "@/lib/notifications/nflSchedule";

export const revalidate = 0;
export const maxDuration = 60;

// Time-based notifications. Called every 5 minutes by a Supabase pg_cron job
// (see supabase/20261103_notify_cron.sql). Every check inside is idempotent,
// so running more often or twice in a row never double-sends.
//
// Auth: `Authorization: Bearer <CRON_SECRET>`.
// Add `?dry=1` to see who WOULD be notified right now without sending.
async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const dryRun = request.nextUrl.searchParams.get("dry") === "1";
  try {
    const nfl = await runNflNotifications({ dryRun });
    return NextResponse.json({ ok: true, dry_run: dryRun, nfl });
  } catch (err) {
    const message = getErrorMessage(err, "notify cron failed");
    console.error("[cron/notify]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
