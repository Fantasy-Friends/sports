"use client";

import Link from "next/link";
import { useState } from "react";

/*
 * DIRECTION 4 — SCOREBOARD
 *
 * Data-first dashboard. Every important number is visible on one screen —
 * live scoring, pool standings, golfer leaderboard, recent takes, bonuses,
 * upcoming events, hot seat, your picks — in a dense tile grid.
 *
 * Nothing is hidden behind a scroll or a tab. This is the "I want to glance
 * at my league and see everything" view. Bloomberg-terminal energy but for
 * a friend-pool.
 */

type Drafter = {
  slug: string;
  name: string;
  initials: string;
  tint: string;
  isMe?: boolean;
};

const DRAFTERS: Drafter[] = [
  { slug: "chris", name: "Chris", initials: "CH", tint: "#d77a3a" },
  { slug: "dusty", name: "Dusty", initials: "DU", tint: "#2f9e44", isMe: true },
  { slug: "vobe",  name: "Vobe",  initials: "VO", tint: "#4c6ef5" },
  { slug: "cody",  name: "Cody",  initials: "CO", tint: "#e03131" },
  { slug: "wes",   name: "Wes",   initials: "WE", tint: "#e8a82a" },
  { slug: "dan",   name: "Dan",   initials: "DA", tint: "#a855c7" },
  { slug: "thom",  name: "Thom",  initials: "TH", tint: "#0ea5e9" },
  { slug: "rod",   name: "Rod",   initials: "RO", tint: "#14b8a6" },
  { slug: "nate",  name: "Nate",  initials: "NA", tint: "#64748b" },
];

function drafterBySlug(slug: string) {
  return DRAFTERS.find((d) => d.slug === slug);
}

function formatToPar(value: number): string {
  if (value === 0) return "E";
  return value > 0 ? `+${value}` : `${value}`;
}

function Avatar({ drafter, size = "md" }: { drafter: Drafter; size?: "xs" | "sm" | "md" }) {
  const dim =
    size === "xs"
      ? "h-5 w-5 text-[8px]"
      : size === "sm"
        ? "h-6 w-6 text-[9px]"
        : "h-7 w-7 text-[10px]";
  return (
    <div
      className={`${dim} inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white`}
      style={{ background: drafter.tint }}
      aria-label={drafter.name}
    >
      {drafter.initials}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tile shell
// ---------------------------------------------------------------------------

function Tile({
  label,
  extra,
  span,
  children,
  href,
}: {
  label: string;
  extra?: React.ReactNode;
  span?: string;
  children: React.ReactNode;
  href?: string;
}) {
  const body = (
    <div className="flex h-full flex-col rounded-2xl border border-border/40 bg-surface/60 p-3 transition-colors hover:border-accent/40 hover:bg-surface/80">
      <div className="mb-2.5 flex items-baseline justify-between gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted">{label}</div>
        {extra ? <div className="text-[10px] text-muted">{extra}</div> : null}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
  if (href) {
    return (
      <Link href={href} className={`block ${span ?? ""}`}>
        {body}
      </Link>
    );
  }
  return <div className={span}>{body}</div>;
}

// ---------------------------------------------------------------------------
// Tile: Live Now (full width hero)
// ---------------------------------------------------------------------------

function LiveNowTile() {
  return (
    <Tile
      label="Live now"
      extra={
        <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-600">
          <span className="relative inline-flex h-1.5 w-1.5">
            <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500/70" />
            <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </span>
          Live
        </span>
      }
      span="sm:col-span-2 lg:col-span-3 xl:col-span-4"
      href="/ux/1"
    >
      <div className="grid grid-cols-2 gap-x-5 gap-y-2 sm:grid-cols-4">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted">Event</div>
          <div className="mt-0.5 text-sm font-semibold text-info">The Masters</div>
          <div className="text-[10px] text-muted">Round 3 · Saturday</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted">Leader</div>
          <div className="mt-0.5 text-sm font-semibold text-info tabular-nums">Scheffler &nbsp;<span className="text-emerald-600">-11</span></div>
          <div className="text-[10px] text-muted">drafted · Chris</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted">Cut line</div>
          <div className="mt-0.5 text-sm font-semibold text-info tabular-nums">50 made · <span className="text-danger">+3 or better</span></div>
          <div className="text-[10px] text-muted">18 missed</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted">Your pool rank</div>
          <div className="mt-0.5 text-sm font-semibold text-info tabular-nums">3<span className="text-muted text-xs"> / 9</span></div>
          <div className="text-[10px] text-muted">-11 · 7 back of leader</div>
        </div>
      </div>
    </Tile>
  );
}

// ---------------------------------------------------------------------------
// Tile: Pool Standings
// ---------------------------------------------------------------------------

type Standing = { rank: number; slug: string; total: number; delta: number };

const POOL: Standing[] = [
  { rank: 1, slug: "chris", total: -18, delta: -2 },
  { rank: 2, slug: "wes",   total: -12, delta: -1 },
  { rank: 3, slug: "dusty", total: -11, delta: +1 },
  { rank: 4, slug: "dan",   total: -8,  delta:  0 },
  { rank: 5, slug: "cody",  total: -7,  delta: -2 },
  { rank: 6, slug: "vobe",  total: -4,  delta: +1 },
  { rank: 7, slug: "thom",  total: -2,  delta: +3 },
  { rank: 8, slug: "rod",   total: +1,  delta:  0 },
  { rank: 9, slug: "nate",  total: +4,  delta: +2 },
];

function PoolStandingsTile() {
  return (
    <Tile label="Pool standings" extra="Masters · live" href="/leaderboard" span="sm:col-span-2 lg:col-span-2">
      <ol className="space-y-1">
        {POOL.map((row) => {
          const d = drafterBySlug(row.slug);
          if (!d) return null;
          const deltaSign = row.delta === 0 ? "" : row.delta < 0 ? "↓" : "↑";
          const deltaColor = row.delta === 0 ? "text-muted" : row.delta < 0 ? "text-emerald-600" : "text-danger";
          return (
            <li
              key={row.slug}
              className={[
                "flex items-center gap-2 rounded-md px-1.5 py-1 text-sm",
                d.isMe ? "bg-accent/10" : "",
              ].join(" ")}
            >
              <span className="w-4 shrink-0 text-xs font-semibold tabular-nums text-muted">{row.rank}</span>
              <Avatar drafter={d} size="xs" />
              <span className="flex-1 truncate font-medium">
                {d.name}
                {d.isMe ? <span className="ml-1 text-[10px] font-semibold uppercase tracking-wide text-accent">you</span> : null}
              </span>
              <span className="w-10 shrink-0 text-right font-semibold tabular-nums">{formatToPar(row.total)}</span>
              <span className={`w-7 shrink-0 text-right text-[11px] tabular-nums ${deltaColor}`}>
                {deltaSign}{row.delta !== 0 ? Math.abs(row.delta) : ""}
              </span>
            </li>
          );
        })}
      </ol>
    </Tile>
  );
}

// ---------------------------------------------------------------------------
// Tile: Golfer Leaderboard
// ---------------------------------------------------------------------------

type TeeUp = { pos: string; name: string; toPar: number; thru: string; drafter: string };

const GOLFERS: TeeUp[] = [
  { pos: "1",  name: "Scottie Scheffler", toPar: -11, thru: "F",  drafter: "Chris" },
  { pos: "2",  name: "Rory McIlroy",      toPar: -9,  thru: "F",  drafter: "Dusty" },
  { pos: "3",  name: "Viktor Hovland",    toPar: -7,  thru: "F",  drafter: "Chris" },
  { pos: "T4", name: "Ludvig Aberg",      toPar: -6,  thru: "F",  drafter: "Wes" },
  { pos: "T4", name: "Collin Morikawa",   toPar: -6,  thru: "F",  drafter: "Wes" },
  { pos: "6",  name: "Robert Macintyre",  toPar: -5,  thru: "16", drafter: "Cody" },
  { pos: "T7", name: "Bryson DeChambeau", toPar: -4,  thru: "15", drafter: "Vobe" },
  { pos: "T7", name: "Xander Schauffele", toPar: -4,  thru: "14", drafter: "Dan" },
];

function GolferTile() {
  return (
    <Tile label="Tournament" extra="Round 3 · top 8" href="/tournament" span="sm:col-span-2 lg:col-span-2">
      <ul className="space-y-0.5">
        {GOLFERS.map((row) => {
          const d = DRAFTERS.find((x) => x.name === row.drafter);
          return (
            <li key={`${row.pos}-${row.name}`} className="flex items-center gap-2 px-1 py-1 text-sm">
              <span className="w-7 shrink-0 text-[11px] font-semibold tabular-nums text-muted">{row.pos}</span>
              <span className="flex-1 truncate">{row.name}</span>
              {d && <Avatar drafter={d} size="xs" />}
              <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-muted">{row.thru}</span>
              <span
                className={[
                  "w-10 shrink-0 text-right font-semibold tabular-nums",
                  row.toPar < -5 ? "text-emerald-600" : row.toPar < 0 ? "" : "text-muted",
                ].join(" ")}
              >
                {formatToPar(row.toPar)}
              </span>
            </li>
          );
        })}
      </ul>
    </Tile>
  );
}

// ---------------------------------------------------------------------------
// Tile: Recent takes (condensed)
// ---------------------------------------------------------------------------

type Take = { by: string; text: string; ago: string; reactions: number };

const TAKES: Take[] = [
  { by: "dusty", text: "ok so if Rory holds and Scheffler blows up…", ago: "3m", reactions: 3 },
  { by: "cody",  text: "MACINTYRE LET'S GOOOOO", ago: "10m", reactions: 10 },
  { by: "thom",  text: "Rahm WD has me spiraling", ago: "38m", reactions: 9 },
  { by: "vobe",  text: "DeChambeau bombing 400+. Can he make a putt", ago: "1h", reactions: 3 },
  { by: "wes",   text: "Aberg + Morikawa both top-5. Bank it.", ago: "52m", reactions: 3 },
];

function RecentTakesTile() {
  return (
    <Tile label="Hot takes" extra="Last 5" span="sm:col-span-2 lg:col-span-2">
      <ul className="space-y-1.5">
        {TAKES.map((t) => {
          const d = drafterBySlug(t.by);
          if (!d) return null;
          return (
            <li key={t.by + t.text} className="flex items-center gap-2 text-xs">
              <Avatar drafter={d} size="xs" />
              <span className="font-semibold text-text">{d.name}</span>
              <span className="flex-1 truncate text-muted">{t.text}</span>
              <span className="shrink-0 text-[10px] tabular-nums text-muted">{t.ago}</span>
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-bg/60 px-1 text-[10px] text-muted">
                <span>🔥</span>
                <span className="tabular-nums">{t.reactions}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </Tile>
  );
}

// ---------------------------------------------------------------------------
// Tile: Upcoming events
// ---------------------------------------------------------------------------

type Upcoming = { name: string; tier: 1 | 2 | 3; daysAway: number; status: string };

const UPCOMING: Upcoming[] = [
  { name: "Kentucky Derby",    tier: 2, daysAway: 11,  status: "Open entry" },
  { name: "PGA Championship",  tier: 2, daysAway: 23,  status: "Scheduled" },
  { name: "Memorial",          tier: 1, daysAway: 44,  status: "Scheduled" },
  { name: "U.S. Open",         tier: 3, daysAway: 58,  status: "Scheduled" },
];

function UpcomingTile() {
  return (
    <Tile label="Upcoming" extra={`${UPCOMING.length} events`} href="/calendar">
      <ul className="space-y-1.5">
        {UPCOMING.map((e) => (
          <li key={e.name} className="flex items-center gap-2 text-xs">
            <span
              className={[
                "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-[9px] font-bold",
                e.tier === 3
                  ? "bg-accent/20 text-accent"
                  : e.tier === 2
                    ? "bg-info/15 text-info"
                    : "bg-surface/70 text-muted",
              ].join(" ")}
              aria-label={`Tier ${e.tier}`}
            >
              T{e.tier}
            </span>
            <span className="flex-1 truncate font-medium">{e.name}</span>
            <span className="shrink-0 text-[10px] text-muted">{e.status}</span>
            <span className="w-8 shrink-0 text-right text-[10px] tabular-nums text-muted">{e.daysAway}d</span>
          </li>
        ))}
      </ul>
    </Tile>
  );
}

// ---------------------------------------------------------------------------
// Tile: Bonuses this season
// ---------------------------------------------------------------------------

type Bonus = { who: string; type: string; points: number; event: string };

const BONUSES: Bonus[] = [
  { who: "dusty", type: "Survivor",      points: 6, event: "Masters"     },
  { who: "chris", type: "Golden Ticket", points: 4, event: "Masters"     },
  { who: "wes",   type: "WM Mark",       points: 3, event: "WM Phoenix"  },
  { who: "dan",   type: "Perfect Week",  points: 5, event: "NFL Week 12" },
];

function BonusesTile() {
  return (
    <Tile label="Bonuses" extra="Season">
      <ul className="space-y-1.5">
        {BONUSES.map((b) => {
          const d = drafterBySlug(b.who);
          if (!d) return null;
          return (
            <li key={`${b.who}-${b.type}`} className="flex items-center gap-2 text-xs">
              <Avatar drafter={d} size="xs" />
              <span className="truncate text-text">{d.name}</span>
              <span className="flex-1 truncate text-muted">{b.type}</span>
              <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 font-bold tabular-nums text-amber-700">
                +{b.points}
              </span>
            </li>
          );
        })}
      </ul>
    </Tile>
  );
}

// ---------------------------------------------------------------------------
// Tile: Hot Seat
// ---------------------------------------------------------------------------

function HotSeatTile() {
  const thom = drafterBySlug("thom")!;
  return (
    <Tile label="Hot Seat" extra="Week of Apr 21" href="/hot-seat">
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Avatar drafter={thom} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-text">{thom.name}</div>
            <div className="text-[10px] uppercase tracking-wide text-muted">Declared · +400</div>
          </div>
          <span className="inline-flex rounded-md bg-pink-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-pink-700">
            Voting
          </span>
        </div>
        <div className="rounded-lg border border-border/40 bg-bg/60 p-2 text-xs text-text">
          &ldquo;Scheffler wins the Masters outright&rdquo;
        </div>
        <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-muted">
          <span>0 vetos / 3 needed</span>
          <span>Closes Mon 5pm</span>
        </div>
      </div>
    </Tile>
  );
}

// ---------------------------------------------------------------------------
// Tile: My picks
// ---------------------------------------------------------------------------

type MyPick = { golfer: string; pos: string | null; toPar: number | null; cut?: boolean };

const MY_PICKS: MyPick[] = [
  { golfer: "Rory McIlroy",  pos: "2",  toPar: -9 },
  { golfer: "Jordan Spieth", pos: "T22", toPar: -1 },
  { golfer: "Shane Lowry",   pos: "T15", toPar: -3 },
  { golfer: "Cameron Smith", pos: "T40", toPar: +4, cut: false },
  { golfer: "Daniel Berger", pos: null, toPar: null, cut: true },
  { golfer: "Ryan Fox",      pos: "CUT", toPar: +5, cut: true },
];

function MyPicksTile() {
  return (
    <Tile label="My picks" extra="Dusty · 4 counting" href="/leaderboard" span="sm:col-span-2">
      <ul className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
        {MY_PICKS.map((p, idx) => (
          <li key={p.golfer} className="flex items-center gap-2 text-xs">
            <span className="w-4 shrink-0 text-[10px] text-muted tabular-nums">{idx + 1}</span>
            <span className={["flex-1 truncate", p.cut ? "text-muted line-through" : ""].join(" ")}>
              {p.golfer}
            </span>
            <span className="w-9 shrink-0 text-right text-[10px] tabular-nums text-muted">{p.pos ?? "—"}</span>
            <span
              className={[
                "w-9 shrink-0 text-right font-semibold tabular-nums",
                p.toPar === null
                  ? "text-muted"
                  : p.toPar < -5
                    ? "text-emerald-600"
                    : p.toPar < 0
                      ? ""
                      : p.toPar > 2
                        ? "text-danger"
                        : "text-muted",
              ].join(" ")}
            >
              {p.toPar === null ? "—" : formatToPar(p.toPar)}
            </span>
          </li>
        ))}
      </ul>
    </Tile>
  );
}

// ---------------------------------------------------------------------------
// Tile: Season progress
// ---------------------------------------------------------------------------

function SeasonProgressTile() {
  const tiers = [
    { tier: 3, label: "Tier 3 · 5×", completed: 3, total: 6, color: "bg-accent" },
    { tier: 2, label: "Tier 2 · 2.5×", completed: 5, total: 11, color: "bg-info" },
    { tier: 1, label: "Tier 1 · 1×", completed: 4, total: 24, color: "bg-slate-500" },
  ];
  return (
    <Tile label="Season arc" extra="2026 Decathlon">
      <div className="space-y-2.5">
        {tiers.map((t) => {
          const pct = Math.round((t.completed / t.total) * 100);
          return (
            <div key={t.tier}>
              <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide text-muted">
                <span>{t.label}</span>
                <span className="tabular-nums">
                  {t.completed}/{t.total}
                </span>
              </div>
              <div className="relative h-1.5 overflow-hidden rounded-full bg-bg/80">
                <div className={`absolute inset-y-0 left-0 ${t.color}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </Tile>
  );
}

// ---------------------------------------------------------------------------

export default function ScoreboardPrototype() {
  const [density, setDensity] = useState<"compact" | "comfortable">("compact");

  return (
    <main className={density === "compact" ? "space-y-3" : "space-y-4"}>
      {/* Header bar */}
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-[1.25rem] border border-border/40 bg-surface/70 px-4 py-3 backdrop-blur-xl">
        <div>
          <div className="text-[10px] uppercase tracking-[0.28em] text-muted">Scoreboard</div>
          <h1 className="text-lg font-semibold">The 2026 Decathlon &middot; at a glance</h1>
        </div>
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted">
          <span className="hidden sm:inline">Updated 22s ago</span>
          <div className="inline-flex items-center rounded-md border border-border/40 bg-bg/60 p-0.5">
            {(["compact", "comfortable"] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDensity(d)}
                aria-pressed={density === d}
                className={[
                  "rounded px-2 py-0.5 text-[10px] font-semibold tracking-wider transition-colors",
                  density === d ? "bg-accent text-white" : "text-muted hover:text-text",
                ].join(" ")}
              >
                {d.charAt(0).toUpperCase() + d.slice(1)}
              </button>
            ))}
          </div>
          <kbd className="hidden rounded border border-border/40 bg-bg/60 px-1.5 py-0.5 font-mono text-[10px] text-muted sm:inline-block">
            ⌘K
          </kbd>
        </div>
      </section>

      {/* Grid */}
      <section
        className={[
          "grid gap-3",
          density === "comfortable" ? "sm:gap-4" : "",
          "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
        ].join(" ")}
      >
        <LiveNowTile />
        <PoolStandingsTile />
        <GolferTile />
        <MyPicksTile />
        <RecentTakesTile />
        <UpcomingTile />
        <BonusesTile />
        <HotSeatTile />
        <SeasonProgressTile />
      </section>

      <div className="text-center text-[10px] uppercase tracking-[0.2em] text-muted">
        Scoreboard prototype · Direction 4 of 5 ·{" "}
        <Link href="/ux" className="text-accent underline-offset-4 hover:underline">
          compare
        </Link>
      </div>
    </main>
  );
}
