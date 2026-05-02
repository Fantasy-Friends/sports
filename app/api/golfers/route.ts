import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type GolferRow = {
  rank: number | null;
  golfer: string;
  handicap: number | null;
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const poolId =
    url.searchParams.get("pool_id") ||
    process.env.POOL_ID ||
    "2026-majors";

  const { data, error } = await supabaseAdmin
    .from("golfers")
    .select("rank, golfer, handicap")
    .eq("pool_id", poolId)
    .order("rank", { ascending: true })
    .order("golfer", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const golfers =
    (data ?? []).map((row: GolferRow) => ({
      id: row.golfer,
      rank: row.rank ?? 9999,
      golfer: row.golfer,
      handicap: row.handicap ?? 0,
    })) ?? [];

  return NextResponse.json({ ok: true, poolId, golfers });
}
