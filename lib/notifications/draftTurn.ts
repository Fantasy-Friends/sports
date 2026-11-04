import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { DraftStateSummary } from "@/lib/draftOrder";
import { getBaseUrl, sendNotification } from "./send";
import { renderDraftTurn } from "./templates";
import { smsDraftTurn } from "./smsTemplates";
import { pushDraftTurn } from "./pushTemplates";

// "You're on the clock" — sent once per (pool, pick, entrant).
//
// Called after every advanceDraftState(), which runs on picks, auto-picks,
// turn timeouts and every draft-state poll. The dedupe row makes it safe to
// call that often: only the first caller for a given pick sends anything.

// Per-instance memo so polling doesn't hit the DB for keys we've already handled.
const handled = new Set<string>();

async function eventNameForPool(poolId: string) {
  const { data } = await supabaseAdmin
    .from("events")
    .select("name")
    .eq("legacy_pool_id", poolId)
    .limit(1)
    .maybeSingle<{ name: string }>();
  return data?.name ?? "the draft";
}

export async function notifyOnClock(poolId: string, summary: DraftStateSummary) {
  if (
    !summary.draft_started ||
    summary.is_complete ||
    !summary.current_entrant_id ||
    !summary.current_pick ||
    !summary.turn_started_at
  ) {
    return;
  }

  const key = `draft_turn:${poolId}:${summary.current_pick}:${summary.current_entrant_id}`;
  if (handled.has(key)) return;
  handled.add(key);

  // Claim the key. A duplicate-key error means another request already sent
  // it; any other error (e.g. migration not run) also means "don't send".
  const { error } = await supabaseAdmin.from("notification_dedupe").insert({ dedupe_key: key });
  if (error) return;

  const name = await eventNameForPool(poolId);
  const baseUrl = getBaseUrl();
  await sendNotification({
    entrantId: summary.current_entrant_id,
    kind: "draft_turn",
    email: renderDraftTurn({ name }, baseUrl),
    sms: smsDraftTurn({ name }, baseUrl),
    push: pushDraftTurn(
      { name },
      {
        round: summary.current_round,
        pick: summary.current_pick,
        expiresAt: summary.turn_expires_at,
      },
    ),
  });
}
