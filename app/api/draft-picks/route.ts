import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const poolId =
    url.searchParams.get("pool_id") ||
    process.env.POOL_ID ||
    "2026-majors";

  const { data, error } = await supabaseAdmin
    .from("draft_picks")
    .select("entrant_name, golfer, pick_number")
    .eq("pool_id", poolId)
    .order("entrant_name", { ascending: true })
    .order("pick_number", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { ok: true, poolId, rows: data ?? [] },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}

export async function POST(req: Request) {
  void req;
  return NextResponse.json(
    {
      error: "Full-board draft writes are disabled. Use /api/draft-picks/add and /api/draft-picks/remove.",
    },
    { status: 410 }
  );
}
