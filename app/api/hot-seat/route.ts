import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getAuthenticatedEntrant } from "@/lib/draftAuth";
import { getCurrentSeasonId } from "@/lib/events/resolve";
import { entrantForWeek, weekStartFor, isLongshotOdds } from "@/lib/hotSeat/rotation";
import { getErrorMessage } from "@/lib/error";
import {
  type BroadcastSummary,
  getBaseUrl,
  sendNotificationToAllMembers,
} from "@/lib/notifications/send";
import { renderHotSeatDeclared } from "@/lib/notifications/templates";
import { smsHotSeatDeclared } from "@/lib/notifications/smsTemplates";

export const revalidate = 0;

// GET /api/hot-seat → current week's card + recent archive (last 6 weeks).
export async function GET() {
  try {
    const seasonId = await getCurrentSeasonId();
    if (!seasonId) return NextResponse.json({ current: null, archive: [] });

    const weekStart = weekStartFor(new Date());
    const scheduled = await entrantForWeek(seasonId, weekStart);

    const { data: current } = await supabaseAdmin
      .from("hot_seat_weeks")
      .select("*")
      .eq("season_id", seasonId)
      .eq("week_start", weekStart)
      .maybeSingle();

    const { data: archive } = await supabaseAdmin
      .from("hot_seat_weeks")
      .select("*")
      .eq("season_id", seasonId)
      .neq("week_start", weekStart)
      .order("week_start", { ascending: false })
      .limit(6);

    const { data: votes } = current
      ? await supabaseAdmin
          .from("hot_seat_vetos")
          .select("voter_entrant_id, vote")
          .eq("hot_seat_id", current.hot_seat_id)
      : { data: [] };

    const { data: members } = await supabaseAdmin
      .from("season_members")
      .select("entrant_id, display_name")
      .eq("season_id", seasonId);

    return NextResponse.json({
      scheduled,
      current,
      archive: archive ?? [],
      votes: votes ?? [],
      members: members ?? [],
      week_start: weekStart,
    });
  } catch (err) {
    return NextResponse.json(
      { error: getErrorMessage(err, "Failed to load hot seat") },
      { status: 500 },
    );
  }
}

// POST /api/hot-seat → declare the hot-seat take for this week (scheduled
// entrant only). Rejects if already declared or odds too short.
export async function POST(request: NextRequest) {
  try {
    const session = await getAuthenticatedEntrant();
    if (!session) return NextResponse.json({ error: "auth required" }, { status: 401 });

    const seasonId = await getCurrentSeasonId();
    if (!seasonId) return NextResponse.json({ error: "no active season" }, { status: 404 });

    const weekStart = weekStartFor(new Date());
    const scheduled = await entrantForWeek(seasonId, weekStart);
    if (!scheduled) return NextResponse.json({ error: "no rotation available" }, { status: 500 });

    // Resolve session entrant's canonical season_members entrant_id via person_key.
    const { data: myEntrant } = await supabaseAdmin
      .from("draft_entrants")
      .select("person_key")
      .eq("entrant_id", session.entrant.entrant_id)
      .maybeSingle<{ person_key: string | null }>();

    let canonicalId = session.entrant.entrant_id;
    if (myEntrant?.person_key) {
      const { data: membership } = await supabaseAdmin
        .from("season_members")
        .select("entrant_id, draft_entrants!inner(person_key)")
        .eq("season_id", seasonId);
      type MembershipRow = {
        entrant_id: string;
        draft_entrants: { person_key: string | null } | { person_key: string | null }[] | null;
      };
      for (const row of (membership ?? []) as MembershipRow[]) {
        const related = Array.isArray(row.draft_entrants) ? row.draft_entrants[0] : row.draft_entrants;
        if (related?.person_key === myEntrant.person_key) {
          canonicalId = row.entrant_id;
          break;
        }
      }
    }

    if (canonicalId !== scheduled.entrant_id) {
      return NextResponse.json({ error: "not your week" }, { status: 403 });
    }

    // Prevent re-declaring once the voting window has started. Double-submits
    // would otherwise re-fire notifications to every member.
    const { data: existing } = await supabaseAdmin
      .from("hot_seat_weeks")
      .select("status")
      .eq("season_id", seasonId)
      .eq("week_start", weekStart)
      .maybeSingle<{ status: string }>();

    if (existing && existing.status !== "awaiting") {
      return NextResponse.json(
        { error: "already declared for this week" },
        { status: 409 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      declaration_text?: string;
      bet_details?: string;
      odds_american?: number;
    };

    const declaration = body.declaration_text?.trim();
    const bet = body.bet_details?.trim();
    const odds = Number(body.odds_american);

    if (!declaration || declaration.length < 4) {
      return NextResponse.json({ error: "declaration required" }, { status: 400 });
    }
    if (!bet) {
      return NextResponse.json({ error: "bet_details required" }, { status: 400 });
    }
    if (!isLongshotOdds(odds)) {
      return NextResponse.json(
        { error: "odds must be +400 or longer" },
        { status: 400 },
      );
    }

    const now = new Date();
    const vetoDeadline = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const { data, error } = await supabaseAdmin
      .from("hot_seat_weeks")
      .upsert(
        {
          season_id: seasonId,
          week_start: weekStart,
          entrant_id: canonicalId,
          declaration_text: declaration,
          bet_details: bet,
          odds_american: Math.round(odds),
          declared_at: now.toISOString(),
          veto_deadline: vetoDeadline.toISOString(),
          status: "pending",
        },
        { onConflict: "season_id,week_start" },
      )
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);

    let notifications: BroadcastSummary | { error: string } | null = null;
    try {
      const email = renderHotSeatDeclared(
        scheduled.display_name,
        declaration,
        Math.round(odds),
        vetoDeadline.toISOString(),
        getBaseUrl(),
      );
      const sms = smsHotSeatDeclared(scheduled.display_name, declaration, getBaseUrl());
      notifications = await sendNotificationToAllMembers({
        seasonId,
        kind: "hot_seat_declared",
        email,
        sms,
        excludeEntrantIds: [canonicalId],
      });
    } catch (notifErr) {
      const message = notifErr instanceof Error ? notifErr.message : String(notifErr);
      console.warn("hot_seat_declared notification failed:", message);
      notifications = { error: message };
    }

    return NextResponse.json({ ok: true, hot_seat: data, notifications });
  } catch (err) {
    return NextResponse.json(
      { error: getErrorMessage(err, "Failed to declare") },
      { status: 500 },
    );
  }
}
