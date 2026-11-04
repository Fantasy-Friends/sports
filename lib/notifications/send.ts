import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendViaResend } from "./resend";
import { sendViaTwilio, isE164 } from "./twilio";
import type { RenderedEmail } from "./templates";
import type { RenderedSms } from "./smsTemplates";
import type { RenderedPush } from "./pushTemplates";
import { sendPushToEntrant } from "./webPush";

export type NotificationKind =
  | "draft_opens"
  | "draft_turn"
  | "turn_timer_warn"
  | "event_lock"
  | "event_final"
  | "hot_seat_declared"
  | "hot_seat_veto"
  | "season_digest"
  | "nfl_pick_reminder"
  | "nfl_week_results";

type PrefsShape = Record<string, boolean> & {
  sms?: Record<string, boolean>;
  push?: Record<string, boolean>;
};

type PrefsRow = {
  email: string | null;
  phone_e164: string | null;
  prefs: PrefsShape | null;
};

export type SendChannelResult =
  | { skipped: "opted_out" | "no_email" | "no_phone" | "no_device" | "not_configured" }
  | { ok: true; id: string }
  | { ok: false; error: string };

export type SendResult = {
  email: SendChannelResult;
  sms: SendChannelResult;
  push: SendChannelResult;
};

export async function sendNotification(args: {
  entrantId: string;
  kind: NotificationKind;
  email?: RenderedEmail;
  sms?: RenderedSms;
  push?: RenderedPush;
}): Promise<SendResult> {
  const { entrantId, kind, email, sms, push } = args;

  const { data } = await supabaseAdmin
    .from("notification_preferences")
    .select("email, phone_e164, prefs")
    .eq("entrant_id", entrantId)
    .maybeSingle<PrefsRow>();

  const prefs: PrefsShape = data?.prefs ?? {};
  const emailOptedIn = prefs[kind] ?? true;
  const smsOptedIn = prefs.sms?.[kind] ?? false;
  // Push defaults ON: turning on notifications for a device is already an
  // explicit opt-in. Per-kind toggles live in prefs.push.
  const pushOptedIn = prefs.push?.[kind] ?? true;

  const result: SendResult = {
    email: { skipped: "opted_out" },
    sms: { skipped: "opted_out" },
    push: { skipped: "opted_out" },
  };

  if (email) {
    if (!emailOptedIn) {
      result.email = { skipped: "opted_out" };
    } else if (!data?.email) {
      result.email = { skipped: "no_email" };
    } else {
      try {
        const r = await sendViaResend({
          to: data.email,
          subject: email.subject,
          html: email.html,
          text: email.text,
        });
        await supabaseAdmin.from("notification_log").insert({
          entrant_id: entrantId,
          channel: "email",
          kind,
          subject: email.subject,
          payload: { to: data.email },
          provider_msg_id: r.id,
        });
        result.email = { ok: true, id: r.id };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await supabaseAdmin.from("notification_log").insert({
          entrant_id: entrantId,
          channel: "email",
          kind,
          subject: email.subject,
          payload: { to: data.email },
          error: message,
        });
        result.email = { ok: false, error: message };
      }
    }
  }

  if (sms) {
    if (!smsOptedIn) {
      result.sms = { skipped: "opted_out" };
    } else if (!isE164(data?.phone_e164)) {
      result.sms = { skipped: "no_phone" };
    } else {
      try {
        const r = await sendViaTwilio({ to: data!.phone_e164!, body: sms.body });
        await supabaseAdmin.from("notification_log").insert({
          entrant_id: entrantId,
          channel: "sms",
          kind,
          subject: null,
          payload: { to: data!.phone_e164, body: sms.body },
          provider_msg_id: r.sid,
        });
        result.sms = { ok: true, id: r.sid };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await supabaseAdmin.from("notification_log").insert({
          entrant_id: entrantId,
          channel: "sms",
          kind,
          subject: null,
          payload: { to: data?.phone_e164, body: sms.body },
          error: message,
        });
        result.sms = { ok: false, error: message };
      }
    }
  }

  if (push && pushOptedIn) {
    try {
      const r = await sendPushToEntrant(entrantId, push);
      if ("skipped" in r) {
        result.push = { skipped: r.skipped === "no_subscriptions" ? "no_device" : "not_configured" };
      } else {
        await supabaseAdmin.from("notification_log").insert({
          entrant_id: entrantId,
          channel: "push",
          kind,
          subject: push.title,
          payload: { url: push.url, body: push.body, ...r },
          error: r.ok ? null : r.error,
        });
        result.push = r.ok
          ? { ok: true, id: `${r.delivered} device(s)` }
          : { ok: false, error: r.error };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.push = { ok: false, error: message };
    }
  }

  return result;
}

export type BroadcastSummary = {
  recipients: number;
  email: { delivered: number; failed: number; skipped: number };
  sms: { delivered: number; failed: number; skipped: number };
  push: { delivered: number; failed: number; skipped: number };
};

function tallyChannel(result: SendChannelResult, summary: BroadcastSummary["email"]) {
  if ("ok" in result && result.ok) summary.delivered += 1;
  else if ("ok" in result && !result.ok) summary.failed += 1;
  else summary.skipped += 1;
}

export async function sendNotificationToAllMembers(args: {
  seasonId: string;
  kind: NotificationKind;
  email?: RenderedEmail;
  sms?: RenderedSms;
  push?: RenderedPush;
  excludeEntrantIds?: string[];
}): Promise<BroadcastSummary> {
  const { data } = await supabaseAdmin
    .from("season_members")
    .select("entrant_id")
    .eq("season_id", args.seasonId);

  const excluded = new Set(args.excludeEntrantIds ?? []);
  const recipients = (data ?? []).filter((row) => !excluded.has(row.entrant_id));

  const summary: BroadcastSummary = {
    recipients: recipients.length,
    email: { delivered: 0, failed: 0, skipped: 0 },
    sms: { delivered: 0, failed: 0, skipped: 0 },
    push: { delivered: 0, failed: 0, skipped: 0 },
  };

  const settled = await Promise.allSettled(
    recipients.map((row) =>
      sendNotification({
        entrantId: row.entrant_id,
        kind: args.kind,
        email: args.email,
        sms: args.sms,
        push: args.push,
      }),
    ),
  );

  for (const entry of settled) {
    if (entry.status !== "fulfilled") {
      // sendNotification catches its own errors, so a rejected promise here is
      // an unexpected bug — count it as a failure on both channels we attempted.
      if (args.email) summary.email.failed += 1;
      if (args.sms) summary.sms.failed += 1;
      if (args.push) summary.push.failed += 1;
      continue;
    }
    if (args.email) tallyChannel(entry.value.email, summary.email);
    if (args.sms) tallyChannel(entry.value.sms, summary.sms);
    if (args.push) tallyChannel(entry.value.push, summary.push);
  }

  return summary;
}

export function getBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.VERCEL_URL ??
    "http://localhost:3000"
  );
}
