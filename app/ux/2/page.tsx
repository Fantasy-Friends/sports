"use client";

import Link from "next/link";
import { useState } from "react";

/*
 * DIRECTION 2 — COMMAND  (Scoreboard 75 / Clubhouse 25)
 *
 * Dashboard-first. Most of the screen is dense data tiles like Scoreboard,
 * but a chat panel is always present — bottom on mobile, right rail on
 * desktop — so you can drop a take or skim what the room is saying without
 * leaving the data view.
 *
 * Trading-terminal-with-a-chat-sidebar energy.
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

function Avatar({ drafter, size = "sm" }: { drafter: Drafter; size?: "xs" | "sm" }) {
  const dim = size === "xs" ? "h-5 w-5 text-[8px]" : "h-6 w-6 text-[9px]";
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

// -- Tile shell --

function Tile({
  label,
  extra,
  children,
  href,
  className,
}: {
  label: string;
  extra?: React.ReactNode;
  children: React.ReactNode;
  href?: string;
  className?: string;
}) {
  const body = (
    <div className={`flex h-full flex-col rounded-2xl border border-border/40 bg-surface/60 p-3 transition-colors hover:border-accent/40 ${className ?? ""}`}>
      <div className="mb-2.5 flex items-baseline justify-between gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted">{label}</div>
        {extra ? <div className="text-[10px] text-muted">{extra}</div> : null}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

// -- Tiles (compact set, pruned from Scoreboard) --

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
      href="/ux/1"
    >
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted">Event</div>
          <div className="mt-0.5 text-sm font-semibold text-info">The Masters</div>
          <div className="text-[10px] text-muted">Round 3</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted">Leader</div>
          <div className="mt-0.5 text-sm font-semibold text-info tabular-nums">Scheffler &nbsp;<span className="text-emerald-600">-11</span></div>
          <div className="text-[10px] text-muted">Chris</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted">Cut line</div>
          <div className="mt-0.5 text-sm font-semibold text-info tabular-nums">50 made</div>
          <div className="text-[10px] text-muted">+3 or better</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted">Your rank</div>
          <div className="mt-0.5 text-sm font-semibold text-info tabular-nums">3 / 9</div>
          <div className="text-[10px] text-muted">7 back of leader</div>
        </div>
      </div>
    </Tile>
  );
}

const POOL = [
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

function PoolTile() {
  return (
    <Tile label="Pool standings" extra="Live" href="/leaderboard">
      <ol className="space-y-1">
        {POOL.map((row) => {
          const d = drafterBySlug(row.slug);
          if (!d) return null;
          const sign = row.delta === 0 ? "" : row.delta < 0 ? "↓" : "↑";
          const color = row.delta === 0 ? "text-muted" : row.delta < 0 ? "text-emerald-600" : "text-danger";
          return (
            <li key={row.slug} className={`flex items-center gap-2 rounded-md px-1.5 py-1 text-sm ${d.isMe ? "bg-accent/10" : ""}`}>
              <span className="w-3 shrink-0 text-xs tabular-nums text-muted">{row.rank}</span>
              <Avatar drafter={d} size="xs" />
              <span className="flex-1 truncate font-medium">
                {d.name}
                {d.isMe && <span className="ml-1 text-[10px] uppercase tracking-wide text-accent">you</span>}
              </span>
              <span className="w-9 shrink-0 text-right font-semibold tabular-nums">{formatToPar(row.total)}</span>
              <span className={`w-6 shrink-0 text-right text-[11px] tabular-nums ${color}`}>
                {sign}{row.delta !== 0 ? Math.abs(row.delta) : ""}
              </span>
            </li>
          );
        })}
      </ol>
    </Tile>
  );
}

const GOLFERS = [
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
    <Tile label="Tournament" extra="Top 8" href="/tournament">
      <ul className="space-y-0.5">
        {GOLFERS.map((row) => {
          const d = DRAFTERS.find((x) => x.name === row.drafter);
          return (
            <li key={`${row.pos}-${row.name}`} className="flex items-center gap-2 px-1 py-1 text-sm">
              <span className="w-6 shrink-0 text-[11px] font-semibold tabular-nums text-muted">{row.pos}</span>
              <span className="flex-1 truncate">{row.name}</span>
              {d && <Avatar drafter={d} size="xs" />}
              <span className="w-8 shrink-0 text-right text-[10px] tabular-nums text-muted">{row.thru}</span>
              <span className={`w-9 shrink-0 text-right font-semibold tabular-nums ${row.toPar < -5 ? "text-emerald-600" : row.toPar < 0 ? "" : "text-muted"}`}>
                {formatToPar(row.toPar)}
              </span>
            </li>
          );
        })}
      </ul>
    </Tile>
  );
}

const MY_PICKS = [
  { golfer: "Rory McIlroy",  pos: "2",   toPar: -9,  cut: false },
  { golfer: "Jordan Spieth", pos: "T22", toPar: -1,  cut: false },
  { golfer: "Shane Lowry",   pos: "T15", toPar: -3,  cut: false },
  { golfer: "Cameron Smith", pos: "T40", toPar: +4,  cut: false },
  { golfer: "Daniel Berger", pos: "CUT", toPar: null as number | null, cut: true },
  { golfer: "Ryan Fox",      pos: "CUT", toPar: +5,  cut: true },
];

function MyPicksTile() {
  return (
    <Tile label="My picks" extra="4 counting · Dusty" href="/leaderboard">
      <ul className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
        {MY_PICKS.map((p, idx) => (
          <li key={p.golfer} className="flex items-center gap-2 text-xs">
            <span className="w-3 shrink-0 text-[10px] text-muted tabular-nums">{idx + 1}</span>
            <span className={`flex-1 truncate ${p.cut ? "text-muted line-through" : ""}`}>{p.golfer}</span>
            <span className="w-9 shrink-0 text-right text-[10px] tabular-nums text-muted">{p.pos}</span>
            <span className={`w-9 shrink-0 text-right font-semibold tabular-nums ${p.toPar === null ? "text-muted" : p.toPar < -5 ? "text-emerald-600" : p.toPar < 0 ? "" : p.toPar > 2 ? "text-danger" : "text-muted"}`}>
              {p.toPar === null ? "—" : formatToPar(p.toPar)}
            </span>
          </li>
        ))}
      </ul>
    </Tile>
  );
}

const UPCOMING = [
  { name: "Kentucky Derby",   tier: 2 as const, daysAway: 11, status: "Open entry" },
  { name: "PGA Championship", tier: 2 as const, daysAway: 23, status: "Scheduled" },
  { name: "Memorial",         tier: 1 as const, daysAway: 44, status: "Scheduled" },
];

function UpcomingTile() {
  return (
    <Tile label="Upcoming" href="/calendar">
      <ul className="space-y-1.5">
        {UPCOMING.map((e) => (
          <li key={e.name} className="flex items-center gap-2 text-xs">
            <span
              className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-[9px] font-bold ${e.tier === 2 ? "bg-info/15 text-info" : "bg-surface/70 text-muted"}`}
            >
              T{e.tier}
            </span>
            <span className="flex-1 truncate font-medium">{e.name}</span>
            <span className="shrink-0 text-[10px] text-muted">{e.status}</span>
            <span className="w-7 shrink-0 text-right text-[10px] tabular-nums text-muted">{e.daysAway}d</span>
          </li>
        ))}
      </ul>
    </Tile>
  );
}

function HotSeatTile() {
  const thom = drafterBySlug("thom")!;
  return (
    <Tile label="Hot Seat" extra="Wk Apr 21" href="/hot-seat">
      <div className="flex items-center gap-2">
        <Avatar drafter={thom} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-text">{thom.name}</div>
          <div className="text-[10px] text-muted">+400 · 0/3 vetos · Mon 5pm</div>
        </div>
      </div>
      <div className="mt-2 rounded-lg border border-border/40 bg-bg/60 px-2.5 py-1.5 text-xs text-text">
        &ldquo;Scheffler wins the Masters outright&rdquo;
      </div>
    </Tile>
  );
}

// -- Chat sidebar (the 25%) --

const CHANNELS = [
  { id: "masters", handle: "#masters", unread: 12, accent: "#2f9e44" },
  { id: "general", handle: "#general", unread: 0, accent: "#64748b" },
  { id: "hot-takes", handle: "#hot-takes", unread: 5, accent: "#ea580c" },
];

type RoomMsg = { id: string; by: string; text: string; ago: string; reactions?: string };

const ROOM: Record<string, RoomMsg[]> = {
  masters: [
    { id: "r1", by: "wes",   text: "Aberg + Morikawa both top-5. Bank it.",                         ago: "52m", reactions: "💰 3" },
    { id: "r2", by: "dusty", text: "Rory eagle on 8 🚀",                                            ago: "90m", reactions: "🚀 4 · ☘️ 2" },
    { id: "r3", by: "thom",  text: "Rahm WD has me spiraling",                                      ago: "38m", reactions: "💀 7" },
    { id: "r4", by: "chris", text: "the curse continues",                                           ago: "35m" },
    { id: "r5", by: "cody",  text: "MACINTYRE LET'S GOOOOO",                                        ago: "10m", reactions: "🔥 6 · 🏴 4" },
    { id: "r6", by: "dusty", text: "ok so if Rory holds and Scheffler blows up on Sunday…",        ago: "3m", reactions: "🙏 2" },
  ],
  general: [
    { id: "g1", by: "wes",   text: "nice round yesterday everyone",                                 ago: "1d" },
    { id: "g2", by: "rod",   text: "who else is in for Derby? haven't even looked yet",            ago: "6h" },
    { id: "g3", by: "dan",   text: "same, waiting on post positions",                               ago: "5h" },
  ],
  "hot-takes": [
    { id: "h1", by: "vobe",  text: "DeChambeau goes -7 on Sunday. mark it.",                       ago: "6h", reactions: "🫣 5" },
    { id: "h2", by: "chris", text: "Scheffler +350 pre-tournament was daylight robbery",            ago: "3h", reactions: "🐐 3" },
    { id: "h3", by: "cody",  text: "everyone is sleeping on Macintyre",                             ago: "12h" },
  ],
};

function ChatPanel() {
  const [activeChannel, setActiveChannel] = useState("masters");
  const [composer, setComposer] = useState("");
  const messages = ROOM[activeChannel] ?? [];
  return (
    <aside className="soft-card flex h-full flex-col rounded-2xl border border-border/40 bg-surface/60">
      <div className="border-b border-border/30 p-2">
        <div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted">Room</div>
        <div className="-mx-0.5 flex flex-wrap gap-1 px-0.5">
          {CHANNELS.map((c) => {
            const active = activeChannel === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setActiveChannel(c.id)}
                className={`group inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors ${active ? "bg-accent text-white" : "bg-surface/70 text-text hover:bg-surface"}`}
              >
                <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: active ? "white" : c.accent }} />
                {c.handle}
                {!active && c.unread > 0 && (
                  <span className="inline-flex min-w-[1rem] items-center justify-center rounded-full bg-accent/20 px-1 text-[9px] font-bold text-accent">
                    {c.unread}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <ul className="flex-1 space-y-2 overflow-y-auto p-3">
        {messages.map((m) => {
          const d = drafterBySlug(m.by);
          if (!d) return null;
          return (
            <li key={m.id} className="flex gap-2">
              <Avatar drafter={d} size="xs" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[11px] font-semibold text-info">{d.name}</span>
                  <span className="text-[9px] uppercase tracking-wide text-muted">{m.ago} ago</span>
                </div>
                <div className="text-[12px] leading-snug text-text">{m.text}</div>
                {m.reactions && (
                  <div className="mt-0.5 inline-flex rounded-full border border-border/30 bg-bg/60 px-1.5 py-0.5 text-[10px] text-muted">
                    {m.reactions}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="border-t border-border/30 p-2">
        <div className="flex items-center gap-1.5">
          <input
            value={composer}
            onChange={(e) => setComposer(e.target.value)}
            placeholder={`Post in ${CHANNELS.find((c) => c.id === activeChannel)?.handle}…`}
            className="min-h-[36px] flex-1 rounded-lg border border-border/40 bg-bg/60 px-2.5 text-[12px] focus:border-accent/50 focus:outline-none"
          />
          {["🔥", "💀"].map((e) => (
            <button key={e} type="button" className="rounded-md px-1.5 py-1 text-base hover:scale-110" aria-label={`React ${e}`}>{e}</button>
          ))}
        </div>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------

export default function CommandPrototype() {
  return (
    <main className="space-y-3">
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-[1.25rem] border border-border/40 bg-surface/70 px-4 py-3 backdrop-blur-xl">
        <div>
          <div className="text-[10px] uppercase tracking-[0.28em] text-muted">Command</div>
          <h1 className="text-lg font-semibold">Dashboard &middot; chat at hand</h1>
        </div>
        <span className="hidden text-[10px] uppercase tracking-wider text-muted sm:inline">75% data &middot; 25% room</span>
      </section>

      {/* 75/25 split: dashboard takes 3 of 4 columns at lg+, chat the last column */}
      <section className="grid gap-3 lg:grid-cols-4">
        <div className="space-y-3 lg:col-span-3">
          <LiveNowTile />
          <div className="grid gap-3 sm:grid-cols-2">
            <PoolTile />
            <GolferTile />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <MyPicksTile />
            <UpcomingTile />
          </div>
          <HotSeatTile />
        </div>

        {/* Chat lives at the bottom on mobile/tablet, as a sticky right rail on lg+ */}
        <div className="lg:col-span-1">
          <div className="lg:sticky lg:top-3 lg:h-[calc(100vh-2rem)]">
            <ChatPanel />
          </div>
        </div>
      </section>

      <div className="text-center text-[10px] uppercase tracking-[0.2em] text-muted">
        Command prototype · Direction 2 of 5 ·{" "}
        <Link href="/ux" className="text-accent underline-offset-4 hover:underline">
          compare
        </Link>
      </div>
    </main>
  );
}
