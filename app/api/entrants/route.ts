import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type EntrantRow = {
  entrant_id: string;
  entrant_name: string;
  entrant_slug: string;
  draft_position: number | null;
  is_admin: boolean;
  auto_draft_enabled: boolean | null;
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const poolId =
    url.searchParams.get("pool_id") ||
    process.env.POOL_ID ||
    process.env.NEXT_PUBLIC_POOL_ID ||
    "2026-majors";

  const { data, error } = await supabaseAdmin
    .from("draft_entrants")
    .select("entrant_id, entrant_name, entrant_slug, draft_position, is_admin, auto_draft_enabled")
    .eq("pool_id", poolId)
    .order("draft_position", { ascending: true, nullsFirst: false })
    .order("entrant_name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    poolId,
    entrants: (data ?? []) as EntrantRow[],
  });
}
