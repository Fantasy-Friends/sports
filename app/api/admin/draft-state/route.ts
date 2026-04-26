import { NextResponse } from "next/server";
import { getAuthenticatedEntrant } from "@/lib/draftAuth";
import { advanceDraftState, buildDraftState, EXPECTED_ENTRANT_COUNT, syncDraftState } from "@/lib/draftOrder";
import { getErrorMessage } from "@/lib/error";
import { supabaseAdmin } from "@/lib/supabase";
import {
  type BroadcastSummary,
  getBaseUrl,
  sendNotificationToAllMembers,
} from "@/lib/notifications/send";
import { renderDraftOpens } from "@/lib/notifications/templates";
import { smsDraftOpens } from "@/lib/notifications/smsTemplates";
import { getCurrentSeasonId } from "@/lib/events/resolve";

export async function POST(req: Request) {
  let body: { pool_id?: string; tournament_slug?: string; draft_open?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const poolId = body.pool_id?.trim();
  const tournamentSlug = body.tournament_slug?.trim();
  const draftOpen = body.draft_open;

  if (!poolId || !tournamentSlug || typeof draftOpen !== "boolean") {
    return NextResponse.json(
      { error: "pool_id, tournament_slug, and draft_open are required." },
      { status: 400 }
    );
  }

  try {
    const session = await getAuthenticatedEntrant(poolId);
    if (!session) {
      return NextResponse.json({ error: "Not authenticated for this pool." }, { status: 401 });
    }
    if (!session.entrant.is_admin) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const { count: entrantCount, error: entrantCountError } = await supabaseAdmin
      .from("draft_entrants")
      .select("*", { count: "exact", head: true })
      .eq("pool_id", poolId);

    if (entrantCountError) {
      return NextResponse.json({ error: entrantCountError.message }, { status: 500 });
    }

    if ((entrantCount ?? 0) !== EXPECTED_ENTRANT_COUNT) {
      return NextResponse.json(
        { error: `Draft requires exactly ${EXPECTED_ENTRANT_COUNT} entrants before opening.` },
        { status: 400 }
      );
    }

    const { data: existingRows, error: loadError } = await supabaseAdmin
      .from("tournament_meta")
      .select("round_count, round_par")
      .eq("pool_id", poolId)
      .eq("tournament_slug", tournamentSlug)
      .limit(1);

    if (loadError) {
      return NextResponse.json({ error: loadError.message }, { status: 500 });
    }

    const existing = (existingRows ?? [])[0] as
      | { round_count?: number | null; round_par?: number | null }
      | undefined;

    const { error } = await supabaseAdmin.from("tournament_meta").upsert(
      {
        pool_id: poolId,
        tournament_slug: tournamentSlug,
        round_count: existing?.round_count ?? 4,
        round_par: existing?.round_par ?? 72,
        draft_open: draftOpen,
      },
      { onConflict: "pool_id,tournament_slug" }
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let summary;
    if (draftOpen) {
      await syncDraftState(poolId, true);
      summary = await advanceDraftState(poolId);
    } else {
      summary = await buildDraftState(poolId);
      const { error: pauseError } = await supabaseAdmin.from("draft_state").upsert(
        {
          pool_id: poolId,
          draft_started: summary.draft_started,
          current_pick: summary.current_pick ?? 1,
          current_round: summary.current_round ?? 1,
          current_entrant_id: summary.current_entrant_id,
          turn_started_at: null,
          turn_expires_at: null,
        },
        { onConflict: "pool_id" }
      );

      if (pauseError) {
        return NextResponse.json({ error: pauseError.message }, { status: 500 });
      }

      summary = {
        ...summary,
        turn_started_at: null,
        turn_expires_at: null,
      };
    }

    let notifications: BroadcastSummary | { error: string } | null = null;
    if (draftOpen) {
      try {
        const seasonId = await getCurrentSeasonId();
        if (seasonId) {
          const { data: event } = await supabaseAdmin
            .from("events")
            .select("name, slug")
            .eq("season_id", seasonId)
            .eq("legacy_pool_id", poolId)
            .maybeSingle<{ name: string; slug: string }>();
          if (event) {
            const email = renderDraftOpens({ name: event.name, slug: event.slug }, getBaseUrl());
            const sms = smsDraftOpens({ name: event.name }, getBaseUrl());
            notifications = await sendNotificationToAllMembers({
              seasonId,
              kind: "draft_opens",
              email,
              sms,
            });
          }
        }
      } catch (notifErr) {
        const message = notifErr instanceof Error ? notifErr.message : String(notifErr);
        console.warn("draft_opens notification failed:", message);
        notifications = { error: message };
      }
    }

    return NextResponse.json({
      ok: true,
      pool_id: poolId,
      tournament_slug: tournamentSlug,
      draft_open: draftOpen,
      draft_started: draftOpen,
      current_pick: draftOpen ? summary.current_pick : null,
      current_round: draftOpen ? summary.current_round : null,
      current_entrant_id: draftOpen ? summary.current_entrant_id : null,
      current_entrant_name: draftOpen ? summary.current_entrant_name : null,
      entrant_count: summary.entrant_count,
      expected_entrant_count: EXPECTED_ENTRANT_COUNT,
      total_picks: summary.total_picks,
      max_picks: summary.max_picks,
      is_complete: summary.is_complete,
      turn_started_at: draftOpen ? summary.turn_started_at : null,
      turn_expires_at: draftOpen ? summary.turn_expires_at : null,
      notifications,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(error, "Failed to update draft state.") },
      { status: 500 }
    );
  }
}
