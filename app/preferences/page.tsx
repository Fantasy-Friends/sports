"use client";

import { useEffect, useState } from "react";
import { getErrorMessage } from "@/lib/error";
import { useRequireEntrant } from "@/lib/useRequireEntrant";

type ChannelPrefs = Record<string, boolean>;

const DEFAULT_EMAIL: ChannelPrefs = {
  draft_opens: true,
  draft_turn: true,
  turn_timer_warn: true,
  event_lock: true,
  event_final: true,
  hot_seat_declared: true,
  hot_seat_veto: true,
  season_digest: true,
};

const DEFAULT_SMS: ChannelPrefs = {
  draft_opens: false,
  draft_turn: true,
  turn_timer_warn: true,
  event_lock: true,
  event_final: false,
  hot_seat_declared: false,
  hot_seat_veto: true,
  season_digest: false,
};

const KIND_ORDER: Array<keyof typeof DEFAULT_EMAIL> = [
  "draft_opens",
  "draft_turn",
  "turn_timer_warn",
  "event_lock",
  "event_final",
  "hot_seat_declared",
  "hot_seat_veto",
  "season_digest",
];

const KIND_LABEL: Record<string, string> = {
  draft_opens: "Draft opens for an event",
  draft_turn: "You’re on the clock",
  turn_timer_warn: "Turn timer — 30 min warning",
  event_lock: "Event entry deadline",
  event_final: "Event finalized",
  hot_seat_declared: "Hot Seat declared",
  hot_seat_veto: "Hot Seat vetoes needed",
  season_digest: "Weekly season digest",
};

export default function PreferencesPage() {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [emailPrefs, setEmailPrefs] = useState<ChannelPrefs>(DEFAULT_EMAIL);
  const [smsPrefs, setSmsPrefs] = useState<ChannelPrefs>(DEFAULT_SMS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [authed, setAuthed] = useState<boolean | null>(null);

  useRequireEntrant({ ready: authed !== null, entrant: authed ? { is_admin: false } : null });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/preferences", { cache: "no-store" });
        if (res.status === 401) {
          if (!cancelled) setAuthed(false);
          return;
        }
        if (!cancelled) setAuthed(true);
        const body = await res.json();
        if (cancelled) return;
        setEmail(body.email ?? "");
        setPhone(body.phone_e164 ?? "");
        const existing = (body.prefs ?? {}) as Record<string, unknown>;
        const emailFromPrefs: ChannelPrefs = { ...DEFAULT_EMAIL };
        for (const k of KIND_ORDER) {
          if (typeof existing[k] === "boolean") emailFromPrefs[k] = existing[k] as boolean;
        }
        setEmailPrefs(emailFromPrefs);

        const smsFromPrefs: ChannelPrefs = {
          ...DEFAULT_SMS,
          ...(existing.sms as ChannelPrefs | undefined),
        };
        setSmsPrefs(smsFromPrefs);
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err, "Failed to load"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const prefs: Record<string, unknown> = { ...emailPrefs, sms: smsPrefs };
      const res = await fetch("/api/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email || null,
          phone_e164: phone.trim() || null,
          prefs,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Save failed (${res.status})`);
      }
      setSaved(true);
    } catch (err) {
      setError(getErrorMessage(err, "Save failed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl">
      <div className="mb-4">
        <div className="text-[11px] uppercase tracking-[0.28em] text-muted">Notifications</div>
        <h1 className="text-2xl font-semibold text-info">Preferences</h1>
        <p className="mt-1 text-sm text-muted">
          Email is the default channel. Enable SMS for time-sensitive triggers you&rsquo;d rather not miss
          &mdash; we keep it minimal by default.
        </p>
      </div>

      {loading ? (
        <div className="rounded-[1.5rem] border border-border/20 bg-surface/35 p-5 text-sm text-muted">
          Loading&hellip;
        </div>
      ) : (
        <div className="soft-card space-y-5 rounded-[1.5rem] border border-border/20 bg-surface/35 p-4 sm:p-5">
          {error ? (
            <div className="rounded-md border border-danger/40 bg-danger/10 p-2 text-xs text-danger">
              {error}
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col text-xs text-muted">
              <span className="mb-1 uppercase tracking-[0.18em]">Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                inputMode="email"
                className="glass-input rounded-xl px-3 py-2 text-sm"
              />
            </label>
            <label className="flex flex-col text-xs text-muted">
              <span className="mb-1 uppercase tracking-[0.18em]">Phone (E.164)</span>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+15551234567"
                autoComplete="tel"
                inputMode="tel"
                className="glass-input rounded-xl px-3 py-2 text-sm"
              />
              <span className="mt-1 text-[10px] text-muted">
                Include country code. Example: +14155551234
              </span>
            </label>
          </div>

          <ul className="space-y-2 sm:hidden">
            {KIND_ORDER.map((kind) => {
              const emailOn = emailPrefs[kind] ?? true;
              const smsOn = smsPrefs[kind] ?? false;
              return (
                <li
                  key={`m-${kind}`}
                  className="rounded-xl border border-border/20 bg-surface/50 px-3 py-3"
                >
                  <div className="text-sm font-medium">{KIND_LABEL[kind] ?? kind}</div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <label className="flex items-center justify-between gap-2 rounded-lg border border-border/30 bg-surface/40 px-3 py-2">
                      <span className="text-muted">Email</span>
                      <input
                        type="checkbox"
                        checked={emailOn}
                        onChange={(e) =>
                          setEmailPrefs((p) => ({ ...p, [kind]: e.target.checked }))
                        }
                        className="h-5 w-5"
                        aria-label={`Email notifications for ${KIND_LABEL[kind] ?? kind}`}
                      />
                    </label>
                    <label className="flex items-center justify-between gap-2 rounded-lg border border-border/30 bg-surface/40 px-3 py-2">
                      <span className="text-muted">SMS</span>
                      <input
                        type="checkbox"
                        checked={smsOn}
                        onChange={(e) =>
                          setSmsPrefs((p) => ({ ...p, [kind]: e.target.checked }))
                        }
                        className="h-5 w-5"
                        aria-label={`SMS notifications for ${KIND_LABEL[kind] ?? kind}`}
                      />
                    </label>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-[0.2em] text-muted">
                  <th className="px-2 py-2 font-medium">Notification</th>
                  <th className="px-2 py-2 text-center font-medium">Email</th>
                  <th className="px-2 py-2 text-center font-medium">SMS</th>
                </tr>
              </thead>
              <tbody>
                {KIND_ORDER.map((kind) => (
                  <tr key={kind} className="border-t border-border/15 text-text">
                    <td className="px-2 py-2">{KIND_LABEL[kind] ?? kind}</td>
                    <td className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={emailPrefs[kind] ?? true}
                        onChange={(e) =>
                          setEmailPrefs((p) => ({ ...p, [kind]: e.target.checked }))
                        }
                        className="h-4 w-4"
                        aria-label={`Email notifications for ${KIND_LABEL[kind] ?? kind}`}
                      />
                    </td>
                    <td className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={smsPrefs[kind] ?? false}
                        onChange={(e) => setSmsPrefs((p) => ({ ...p, [kind]: e.target.checked }))}
                        className="h-4 w-4"
                        aria-label={`SMS notifications for ${KIND_LABEL[kind] ?? kind}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save preferences"}
            </button>
            {saved ? <div className="text-xs text-info">Saved.</div> : null}
          </div>

          <p className="text-[11px] text-muted">
            SMS uses Twilio. Requires <code>TWILIO_ACCOUNT_SID</code>,{" "}
            <code>TWILIO_AUTH_TOKEN</code>, and either <code>TWILIO_FROM_NUMBER</code> or{" "}
            <code>TWILIO_MESSAGING_SERVICE_SID</code> set on the server. Reply STOP to any message
            to opt out per Twilio&rsquo;s default compliance.
          </p>
        </div>
      )}
    </main>
  );
}
