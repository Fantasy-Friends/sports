import { NextResponse } from "next/server";
import { getAuthenticatedEntrant } from "@/lib/draftAuth";
import { getErrorMessage } from "@/lib/error";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type LotteryRow = {
  lottery_id: string;
  pool_id: string;
  scheduled_at: string | null;
  started_at: string | null;
  status: string;
  result: unknown;
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const poolId = url.searchParams.get("pool_id")?.trim();
  if (!poolId) {
    return NextResponse.json({ error: "pool_id is required." }, { status: 400 });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("draft_lottery")
      .select("lottery_id, pool_id, scheduled_at, started_at, status, result")
      .eq("pool_id", poolId)
      .maybeSingle<LotteryRow>();

    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, lottery: data ?? null });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(error, "Failed to load lottery config.") },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  let body: { pool_id?: string; scheduled_at?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const poolId = body.pool_id?.trim();
  if (!poolId) {
    return NextResponse.json({ error: "pool_id is required." }, { status: 400 });
  }

  try {
    const session = await getAuthenticatedEntrant(poolId);
    if (!session) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }
    if (!session.entrant.is_admin) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const { data, error } = await supabaseAdmin
      .from("draft_lottery")
      .upsert(
        {
          pool_id: poolId,
          scheduled_at: body.scheduled_at ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "pool_id" }
      )
      .select("lottery_id, pool_id, scheduled_at, started_at, status, result")
      .single<LotteryRow>();

    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, lottery: data });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(error, "Failed to save lottery config.") },
      { status: 500 }
    );
  }
}
