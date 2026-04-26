"use client";

import { useEffect, useState } from "react";
import { getErrorMessage } from "@/lib/error";

type EventSummary = {
  event_id: string;
  slug: string;
  name: string;
  event_type: string;
  tier: 1 | 2 | 3;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
};

type NotificationSummary =
  | {
      recipients: number;
      email: { delivered: number; failed: number; skipped: number };
      sms: { delivered: number; failed: number; skipped: number };
    }
  | { error: string }
  | null;

type FinalizeResult = {
  ok?: boolean;
  already_final?: boolean;
  finishes?: Array<{
    entrant_id: string;
    finish_rank: number;
    raw_score: number;
    awarded_points: number;
  }>;
  bonuses?: Array<{
    entrant_id: string;
    bonus_type: string;
    points: number;
    note?: string | null;
  }>;
  notifications?: NotificationSummary;
  error?: string;
};

export default function AdminEventFinalizer() {
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [result, setResult] = useState<FinalizeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/admin/events/list", { cache: "no-store" });
        if (res.status === 403) return;
        if (!res.ok) throw new Error(`Failed to load events (${res.status})`);
        const body = await res.json();
        if (cancelled) return;
        setEvents(body.events ?? []);
        if ((body.events ?? []).length > 0) setSelected(body.events[0].slug);
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err, "Failed to load events"));
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function finalize() {
    if (!selected) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/events/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: selected }),
      });
      const body = (await res.json()) as FinalizeResult;
      if (!res.ok) throw new Error(body.error ?? `Finalize failed (${res.status})`);
      setResult(body);
    } catch (err) {
      setError(getErrorMessage(err, "Finalize failed"));
    } finally {
      setLoading(false);
    }
  }

  if (events.length === 0 && !error) return null;

  const selectedEvent = events.find((e) => e.slug === selected);

  return (
    <section className="soft-card rounded-[1.5rem] border border-border/20 bg-surface/35 p-5">
      <div className="mb-3 text-[11px] uppercase tracking-[0.28em] text-muted">
        Season · Finalize event
      </div>
      <p className="mb-3 text-xs text-muted">
        Computes 1st–6th finishes via the event handler, applies the tier multiplier, records bonus
        awards (golf: Survivor + Golden Ticket), and flips status to <code>final</code>. Idempotent.
      </p>
      {error ? (
        <div className="mb-3 rounded-md border border-danger/40 bg-danger/10 p-2 text-xs text-danger">
          {error}
        </div>
      ) : null}
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-xs text-muted">
          <span className="mb-1 uppercase tracking-[0.18em]">Event</span>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="glass-input rounded-xl px-3 py-2 text-sm"
          >
            {events.map((ev) => (
              <option key={ev.slug} value={ev.slug}>
                [{ev.status}] {ev.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => void finalize()}
          disabled={loading || !selected}
          className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {loading ? "Finalizing…" : "Finalize event"}
        </button>
      </div>
      {selectedEvent ? (
        <p className="mt-2 text-[11px] text-muted">
          Tier {selectedEvent.tier} · {selectedEvent.event_type}
        </p>
      ) : null}

      {result?.ok ? (
        <div className="mt-3 space-y-2 text-xs">
          {result.already_final ? (
            <div className="rounded-md border border-info/30 bg-info/10 p-2 text-info">
              Event was already final. Finishes recomputed; no notifications re-sent.
            </div>
          ) : result.notifications && "error" in result.notifications ? (
            <div className="rounded-md border border-danger/40 bg-danger/10 p-2 text-danger">
              Notification broadcast failed: {result.notifications.error}
            </div>
          ) : result.notifications ? (
            <div className="rounded-md border border-border/30 bg-surface/60 p-2 text-muted">
              Notified {result.notifications.recipients} members
              {result.notifications.email.delivered + result.notifications.email.failed > 0
                ? ` · email ${result.notifications.email.delivered}/${result.notifications.email.delivered + result.notifications.email.failed}${result.notifications.email.failed > 0 ? ` (${result.notifications.email.failed} failed)` : ""}`
                : ""}
              {result.notifications.sms.delivered + result.notifications.sms.failed > 0
                ? ` · SMS ${result.notifications.sms.delivered}/${result.notifications.sms.delivered + result.notifications.sms.failed}${result.notifications.sms.failed > 0 ? ` (${result.notifications.sms.failed} failed)` : ""}`
                : ""}
            </div>
          ) : null}
          <div className="font-semibold text-info">Finishes written:</div>
          <ul className="space-y-1">
            {(result.finishes ?? []).map((f) => (
              <li key={f.entrant_id} className="rounded bg-surface/60 px-2 py-1 font-mono">
                rank {f.finish_rank.toFixed(1)} · raw {f.raw_score} · pts{" "}
                {f.awarded_points.toFixed(1)}
              </li>
            ))}
          </ul>
          {(result.bonuses ?? []).length > 0 ? (
            <>
              <div className="font-semibold text-info">Bonuses:</div>
              <ul className="space-y-1">
                {(result.bonuses ?? []).map((b, i) => (
                  <li key={i} className="rounded bg-surface/60 px-2 py-1 font-mono">
                    {b.bonus_type} +{b.points} · {b.note}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="text-muted">No bonuses emitted.</div>
          )}
        </div>
      ) : null}
    </section>
  );
}
