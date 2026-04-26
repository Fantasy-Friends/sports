"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import SeasonBoard from "@/components/SeasonBoard";
import { useRequireEntrant } from "@/lib/useRequireEntrant";

type Entrant = {
  entrant_id: string;
  entrant_name: string;
  entrant_slug: string;
  draft_position: number | null;
  is_admin: boolean;
};

type TournamentMetaRow = {
  tournament_slug: string;
  label: string;
  draft_open?: boolean;
  draft_active_now?: boolean;
};

type EventRow = {
  event_id: string;
  slug: string;
  name: string;
  event_type: string;
  tier: 1 | 2 | 3;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  group_key: string | null;
};

type LiveState =
  | {
      kind: "draft";
      title: string;
      subtitle: string;
      cta: { label: string; href: string };
      chip: { label: string; tone: "live" };
    }
  | {
      kind: "live-event";
      title: string;
      subtitle: string;
      cta: { label: string; href: string };
      chip: { label: string; tone: "live" };
    }
  | {
      kind: "open-entry";
      title: string;
      subtitle: string;
      cta: { label: string; href: string };
      chip: { label: string; tone: "info" };
    }
  | {
      kind: "next";
      title: string;
      subtitle: string;
      cta: { label: string; href: string };
      chip: { label: string; tone: "muted" };
    }
  | {
      kind: "idle";
      title: string;
      subtitle: string;
      cta: { label: string; href: string };
      chip: { label: string; tone: "muted" };
    };

function formatRelativeFromNow(iso: string, now = new Date()): string {
  const then = new Date(iso);
  const diffMs = then.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (Math.abs(diffDays) < 1) return "today";
  if (diffDays === 1) return "tomorrow";
  if (diffDays === -1) return "yesterday";
  if (diffDays > 0 && diffDays < 7) return `in ${diffDays} days`;
  if (diffDays > 0 && diffDays < 60) {
    const weeks = Math.round(diffDays / 7);
    return `in ${weeks} week${weeks === 1 ? "" : "s"}`;
  }
  if (diffDays > 0) {
    const months = Math.round(diffDays / 30);
    return `in ${months} month${months === 1 ? "" : "s"}`;
  }
  return then.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function deriveLiveState(
  tmeta: TournamentMetaRow[],
  events: EventRow[],
): LiveState {
  const liveDraft = tmeta.find((t) => t.draft_active_now);
  if (liveDraft) {
    return {
      kind: "draft",
      title: liveDraft.label,
      subtitle: "Draft is open — make your picks",
      cta: { label: "Enter Draft Room", href: "/draft" },
      chip: { label: "Live draft", tone: "live" },
    };
  }

  const liveEvent = events.find((e) => e.status === "live");
  if (liveEvent) {
    return {
      kind: "live-event",
      title: liveEvent.name,
      subtitle: "Live right now",
      cta: { label: "Open event", href: `/events/${liveEvent.slug}` },
      chip: { label: "Live", tone: "live" },
    };
  }

  const openEntry = events.find((e) => e.status === "open-entry");
  if (openEntry) {
    return {
      kind: "open-entry",
      title: openEntry.name,
      subtitle: openEntry.starts_at
        ? `Entries open · Starts ${formatRelativeFromNow(openEntry.starts_at)}`
        : "Entries open",
      cta: { label: "Make your picks", href: `/events/${openEntry.slug}/entry` },
      chip: { label: "Entries open", tone: "info" },
    };
  }

  const nextScheduled = events
    .filter((e) => e.status === "scheduled" && e.starts_at)
    .sort((a, b) => (a.starts_at! > b.starts_at! ? 1 : -1))[0];
  if (nextScheduled) {
    return {
      kind: "next",
      title: nextScheduled.name,
      subtitle: `Next up · ${formatRelativeFromNow(nextScheduled.starts_at!)}`,
      cta: { label: "View calendar", href: "/calendar" },
      chip: { label: "Scheduled", tone: "muted" },
    };
  }

  return {
    kind: "idle",
    title: "Season is quiet",
    subtitle: "Nothing live right now. Check the calendar for what's coming up.",
    cta: { label: "View calendar", href: "/calendar" },
    chip: { label: "Quiet", tone: "muted" },
  };
}

function LiveNowTile({ state, loading }: { state: LiveState | null; loading: boolean }) {
  if (loading || !state) {
    return (
      <section className="hero-panel soft-card relative overflow-hidden rounded-[1.75rem] border px-5 py-7 sm:px-6 sm:py-8">
        <div className="text-[11px] uppercase tracking-[0.28em] text-muted">Loading…</div>
      </section>
    );
  }

  const chipClass =
    state.chip.tone === "live"
      ? "bg-accent text-white"
      : state.chip.tone === "info"
        ? "bg-info/15 text-info"
        : "bg-surface/70 text-muted";

  return (
    <section className="hero-panel soft-card relative overflow-hidden rounded-[1.75rem] border px-5 py-6 sm:px-6 sm:py-8">
      <div className="pointer-events-none absolute -left-12 top-8 h-32 w-32 rounded-full bg-accent/20 blur-3xl" />
      <div className="pointer-events-none absolute right-4 top-4 h-28 w-28 rounded-full bg-accent/10 blur-3xl" />
      <div className="relative">
        <span
          className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.22em] ${chipClass}`}
        >
          {state.chip.label}
        </span>
        <h1 className="mt-3 text-2xl font-semibold leading-tight text-info sm:text-3xl">
          {state.title}
        </h1>
        <p className="mt-2 text-sm text-muted">{state.subtitle}</p>
        <Link
          href={state.cta.href}
          className="mt-5 inline-flex items-center rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(99,91,255,0.24)]"
        >
          {state.cta.label} <span className="ml-2">→</span>
        </Link>
      </div>
    </section>
  );
}

function HomePageContent() {
  const basePoolId = process.env.NEXT_PUBLIC_POOL_ID || "2026-majors";

  const [sessionEntrant, setSessionEntrant] = useState<Entrant | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [tmeta, setTmeta] = useState<TournamentMetaRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useRequireEntrant({ ready: !sessionLoading, entrant: sessionEntrant });

  // Fetch session. Guard hook handles redirect when session is missing.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/auth/me?pool_id=${encodeURIComponent(basePoolId + "-masters")}`, {
          cache: "no-store",
        });
        const json = await res.json();
        if (!cancelled) setSessionEntrant((json?.entrant ?? null) as Entrant | null);
      } catch {
        if (!cancelled) setSessionEntrant(null);
      } finally {
        if (!cancelled) setSessionLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [basePoolId]);

  // Fetch live-tile context once session is confirmed.
  useEffect(() => {
    if (sessionLoading || !sessionEntrant) return;
    let cancelled = false;

    async function load() {
      setDataLoading(true);
      try {
        const [metaRes, eventsRes] = await Promise.all([
          fetch(`/api/tournament-meta?pool_id=${encodeURIComponent(basePoolId + "-masters")}`, {
            cache: "no-store",
          }),
          fetch(`/api/season/2026/events`, { cache: "no-store" }),
        ]);
        const metaJson = await metaRes.json();
        const eventsJson = await eventsRes.json();
        if (cancelled) return;
        setTmeta(((metaJson?.rows ?? []) as TournamentMetaRow[]) ?? []);
        setEvents(((eventsJson?.events ?? []) as EventRow[]) ?? []);
      } catch {
        if (!cancelled) {
          setTmeta([]);
          setEvents([]);
        }
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [sessionLoading, sessionEntrant, basePoolId]);

  const liveState = useMemo(() => deriveLiveState(tmeta, events), [tmeta, events]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/sign-in";
  }

  if (sessionLoading || !sessionEntrant) {
    return (
      <main className="flex min-h-[40vh] items-center justify-center">
        <div className="text-sm text-muted">Loading&hellip;</div>
      </main>
    );
  }

  return (
    <main className="space-y-5">
      <LiveNowTile state={liveState} loading={dataLoading} />
      <SeasonBoard year={2026} />
      <div className="flex items-center justify-center pt-2">
        <button
          type="button"
          onClick={() => void handleLogout()}
          className="text-xs text-muted underline underline-offset-4 hover:text-text"
        >
          Sign out ({sessionEntrant.entrant_name})
        </button>
      </div>
    </main>
  );
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-[40vh] items-center justify-center">
          <div className="text-sm text-muted">Loading home&hellip;</div>
        </main>
      }
    >
      <HomePageContent />
    </Suspense>
  );
}
