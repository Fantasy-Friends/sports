import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthenticatedEntrant } from "@/lib/draftAuth";
import { getErrorMessage } from "@/lib/error";
import { TOPGARAGE_ENTRY_FEE } from "@/lib/events/money";

export const revalidate = 0;

type FinishRow = { entrant_id: string; finish_rank: number };
type EventRow = { event_id: string; season_id: string; status: string; config: Record<string, unknown> | null };

// Mark (or un-mark) a debt as paid. The caller is always the PAYEE — a winner
// checking off a loser who has squared up. Body: { event_id, payer_entrant_id,
// paid }. Verifies the caller actually won the event and the payer actually
// lost it before writing.
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedEntrant();
    if (!auth) return NextResponse.json({ error: "auth required" }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as {
      event_id?: string;
      payer_entrant_id?: string;
      paid?: boolean;
    };
    const eventId = body.event_id?.trim();
    const payerId = body.payer_entrant_id?.trim();
    const paid = body.paid !== false; // default true
    if (!eventId || !payerId) {
      return NextResponse.json({ error: "event_id and payer_entrant_id are required" }, { status: 400 });
    }
    const payeeId = auth.entrant.entrant_id; // the winner marking their own incoming debt

    const { data: event } = await supabaseAdmin
      .from("events")
      .select("event_id, season_id, status, config")
      .eq("event_id", eventId)
      .maybeSingle<EventRow>();
    if (!event) return NextResponse.json({ error: "event not found" }, { status: 404 });
    if (event.status !== "final") {
      return NextResponse.json({ error: "event is not final yet" }, { status: 409 });
    }

    const { data: finishes } = await supabaseAdmin
      .from("event_finishes")
      .select("entrant_id, finish_rank")
      .eq("event_id", eventId);
    const finishRows = ((finishes ?? []) as FinishRow[]).map((f) => ({
      entrant_id: f.entrant_id,
      finish_rank: Number(f.finish_rank),
    }));
    if (finishRows.length === 0) {
      return NextResponse.json({ error: "no finishes for this event" }, { status: 409 });
    }

    const minRank = Math.min(...finishRows.map((f) => f.finish_rank));
    const winners = finishRows.filter((f) => f.finish_rank === minRank);
    const isWinner = winners.some((w) => w.entrant_id === payeeId);
    const payerRow = finishRows.find((f) => f.entrant_id === payerId);
    const payerIsLoser = !!payerRow && payerRow.finish_rank !== minRank;

    if (!isWinner) {
      return NextResponse.json({ error: "only the event winner can mark debts paid" }, { status: 403 });
    }
    if (!payerIsLoser) {
      return NextResponse.json({ error: "that player did not owe you for this event" }, { status: 400 });
    }

    const feeRaw = event.config?.entry_fee;
    const fee = typeof feeRaw === "number" && feeRaw > 0 ? feeRaw : TOPGARAGE_ENTRY_FEE;
    const amount = fee / winners.length;

    if (paid) {
      const { error } = await supabaseAdmin
        .from("event_settlements")
        .upsert(
          {
            event_id: eventId,
            payer_entrant_id: payerId,
            payee_entrant_id: payeeId,
            amount,
            marked_by: payeeId,
            marked_at: new Date().toISOString(),
          },
          { onConflict: "event_id,payer_entrant_id,payee_entrant_id" },
        );
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from("event_settlements")
        .delete()
        .eq("event_id", eventId)
        .eq("payer_entrant_id", payerId)
        .eq("payee_entrant_id", payeeId);
      if (error) throw new Error(error.message);
    }

    return NextResponse.json({ ok: true, event_id: eventId, payer_entrant_id: payerId, paid, amount });
  } catch (err) {
    return NextResponse.json(
      { error: getErrorMessage(err, "Failed to update settlement") },
      { status: 500 },
    );
  }
}
