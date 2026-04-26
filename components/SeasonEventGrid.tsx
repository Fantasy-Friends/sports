"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getErrorMessage } from "@/lib/error";

type EventRow = {
  event_id: string;
  slug: string;
  name: string;
  event_type: string;
  tier: 1 | 2 | 3;
  status: string;
  starts_at: string | null;
  group_key: string | null;
};

type FinishRow = {
  event_id: string;
  entrant_id: string;
  finish_rank: number;
  awarded_points: number;
};

type MemberRow = {
  entrant_id: string;
  display_name: string;
  seat_order: number | null;
};

const TIER_LABEL: Record<number, string> = { 3: "Tier 3 · 5x", 2: "Tier 2 · 2.5x", 1: "Tier 1 · 1x" };
const STATUS_BADGE: Record<string, string> = {
  scheduled: "bg-surface/50 text-muted",
  "open-entry": "bg-info/15 text-info",
  locked: "bg-accent/15 text-accent",
  live: "bg-accent text-white",
  final: "bg-surface/60 text-text",
  cancelled: "bg-danger/20 text-danger",
};

export default function SeasonEventGrid({ year }: { year: number }) {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [finishes, setFinishes] = useState<FinishRow[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [eventsRes, lbRes] = await Promise.all([
          fetch(`/api/season/${year}/events`, { cache: "no-store" }),
          fetch(`/api/season/${year}/leaderboard`, { cache: "no-store" }),
        ]);
        if (!eventsRes.ok) throw new Error(`Failed to load events (${eventsRes.status})`);
        if (!lbRes.ok) throw new Error(`Failed to load season (${lbRes.status})`);
        const eventsBody = await eventsRes.json();
        const lbBody = await lbRes.json();
        if (cancelled) return;
        setEvents(eventsBody.events ?? []);
        setFinishes(eventsBody.finishes ?? []);
        setMembers(lbBody.rows ?? []);
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err, "Failed to load events"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [year]);

  const tierGroups = useMemo(() => {
    const groups: Record<3 | 2 | 1, EventRow[]> = { 3: [], 2: [], 1: [] };
    for (const ev of events) groups[ev.tier].push(ev);
    return groups;
  }, [events]);

  const finishLookup = useMemo(() => {
    const map = new Map<string, FinishRow>();
    for (const f of finishes) map.set(`${f.event_id}:${f.entrant_id}`, f);
    return map;
  }, [finishes]);

  if (loading) {
    return (
      <div className="rounded-[1.5rem] border border-border/20 bg-surface/35 p-6 text-sm text-muted">
        Loading events…
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-[1.5rem] border border-danger/40 bg-surface/35 p-6 text-sm text-danger">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {([3, 2, 1] as const).map((tier) => {
        const rows = tierGroups[tier];
        if (!rows || rows.length === 0) return null;
        return (
          <section key={tier} className="soft-card rounded-[1.75rem] border border-border/20 bg-surface/35 p-4 sm:p-5">
            <div className="mb-3 text-[11px] uppercase tracking-[0.28em] text-muted">
              {TIER_LABEL[tier]}
            </div>

            <ul className="space-y-2 lg:hidden">
              {rows.map((ev) => {
                const memberFinishes = members.map((m) => ({
                  member: m,
                  finish: finishLookup.get(`${ev.event_id}:${m.entrant_id}`) ?? null,
                }));
                const scored = memberFinishes.filter((row) => row.finish !== null);
                const topPoints = scored.reduce(
                  (max, row) => (row.finish && row.finish.awarded_points > max ? row.finish.awarded_points : max),
                  -Infinity,
                );
                return (
                  <li
                    key={`m-${ev.event_id}`}
                    className="rounded-[1.25rem] border border-border/20 bg-surface/60 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <Link
                        href={`/events/${ev.slug}`}
                        className="min-w-0 flex-1 text-sm font-semibold text-text hover:text-accent"
                      >
                        {ev.name}
                      </Link>
                      <span
                        className={`inline-flex shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] ${
                          STATUS_BADGE[ev.status] ?? "bg-surface/50 text-muted"
                        }`}
                      >
                        {ev.status}
                      </span>
                    </div>
                    {members.length > 0 && (
                      <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                        {memberFinishes.map(({ member, finish }) => {
                          const isTop =
                            finish !== null &&
                            topPoints !== -Infinity &&
                            finish.awarded_points === topPoints &&
                            topPoints > 0;
                          return (
                            <div
                              key={`m-${ev.event_id}-${member.entrant_id}`}
                              className={[
                                "flex items-center justify-between gap-2 rounded-lg border px-2 py-1.5 text-xs",
                                isTop
                                  ? "border-accent/40 bg-accent/10"
                                  : "border-border/20 bg-surface/30",
                              ].join(" ")}
                            >
                              <span className="truncate text-muted">{member.display_name}</span>
                              <span className="shrink-0 font-semibold tabular-nums">
                                {finish ? finish.awarded_points.toFixed(1) : "—"}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-[0.18em] text-muted">
                    <th className="sticky left-0 bg-surface/60 px-2 py-2 font-medium">Event</th>
                    <th className="px-2 py-2 font-medium">Status</th>
                    {members.map((m) => (
                      <th key={m.entrant_id} className="px-2 py-2 text-right font-medium">
                        {m.display_name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((ev) => (
                    <tr key={ev.event_id} className="border-t border-border/15">
                      <td className="sticky left-0 bg-surface/60 px-2 py-2">
                        <Link href={`/events/${ev.slug}`} className="font-semibold text-text hover:text-accent">
                          {ev.name}
                        </Link>
                      </td>
                      <td className="px-2 py-2">
                        <span
                          className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] ${
                            STATUS_BADGE[ev.status] ?? "bg-surface/50 text-muted"
                          }`}
                        >
                          {ev.status}
                        </span>
                      </td>
                      {members.map((m) => {
                        const f = finishLookup.get(`${ev.event_id}:${m.entrant_id}`);
                        return (
                          <td key={m.entrant_id} className="px-2 py-2 text-right tabular-nums">
                            {f ? f.awarded_points.toFixed(1) : <span className="text-muted">—</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
