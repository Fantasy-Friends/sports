import { NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/error";
import { isDraftWindowOpen } from "@/lib/draftOrder";
import { supabaseAdmin } from "@/lib/supabase";

// draft_open flips during live draft management — stale reads would let a
// locked draft still accept picks on someone's cached view. Always fetch fresh.
export const dynamic = "force-dynamic";
export const revalidate = 0;

type TournamentMetaRow = {
  tournament_slug: string;
  round_count: number | null;
  round_par: number | null;
  draft_open: boolean | null;
};

function labelFromSlug(slug: string) {
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const poolId =
    url.searchParams.get("pool_id") ||
    process.env.POOL_ID ||
    process.env.NEXT_PUBLIC_POOL_ID ||
    "2026-majors";

  try {
    const { data, error } = await supabaseAdmin
      .from("tournament_meta")
      .select("tournament_slug, round_count, round_par, draft_open")
      .eq("pool_id", poolId)
      .order("tournament_slug", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = ((data ?? []) as TournamentMetaRow[]).map((row) => ({
      tournament_slug: row.tournament_slug,
      label: labelFromSlug(row.tournament_slug),
      round_count: row.round_count ?? 4,
      round_par: row.round_par ?? 72,
      draft_open: row.draft_open ?? false,
      draft_active_now: (row.draft_open ?? false) && isDraftWindowOpen(),
    }));

    return NextResponse.json(
      { ok: true, poolId, rows },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(error, "Failed to load tournament metadata.") },
      { status: 500 }
    );
  }
}
