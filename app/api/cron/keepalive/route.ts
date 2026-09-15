import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const revalidate = 0;

// Touched daily by the Vercel cron (see vercel.json) so the free-tier
// Supabase project registers activity and never auto-pauses. A paused
// project takes the whole app down with instant "fetch failed" errors —
// sign-in dies first because the OAuth callback needs the DB.
//
// This RETRIES rather than firing once: a single failed query means the
// project got no activity ping at all that day, which is exactly when the
// ping matters most. (supabaseAdmin's transport retry only covers *thrown*
// fetch failures; a Supabase-side HTTP 5xx comes back as a returned error and
// would otherwise sail straight through.) It also logs the failure detail —
// returning a 500 body alone never surfaces in Vercel's error tracking, so
// past failures left nothing to diagnose.

function describeDbError(e: {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
}): string {
  return [
    e.code ? `code=${e.code}` : null,
    e.message ? `msg=${e.message}` : null,
    e.details ? `details=${e.details}` : null,
    e.hint ? `hint=${e.hint}` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

export async function GET() {
  const startedAt = Date.now();
  const ATTEMPTS = 3;
  let lastDetail = "unknown";

  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      const { error } = await supabaseAdmin
        .from("draft_entrants")
        .select("entrant_id")
        .limit(1);

      if (!error) {
        if (attempt > 1) {
          console.log(`[keepalive] ok on attempt ${attempt} (${Date.now() - startedAt}ms)`);
        }
        return NextResponse.json({ ok: true, attempts: attempt, ms: Date.now() - startedAt });
      }
      lastDetail = describeDbError(error);
    } catch (err) {
      lastDetail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    }

    console.error(`[keepalive] attempt ${attempt}/${ATTEMPTS} failed: ${lastDetail}`);
    if (attempt < ATTEMPTS) await new Promise((r) => setTimeout(r, 500 * attempt));
  }

  // Every attempt failed — the project got no activity ping today, so this is
  // the signal that it may be heading for an auto-pause.
  console.error(
    `[keepalive] ALL ${ATTEMPTS} ATTEMPTS FAILED after ${Date.now() - startedAt}ms — ` +
      `Supabase may be pausing or unreachable. Last: ${lastDetail}`,
  );
  return NextResponse.json(
    { ok: false, attempts: ATTEMPTS, error: lastDetail, ms: Date.now() - startedAt },
    { status: 500 },
  );
}
