"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import ThemeToggle from "@/components/ThemeToggle";
import { initialsFor, tintFor } from "@/lib/avatarTint";

/*
 * AppShell — the unified Stadium-mobile / Press Box-desktop chrome that
 * wraps every authenticated page.
 *
 * What it provides on every page:
 *   - Top bar: hamburger drawer + active page title + presence count
 *   - Live event banner: pulsing dot, current event name, round, watching count
 *   - Companion rail (lg+): pool standings, my picks, bonuses, next event
 *   - Auth guard: redirects to /sign-in if no session
 *
 * Data is fetched once per shell mount and shared across the chrome bits.
 * Pages render their own content as `children`.
 */

type Entrant = {
  entrant_id: string;
  entrant_name: string;
  entrant_slug: string;
  pool_id?: string;
  is_admin: boolean;
  welcomed_at?: string | null;
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
  legacy_pool_id?: string | null;
};

type SeasonStanding = {
  entrant_id: string;
  display_name: string;
  total_points: number;
  event_points: number;
  bonus_points: number;
};

type PoolPlayerRow = {
  entrant_name: string;
  team_total: number;
  scoring_golfers: Array<{
    golfer: string;
    handicap: number;
    net_total: number | null;
    live_net_to_par?: number | null;
    live_total_to_par?: number | null;
    position_text: string | null;
    position: number | null;
    rounds: Array<{ round_number: number; strokes: number | null; score_status: string }>;
  }>;
};

type PresenceMember = {
  entrant_id: string;
  display_name: string;
  seat_order: number | null;
  last_seen_at: string | null;
};

type BonusAward = {
  bonus_id: string;
  entrant_id: string;
  display_name: string;
  bonus_type: string;
  points: number;
  awarded_at: string;
  event: { slug: string; name: string } | null;
};

const NAV_ITEMS = [
  { href: "/",                    label: "Home" },
  { href: "/season/2026",         label: "Season" },
  { href: "/calendar",            label: "Calendar" },
  { href: "/hot-seat",            label: "Hot Seat" },
  { href: "/draft",               label: "Draft" },
  { href: "/leaderboard",         label: "Player Leaderboard" },
  { href: "/tournament",          label: "Tournament Leaderboard" },
  { href: "/preferences",         label: "Notifications" },
  { href: "/admin",               label: "Admin" },
  { href: "/ux",                  label: "Design Lab" },
];

const PRESENCE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes = "here now"

// ---------------------------------------------------------------------------

function isHereNow(lastSeenAt: string | null): boolean {
  if (!lastSeenAt) return false;
  const ts = new Date(lastSeenAt).getTime();
  if (Number.isNaN(ts)) return false;
  return Date.now() - ts < PRESENCE_WINDOW_MS;
}

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso);
  const diffMs = then.getTime() - Date.now();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (Math.abs(diffDays) < 1) return "today";
  if (diffDays === 1) return "tomorrow";
  if (diffDays > 1 && diffDays < 7) return `in ${diffDays}d`;
  if (diffDays > 0 && diffDays < 60) return `in ${Math.round(diffDays / 7)}w`;
  if (diffDays > 0) return `in ${Math.round(diffDays / 30)}mo`;
  if (diffDays > -7) return `${Math.abs(diffDays)}d ago`;
  return then.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatToPar(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value === 0) return "E";
  return value > 0 ? `+${value}` : `${value}`;
}

function pickGolferToPar(g: PoolPlayerRow["scoring_golfers"][number]): number | null {
  if (typeof g.live_net_to_par === "number") return Math.round(g.live_net_to_par);
  if (typeof g.live_total_to_par === "number" && typeof g.handicap === "number") {
    return Math.round(g.live_total_to_par - g.handicap);
  }
  if (g.net_total !== null && g.rounds.length > 0) {
    const totalPar = g.rounds.length * 72;
    return Math.round(g.net_total - totalPar);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------

function Avatar({
  name,
  size = "sm",
  hereNow = false,
}: {
  name: string;
  size?: "xs" | "sm" | "md";
  hereNow?: boolean;
}) {
  const dim =
    size === "md" ? "h-9 w-9 text-[11px]" :
    size === "sm" ? "h-7 w-7 text-[10px]" :
                    "h-5 w-5 text-[8px]";
  return (
    <span
      className={`${dim} relative inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white`}
      style={{ background: tintFor(name) }}
      aria-label={name}
    >
      {initialsFor(name)}
      {hereNow && size !== "xs" && (
        <span className="absolute -right-0.5 -top-0.5 inline-block h-2 w-2 rounded-full border-2 border-[#0b2a22] bg-[#4ade80]">
          <span className="absolute inset-0 animate-ping rounded-full bg-[#4ade80]/60" />
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Live event resolution
// ---------------------------------------------------------------------------

type LiveContext = {
  status: "live" | "open-entry" | "scheduled" | "idle";
  event: EventRow | null;
  copy: string;
};

function deriveLiveContext(events: EventRow[]): LiveContext {
  const live = events.find((e) => e.status === "live");
  if (live) {
    return { status: "live", event: live, copy: live.name };
  }
  const open = events.find((e) => e.status === "open-entry");
  if (open) {
    const rel = open.starts_at ? formatRelative(open.starts_at) : "";
    return { status: "open-entry", event: open, copy: `${open.name}${rel ? ` · entries open · starts ${rel}` : ""}` };
  }
  const next = events
    .filter((e) => e.status === "scheduled" && e.starts_at)
    .sort((a, b) => (a.starts_at! > b.starts_at! ? 1 : -1))[0];
  if (next) {
    return { status: "scheduled", event: next, copy: `Next: ${next.name} · ${formatRelative(next.starts_at)}` };
  }
  return { status: "idle", event: null, copy: "Season is quiet" };
}

// ---------------------------------------------------------------------------
// Top bar
// ---------------------------------------------------------------------------

function TopBar({
  pathname,
  pageTitle,
  liveCtx,
  hereNowCount,
  totalMembers,
  entrantName,
  onSignOut,
}: {
  pathname: string;
  pageTitle: string;
  liveCtx: LiveContext;
  hereNowCount: number;
  totalMembers: number;
  entrantName: string | null;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const hamburgerRef = useRef<HTMLButtonElement | null>(null);
  const drawerRef = useRef<HTMLDivElement | null>(null);

  // Focus trap: when drawer opens, save the previously-focused element,
  // move focus to the first link inside the drawer, and trap Tab cycling
  // so keyboard users don't escape into the page behind the drawer.
  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    // Capture refs at effect time — the lint rule warns about reading them
    // in cleanup, since they may have changed by then.
    const drawer = drawerRef.current;
    const hamburger = hamburgerRef.current;

    const focusables = drawer
      ? Array.from(
          drawer.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        )
      : [];
    focusables[0]?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key !== "Tab" || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      // Restore focus to whoever opened the drawer, unless focus has already
      // been moved elsewhere by a navigation.
      if (document.activeElement === document.body || drawer?.contains(document.activeElement)) {
        (previouslyFocused ?? hamburger)?.focus();
      }
    };
  }, [open]);

  return (
    <nav className="sticky top-0 z-30 -mx-3 -mt-4 mb-4 sm:-mx-4 sm:-mt-6 md:-mx-6 lg:-mx-8">
      <div className="appshell-topbar text-[#e9e3d1]">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-3 py-2 sm:px-4 lg:px-8">
          <button
            ref={hamburgerRef}
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="appshell-drawer"
            aria-label={open ? "Close menu" : "Open menu"}
            title={open ? "Close menu" : "Open menu"}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/80 transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#4ade80]"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
              {open ? (
                <>
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="18" y1="6" x2="6" y2="18" />
                </>
              ) : (
                <>
                  <line x1="4" y1="7" x2="20" y2="7" />
                  <line x1="4" y1="12" x2="20" y2="12" />
                  <line x1="4" y1="17" x2="20" y2="17" />
                </>
              )}
            </svg>
          </button>

          {liveCtx.status === "live" && (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-[#4ade80]/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[#4ade80]">
              <span className="relative inline-flex h-1.5 w-1.5">
                <span className="absolute inset-0 animate-ping rounded-full bg-[#4ade80]/70" />
                <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-[#4ade80]" />
              </span>
              Live
            </span>
          )}

          <div className="min-w-0 flex-1">
            <div
              className="truncate text-[10px] uppercase tracking-[0.22em] text-white/50"
              title={liveCtx.copy}
            >
              {liveCtx.copy}
            </div>
            <div className="truncate text-sm font-semibold text-white" title={pageTitle}>
              {pageTitle}
            </div>
          </div>

          {totalMembers > 0 && (
            <div className="hidden items-center gap-1 text-[10px] uppercase tracking-[0.18em] text-white/45 sm:inline-flex">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#4ade80]" />
              {hereNowCount}/{totalMembers} here
            </div>
          )}

          <ThemeToggle />
        </div>

        {open && (
          <div
            ref={drawerRef}
            id="appshell-drawer"
            role="menu"
            className="border-t border-white/5 bg-[#08201a]/95 px-3 py-2 backdrop-blur sm:px-4 lg:px-8"
          >
            <div className="mx-auto grid max-w-7xl gap-1 sm:grid-cols-2 lg:grid-cols-3">
              {NAV_ITEMS.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={(e) => {
                      // Tapping the active page in the drawer is a no-op
                      // navigation. Just close the drawer instead of letting
                      // Next.js trigger a fresh client transition.
                      if (active) e.preventDefault();
                      setOpen(false);
                    }}
                    aria-current={active ? "page" : undefined}
                    className={[
                      "rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
                      active ? "bg-[#f5c11c] text-[#08201a]" : "text-white/80 hover:bg-white/10",
                    ].join(" ")}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
            {entrantName && (
              <div className="mx-auto mt-3 flex max-w-7xl items-center justify-between gap-3 border-t border-white/5 pt-3 text-sm">
                <div className="flex min-w-0 items-center gap-2">
                  <Avatar name={entrantName} size="sm" />
                  <span className="min-w-0 truncate text-white/80" title={entrantName}>
                    Signed in as <span className="font-semibold text-white">{entrantName}</span>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onSignOut}
                  className="shrink-0 text-white/60 underline underline-offset-4 hover:text-white"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Page header (title, subtitle, presence rail)
// ---------------------------------------------------------------------------

function PageHeader({
  title,
  subtitle,
  presence,
}: {
  title: string;
  subtitle?: string;
  presence: PresenceMember[];
}) {
  const sorted = useMemo(() => {
    const here = presence.filter((m) => isHereNow(m.last_seen_at));
    const away = presence.filter((m) => !isHereNow(m.last_seen_at));
    return [...here.sort((a, b) => a.display_name.localeCompare(b.display_name)),
            ...away.sort((a, b) => a.display_name.localeCompare(b.display_name))];
  }, [presence]);

  if (presence.length === 0) {
    return (
      <header className="mb-4">
        <h1 className="text-2xl font-semibold text-info sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </header>
    );
  }

  return (
    <header className="mb-4">
      <h1 className="text-2xl font-semibold text-info sm:text-3xl">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}

      <div
        className="mt-3 -mx-1 overflow-x-auto px-1"
        aria-live="polite"
        aria-label="Pool presence"
      >
        <div className="flex min-w-max items-center gap-2 sm:gap-2.5">
          {sorted.map((m) => {
            const here = isHereNow(m.last_seen_at);
            return (
              <div
                key={m.entrant_id}
                className="flex items-center gap-1.5"
                title={`${m.display_name}${here ? " · here now" : ""}`}
              >
                <Avatar name={m.display_name} hereNow={here} size="sm" />
                {/* Hide name labels on the smallest phones — avatars + their
                    pulse dots carry the meaning, and labels were unreadable
                    at 10–11px when the rail had 9 entrants. Names return at sm+. */}
                <span
                  className={`hidden text-[11px] font-semibold sm:inline ${here ? "text-text" : "text-muted"}`}
                >
                  {m.display_name}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Companion rail (lg+ only)
// ---------------------------------------------------------------------------

function RailTile({
  label,
  extra,
  children,
}: {
  label: string;
  extra?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/40 bg-surface/70 p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{label}</div>
        {extra && <div className="text-[11px] text-muted">{extra}</div>}
      </div>
      {children}
    </div>
  );
}

function CompanionRail({
  standings,
  myPicks,
  bonuses,
  liveCtx,
  meName,
}: {
  standings: SeasonStanding[];
  myPicks: PoolPlayerRow["scoring_golfers"];
  bonuses: BonusAward[];
  liveCtx: LiveContext;
  meName: string | null;
}) {
  return (
    <div className="space-y-3">
      <RailTile label="Pool standings" extra="Season">
        {standings.length === 0 ? (
          <div className="text-xs text-muted">No standings yet.</div>
        ) : (
          <ol className="space-y-1">
            {standings.map((s, i) => {
              const isMe = meName !== null && s.display_name === meName;
              return (
                <li
                  key={s.entrant_id}
                  className={`flex items-center gap-2 rounded-md px-1 py-0.5 text-xs ${isMe ? "bg-accent/10" : ""}`}
                >
                  <span className="w-3 shrink-0 text-[10px] tabular-nums text-muted">{i + 1}</span>
                  <Avatar name={s.display_name} size="xs" />
                  <span className="flex-1 truncate font-medium" title={s.display_name}>
                    {s.display_name}
                    {isMe && <span className="ml-1 text-[9px] uppercase tracking-wide text-accent">you</span>}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">{Number(s.total_points).toFixed(0)}</span>
                </li>
              );
            })}
          </ol>
        )}
      </RailTile>

      <RailTile
        label="My picks"
        extra={liveCtx.event ? liveCtx.event.name : "No live event"}
      >
        {myPicks.length === 0 ? (
          <div className="text-xs text-muted">No picks yet.</div>
        ) : (
          <ul className="space-y-0.5 text-xs">
            {myPicks.slice(0, 6).map((g) => {
              const toPar = pickGolferToPar(g);
              const cut = toPar === null;
              return (
                <li key={g.golfer} className="flex items-center gap-2">
                  <span
                    className={`flex-1 truncate ${cut ? "text-muted line-through" : ""}`}
                    title={g.golfer}
                  >
                    {g.golfer}
                  </span>
                  <span className="w-9 shrink-0 text-right text-[10px] tabular-nums text-muted">
                    {g.position_text ?? g.position ?? "—"}
                  </span>
                  <span
                    className={[
                      "w-9 shrink-0 text-right font-semibold tabular-nums",
                      cut
                        ? "text-muted"
                        : toPar! < -5
                          ? "text-emerald-600"
                          : toPar! < 0
                            ? ""
                            : toPar! > 2
                              ? "text-danger"
                              : "text-muted",
                    ].join(" ")}
                  >
                    {cut ? "—" : formatToPar(toPar!)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </RailTile>

      <RailTile label="Recent bonuses" extra="Season">
        {bonuses.length === 0 ? (
          <div className="text-xs text-muted">
            No bonuses yet. They&rsquo;ll land here as events finalize.
          </div>
        ) : (
          <ul className="space-y-1.5 text-xs">
            {bonuses.slice(0, 4).map((b) => {
              const label = `${b.display_name} · ${b.bonus_type.replace(/_/g, " ")}`;
              return (
                <li key={b.bonus_id} className="flex items-center gap-2" title={label}>
                  <Avatar name={b.display_name} size="xs" />
                  <span className="min-w-0 flex-1 truncate text-text">{label}</span>
                  <span className="shrink-0 rounded bg-accent/15 px-1.5 py-0.5 font-bold tabular-nums text-accent">
                    +{b.points}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </RailTile>

      {liveCtx.event && liveCtx.status !== "live" && (
        <RailTile label="Next up">
          <div className="text-xs">
            <div className="font-semibold text-text">{liveCtx.event.name}</div>
            <div className="mt-0.5 text-[10px] text-muted">
              Tier {liveCtx.event.tier} · {liveCtx.event.status}
              {liveCtx.event.starts_at ? ` · ${formatRelative(liveCtx.event.starts_at)}` : ""}
            </div>
            <Link
              href={`/events/${liveCtx.event.slug}`}
              className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-[11px] font-semibold text-white"
            >
              Open event
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </RailTile>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main shell
// ---------------------------------------------------------------------------

export type AppShellProps = {
  /** Page title shown in the top bar and as the page H1. */
  title: string;
  /** Optional subtitle under the page H1. */
  subtitle?: string;
  /** If true, hide the page H1 (page composes its own). */
  hideHeading?: boolean;
  /** If true, only require a session — don't enforce admin. */
  requireAdmin?: boolean;
  children: React.ReactNode;
};

type RawEventRow = EventRow & { lock_at?: string | null; lock_at_pretty?: string };

declare module "react" {}

export default function AppShell({
  title,
  subtitle,
  hideHeading = false,
  requireAdmin = false,
  children,
}: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();

  const [session, setSession] = useState<Entrant | null>(null);
  const [sessionReady, setSessionReady] = useState(false);

  const [events, setEvents] = useState<EventRow[]>([]);
  const [presence, setPresence] = useState<PresenceMember[]>([]);
  const [standings, setStandings] = useState<SeasonStanding[]>([]);
  const [bonuses, setBonuses] = useState<BonusAward[]>([]);
  const [myPicks, setMyPicks] = useState<PoolPlayerRow["scoring_golfers"]>([]);

  // Session check — gate
  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        const json = await res.json();
        if (cancelled) return;
        const entrant = (json?.entrant ?? null) as Entrant | null;
        if (!entrant) {
          router.replace(`/sign-in?returnTo=${encodeURIComponent(pathname)}`);
          return;
        }
        if (requireAdmin && !entrant.is_admin) {
          router.replace("/");
          return;
        }
        setSession(entrant);
      } catch {
        if (!cancelled) router.replace(`/sign-in?returnTo=${encodeURIComponent(pathname)}`);
      } finally {
        if (!cancelled) setSessionReady(true);
      }
    }
    void check();
    return () => {
      cancelled = true;
    };
  }, [router, pathname, requireAdmin]);

  // Shell data — only fetch once a session is confirmed
  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    async function load() {
      try {
        const [eventsRes, presenceRes, leaderboardRes, bonusesRes] = await Promise.all([
          fetch("/api/season/2026/events", { cache: "no-store" }),
          fetch("/api/presence", { cache: "no-store" }),
          fetch("/api/season/2026/leaderboard", { cache: "no-store" }),
          fetch("/api/season/2026/bonuses", { cache: "no-store" }),
        ]);

        const [eventsJson, presenceJson, leaderboardJson, bonusesJson] = await Promise.all([
          eventsRes.json(),
          presenceRes.json(),
          leaderboardRes.json(),
          bonusesRes.json(),
        ]);

        if (cancelled) return;

        const eventRows = ((eventsJson?.events ?? []) as RawEventRow[]).map((e) => ({
          event_id: e.event_id,
          slug: e.slug,
          name: e.name,
          event_type: e.event_type,
          tier: e.tier as 1 | 2 | 3,
          status: e.status,
          starts_at: e.starts_at,
          ends_at: e.ends_at,
          legacy_pool_id: e.legacy_pool_id,
        }));
        setEvents(eventRows);
        setPresence((presenceJson?.members ?? []) as PresenceMember[]);
        setStandings((leaderboardJson?.rows ?? []) as SeasonStanding[]);
        setBonuses((bonusesJson?.bonuses ?? []) as BonusAward[]);
      } catch {
        // swallow — empty arrays are the default
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [session]);

  // My picks — only meaningful if there's a live event with a legacy pool
  const liveCtx = useMemo(() => deriveLiveContext(events), [events]);

  useEffect(() => {
    if (!session) return;
    if (!liveCtx.event?.legacy_pool_id) {
      setMyPicks([]);
      return;
    }
    let cancelled = false;
    async function load() {
      try {
        const tournamentSlug =
          (liveCtx.event!.event_type === "golf-draft"
            ? liveCtx.event!.slug.replace(/^2026-/, "")
            : null);
        if (!tournamentSlug) {
          setMyPicks([]);
          return;
        }
        const res = await fetch(
          `/api/leaderboards/player?pool_id=${encodeURIComponent(liveCtx.event!.legacy_pool_id!)}&tournament=${encodeURIComponent(tournamentSlug)}`,
          { cache: "no-store" },
        );
        const json = await res.json();
        if (cancelled) return;
        const rows = (json?.rows ?? []) as PoolPlayerRow[];
        const mine = rows.find((r) => r.entrant_name === session!.entrant_name);
        if (mine) {
          setMyPicks([...mine.scoring_golfers]);
        } else {
          setMyPicks([]);
        }
      } catch {
        if (!cancelled) setMyPicks([]);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [session, liveCtx.event]);

  async function handleSignOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/sign-in";
  }

  const hereNowCount = useMemo(
    () => presence.filter((p) => isHereNow(p.last_seen_at)).length,
    [presence],
  );

  if (!sessionReady || !session) {
    return (
      <>
        {/* Skeleton top bar — same dark gradient as the real one so the page
            doesn't flash a blank state before the shell mounts. */}
        <nav className="sticky top-0 z-30 -mx-3 -mt-4 mb-4 sm:-mx-4 sm:-mt-6 md:-mx-6 lg:-mx-8">
          <div className="appshell-topbar text-[#e9e3d1]">
            <div className="mx-auto flex max-w-7xl items-center gap-3 px-3 py-2 sm:px-4 lg:px-8">
              <div className="h-9 w-9 rounded-lg border border-white/10 bg-white/5" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="h-2.5 w-24 animate-pulse rounded bg-white/15" aria-hidden="true" />
                <div className="mt-1.5 h-3.5 w-32 animate-pulse rounded bg-white/20" aria-hidden="true" />
              </div>
            </div>
          </div>
        </nav>
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="text-sm text-muted">Loading&hellip;</div>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Skip link — keyboard users can jump past the top bar/drawer to the
          actual page content. Hidden until focused. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-accent focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to main content
      </a>

      <TopBar
        pathname={pathname}
        pageTitle={title}
        liveCtx={liveCtx}
        hereNowCount={hereNowCount}
        totalMembers={presence.length}
        entrantName={session.entrant_name}
        onSignOut={() => void handleSignOut()}
      />

      <div className="grid gap-4 lg:grid-cols-[1fr,18rem]">
        <main id="main-content" className="min-w-0">
          {!hideHeading && (
            <PageHeader title={title} subtitle={subtitle} presence={presence} />
          )}
          {children}
        </main>

        {/* Sticky to the top of the viewport, but max-height + overflow-y-auto
            lets the rail scroll internally when its content (long bonus list,
            big standings) exceeds the viewport. Without this, content past
            the fold is unreachable on tall pages. */}
        <aside
          aria-label="Pool snapshot"
          className="hidden lg:sticky lg:top-[4.5rem] lg:block lg:max-h-[calc(100vh-5rem)] lg:self-start lg:overflow-y-auto"
        >
          <CompanionRail
            standings={standings}
            myPicks={myPicks}
            bonuses={bonuses}
            liveCtx={liveCtx}
            meName={session.entrant_name}
          />
        </aside>
      </div>
    </>
  );
}
