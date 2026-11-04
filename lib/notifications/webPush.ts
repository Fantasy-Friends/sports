import webpush from "web-push";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Web push sender. Delivers to every device a person has subscribed, across
// all their per-pool entrant rows.
//
// Env:
//   NEXT_PUBLIC_VAPID_PUBLIC_KEY  — public key (also used by the browser to subscribe)
//   VAPID_PRIVATE_KEY             — private key, server only
//   VAPID_SUBJECT                 — contact for push services, e.g. mailto:you@example.com
// Generate a pair once with: npx web-push generate-vapid-keys

export type PushPayload = {
  title: string;
  body: string;
  /** Path to open when tapped, e.g. "/draft". */
  url: string;
  /** Same tag replaces an older notification instead of stacking. */
  tag?: string;
};

export type PushSendResult =
  | { skipped: "not_configured" | "no_subscriptions" }
  | { ok: true; delivered: number; failed: number; removed: number }
  | { ok: false; error: string; failed: number; removed: number };

type SubscriptionRow = {
  subscription_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  failure_count: number;
};

let configured: boolean | null = null;

export function isPushConfigured() {
  if (configured !== null) return configured;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    configured = false;
    return false;
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@example.com",
    publicKey,
    privateKey,
  );
  configured = true;
  return true;
}

// Give up on a subscription after this many consecutive non-expiry failures.
const MAX_FAILURES = 5;

async function loadSubscriptionsForEntrant(entrantId: string): Promise<SubscriptionRow[]> {
  const { data: entrant } = await supabaseAdmin
    .from("draft_entrants")
    .select("person_key, google_email")
    .eq("entrant_id", entrantId)
    .maybeSingle<{ person_key: string | null; google_email: string | null }>();

  const cols = "subscription_id, endpoint, p256dh, auth, failure_count";
  const queries = [
    supabaseAdmin.from("push_subscriptions").select(cols).eq("entrant_id", entrantId),
  ];
  if (entrant?.person_key) {
    queries.push(
      supabaseAdmin.from("push_subscriptions").select(cols).eq("person_key", entrant.person_key),
    );
  }
  if (entrant?.google_email) {
    queries.push(
      supabaseAdmin
        .from("push_subscriptions")
        .select(cols)
        .eq("google_email", entrant.google_email.toLowerCase()),
    );
  }

  const results = await Promise.all(queries);
  const byId = new Map<string, SubscriptionRow>();
  for (const r of results) {
    for (const row of (r.data ?? []) as SubscriptionRow[]) byId.set(row.subscription_id, row);
  }
  return [...byId.values()];
}

export async function sendPushToEntrant(
  entrantId: string,
  payload: PushPayload,
): Promise<PushSendResult> {
  if (!isPushConfigured()) return { skipped: "not_configured" };

  const subs = await loadSubscriptionsForEntrant(entrantId);
  if (subs.length === 0) return { skipped: "no_subscriptions" };

  const body = JSON.stringify(payload);
  let delivered = 0;
  let failed = 0;
  let removed = 0;
  let lastError = "";

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
          { TTL: 60 * 60 * 6, urgency: "high" },
        );
        delivered += 1;
        await supabaseAdmin
          .from("push_subscriptions")
          .update({ last_success_at: new Date().toISOString(), failure_count: 0 })
          .eq("subscription_id", sub.subscription_id);
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        // 404/410 = the device unsubscribed or the subscription expired.
        if (statusCode === 404 || statusCode === 410 || sub.failure_count + 1 >= MAX_FAILURES) {
          removed += 1;
          await supabaseAdmin
            .from("push_subscriptions")
            .delete()
            .eq("subscription_id", sub.subscription_id);
          if (statusCode === 404 || statusCode === 410) return;
        } else {
          await supabaseAdmin
            .from("push_subscriptions")
            .update({
              last_failure_at: new Date().toISOString(),
              failure_count: sub.failure_count + 1,
            })
            .eq("subscription_id", sub.subscription_id);
        }
        failed += 1;
        lastError = err instanceof Error ? err.message : String(err);
      }
    }),
  );

  if (delivered === 0 && failed > 0) return { ok: false, error: lastError, failed, removed };
  return { ok: true, delivered, failed, removed };
}
