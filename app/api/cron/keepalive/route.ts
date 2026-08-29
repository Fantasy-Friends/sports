import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const revalidate = 0;

// Touched daily by the Vercel cron (see vercel.json) so the free-tier
// Supabase project registers activity and never auto-pauses. A paused
// project takes the whole app down with instant "fetch failed" errors —
// sign-in dies first because the OAuth callback needs the DB.
export async function GET() {
  const startedAt = Date.now();
  const { error } = await supabaseAdmin
    .from("draft_entrants")
    .select("entrant_id")
    .limit(1);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message, ms: Date.now() - startedAt },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, ms: Date.now() - startedAt });
}
