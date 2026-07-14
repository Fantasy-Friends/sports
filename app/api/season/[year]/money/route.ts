import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthenticatedEntrant } from "@/lib/draftAuth";
import { getErrorMessage } from "@/lib/error";
import { buildMoneyLedger, type MoneyEvent } from "@/lib/events/money";

export const revalidate = 0;

type SeasonRow = { season_id: string; year: number; label: string };
type MemberRow = { entrant_id: string; display_name: string; seat_order: number | null };
type EventRow = {
  event_id: string;
  name: string;
  slug: string;
  status: string;
  config: Record<string, unknown> | null;
};
type FinishRow = { event_id: string; entrant_id: string; finish_rank: number };

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ year: string }> },
) {
  try {
    const auth = await getAuthenticatedEntrant();
    if (!auth) return NextResponse.json({ error: "auth required" }, { status: 401 });

    const { year } = await context.params;
    const yearNum = Number(year);
    if (!Number.isFinite(yearNum)) {
      return NextResponse.json({ error: "invalid year" }, { status: 400 });
    }

    const { data: season } = await supabaseAdmin
      .from("seasons")
      .select("season_id, year, label")
      .eq("year", yearNum)
      .maybeSingle<SeasonRow>();
    if (!season) return NextResponse.json({ season: null, ledger: null });

    const [{ data: members }, { data: events }] = await Promise.all([
      supabaseAdmin
        .from("season_members")
        .select("entrant_id, display_name, seat_order")
        .eq("season_id", season.season_id)
        .order("seat_order", { ascending: true }),
      supabaseAdmin
        .from("events")
        .select("event_id, name, slug, status, config")
        .eq("season_id", season.season_id)
        .eq("status", "final"),
    ]);

    const memberRows = (members ?? []) as MemberRow[];
    const eventRows = (events ?? []) as EventRow[];

    // Load finishes for the finalized events.
    const eventIds = eventRows.map((e) => e.event_id);
    let finishRows: FinishRow[] = [];
    if (eventIds.length > 0) {
      const { data: finishes } = await supabaseAdmin
        .from("event_finishes")
        .select("event_id, entrant_id, finish_rank")
        .in("event_id", eventIds);
      finishRows = (finishes ?? []) as FinishRow[];
    }

    const finishesByEvent = new Map<string, FinishRow[]>();
    for (const f of finishRows) {
      const arr = finishesByEvent.get(f.event_id) ?? [];
      arr.push(f);
      finishesByEvent.set(f.event_id, arr);
    }

    const moneyEvents: MoneyEvent[] = eventRows.map((e) => {
      const feeRaw = e.config?.entry_fee;
      return {
        event_id: e.event_id,
        name: e.name,
        slug: e.slug,
        entry_fee: typeof feeRaw === "number" ? feeRaw : null,
        finishes: (finishesByEvent.get(e.event_id) ?? []).map((f) => ({
          entrant_id: f.entrant_id,
          finish_rank: Number(f.finish_rank),
        })),
      };
    });

    const ledger = buildMoneyLedger(
      memberRows.map((m) => ({ entrant_id: m.entrant_id, display_name: m.display_name })),
      moneyEvents,
    );

    return NextResponse.json({ season, ledger, me: auth.entrant.entrant_id });
  } catch (err) {
    return NextResponse.json(
      { error: getErrorMessage(err, "Failed to load money ledger") },
      { status: 500 },
    );
  }
}
