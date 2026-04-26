import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getAuthenticatedEntrant } from "@/lib/draftAuth";
import { getEventBySlug, getCurrentSeasonId } from "@/lib/events/resolve";
import { getEventHandler } from "@/lib/events/registry";
import { getErrorMessage } from "@/lib/error";
import {
  type BroadcastSummary,
  getBaseUrl,
  sendNotificationToAllMembers,
} from "@/lib/notifications/send";
import { renderEventFinal } from "@/lib/notifications/templates";
import { smsEventFinal } from "@/lib/notifications/smsTemplates";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { slug?: string };
    const slug = body.slug;
    if (!slug) {
      return NextResponse.json({ error: "slug required" }, { status: 400 });
    }

    const session = await getAuthenticatedEntrant();
    if (!session?.entrant.is_admin) {
      return NextResponse.json({ error: "admin required" }, { status: 403 });
    }

    const seasonId = await getCurrentSeasonId();
    if (!seasonId) return NextResponse.json({ error: "no active season" }, { status: 404 });

    const event = await getEventBySlug(slug, seasonId);
    if (!event) return NextResponse.json({ error: "event not found" }, { status: 404 });

    const handler = getEventHandler(event);

    const wasAlreadyFinal = event.status === "final";

    const { data: entries } = await supabaseAdmin
      .from("event_entries")
      .select("entrant_id, payload")
      .eq("event_id", event.event_id);

    const finishes = await handler.computeFinishes({
      event,
      entries: (entries ?? []).map((e) => ({
        entrant_id: e.entrant_id as string,
        payload: e.payload as unknown,
      })),
    });

    if (finishes.length === 0) {
      return NextResponse.json(
        { error: "no finishes computed (handler returned empty)" },
        { status: 400 },
      );
    }

    // Upsert finishes.
    const finishRows = finishes.map((f) => ({
      event_id: event.event_id,
      entrant_id: f.entrant_id,
      finish_rank: f.finish_rank,
      raw_score: f.raw_score,
      base_points: f.base_points,
      awarded_points: f.awarded_points,
      tie_break_notes: f.tie_break_notes ?? null,
      computed_at: new Date().toISOString(),
    }));

    const { error: finishErr } = await supabaseAdmin
      .from("event_finishes")
      .upsert(finishRows, { onConflict: "event_id,entrant_id" });
    if (finishErr) throw new Error(finishErr.message);

    // Bonuses
    const bonuses = handler.emitBonuses
      ? await handler.emitBonuses({
          event,
          entries: (entries ?? []).map((e) => ({
            entrant_id: e.entrant_id as string,
            payload: e.payload as unknown,
          })),
          finishes,
        })
      : [];

    if (bonuses.length > 0) {
      // Remove prior bonuses for this event to make finalize idempotent.
      await supabaseAdmin
        .from("bonus_awards")
        .delete()
        .eq("event_id", event.event_id);

      const bonusRows = bonuses.map((b) => ({
        season_id: seasonId,
        event_id: event.event_id,
        entrant_id: b.entrant_id,
        bonus_type: b.bonus_type,
        points: b.points,
        note: b.note ?? null,
      }));
      const { error: bonusErr } = await supabaseAdmin.from("bonus_awards").insert(bonusRows);
      if (bonusErr) throw new Error(bonusErr.message);
    }

    // Flip event status to final.
    const { error: updErr } = await supabaseAdmin
      .from("events")
      .update({ status: "final", updated_at: new Date().toISOString() })
      .eq("event_id", event.event_id);
    if (updErr) throw new Error(updErr.message);

    // Fire event_final notification only on the first finalization. Re-running
    // finalize (to recompute after a data fix, etc.) should not re-broadcast.
    if (wasAlreadyFinal) {
      return NextResponse.json({
        ok: true,
        already_final: true,
        finishes: finishRows,
        bonuses,
      });
    }

    let notifications: BroadcastSummary | { error: string } | null = null;
    try {
      const { data: members } = await supabaseAdmin
        .from("season_members")
        .select("entrant_id, display_name")
        .eq("season_id", seasonId);
      const nameById = new Map<string, string>();
      for (const m of members ?? []) nameById.set(m.entrant_id, m.display_name);

      const podium = finishRows
        .slice()
        .sort((a, b) => a.finish_rank - b.finish_rank)
        .slice(0, 3)
        .map((f) => ({
          display_name: nameById.get(f.entrant_id) ?? "Player",
          awarded_points: f.awarded_points,
        }));

      const email = renderEventFinal({ name: event.name, slug: event.slug }, podium, getBaseUrl());
      const sms = podium[0]
        ? smsEventFinal({ name: event.name }, podium[0].display_name, podium[0].awarded_points, getBaseUrl())
        : undefined;
      notifications = await sendNotificationToAllMembers({
        seasonId,
        kind: "event_final",
        email,
        sms,
      });
    } catch (notifErr) {
      const message = notifErr instanceof Error ? notifErr.message : String(notifErr);
      console.warn("event_final notification failed:", message);
      notifications = { error: message };
    }

    return NextResponse.json({
      ok: true,
      finishes: finishRows,
      bonuses: bonuses,
      notifications,
    });
  } catch (err) {
    return NextResponse.json(
      { error: getErrorMessage(err, "Failed to finalize event") },
      { status: 500 },
    );
  }
}
