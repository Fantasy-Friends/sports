"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

/*
 * DIRECTION 3 — CLUBHOUSE
 *
 * Chat is the main surface. You pick a channel (#masters, #derby,
 * #hot-takes, #hot-seat, #general) and you live inside that room.
 * Scores, bonuses, picks, and event locks are not a separate surface —
 * they show up IN the chat stream as rich cards alongside the takes.
 *
 * Mental model: Discord/Slack for a private sports pool. The room is
 * the organizing principle, not the event or the timeline.
 */

type Drafter = {
  slug: string;
  name: string;
  initials: string;
  tint: string;
};

type Reaction = { emoji: string; count: number };

type ChatMsg =
  | { kind: "system"; id: string; ts: number; text: string }
  | {
      kind: "text";
      id: string;
      ts: number;
      by: string;
      text: string;
      replyTo?: string;
      reactions?: Reaction[];
    }
  | {
      kind: "score";
      id: string;
      ts: number;
      golfer: string;
      headline: string;
      detail: string;
      drafter: string;
    }
  | {
      kind: "bonus";
      id: string;
      ts: number;
      title: string;
      detail: string;
      reactions?: Reaction[];
    }
  | {
      kind: "pick";
      id: string;
      ts: number;
      by: string;
      golfer: string;
      round: number;
    }
  | {
      kind: "event-lock";
      id: string;
      ts: number;
      event: string;
      detail: string;
      cta?: { label: string; href: string };
    }
  | {
      kind: "hot-seat";
      id: string;
      ts: number;
      by: string;
      declaration: string;
      odds: number;
      vetosAt: string;
    }
  | {
      kind: "poll";
      id: string;
      ts: number;
      by: string;
      prompt: string;
      options: Array<{ label: string; votes: number }>;
    };

type Channel = {
  id: string;
  handle: string;
  name: string;
  description: string;
  unread: number;
  accent: string;
};

const DRAFTERS: Drafter[] = [
  { slug: "chris", name: "Chris", initials: "CH", tint: "#d77a3a" },
  { slug: "dusty", name: "Dusty", initials: "DU", tint: "#2f9e44" },
  { slug: "vobe",  name: "Vobe",  initials: "VO", tint: "#4c6ef5" },
  { slug: "cody",  name: "Cody",  initials: "CO", tint: "#e03131" },
  { slug: "wes",   name: "Wes",   initials: "WE", tint: "#e8a82a" },
  { slug: "dan",   name: "Dan",   initials: "DA", tint: "#a855c7" },
  { slug: "thom",  name: "Thom",  initials: "TH", tint: "#0ea5e9" },
  { slug: "rod",   name: "Rod",   initials: "RO", tint: "#14b8a6" },
  { slug: "nate",  name: "Nate",  initials: "NA", tint: "#64748b" },
];

const NOW = Date.now();
const mins = (n: number) => NOW - n * 60_000;
const hrs = (n: number) => NOW - n * 3_600_000;

function drafterBySlug(slug: string): Drafter | undefined {
  return DRAFTERS.find((d) => d.slug === slug);
}

function formatAgo(ts: number): string {
  const diff = NOW - ts;
  const m = Math.round(diff / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  return `${d}d`;
}

const CHANNELS: Channel[] = [
  {
    id: "general",
    handle: "#general",
    name: "General",
    description: "Season-wide catch-all",
    unread: 0,
    accent: "#64748b",
  },
  {
    id: "masters",
    handle: "#masters",
    name: "Masters",
    description: "The Masters · Live Round 3",
    unread: 12,
    accent: "#2f9e44",
  },
  {
    id: "derby",
    handle: "#derby",
    name: "Kentucky Derby",
    description: "Opens May 2 · entries due Sat",
    unread: 2,
    accent: "#be185d",
  },
  {
    id: "hot-takes",
    handle: "#hot-takes",
    name: "Hot Takes",
    description: "No takes too hot",
    unread: 5,
    accent: "#ea580c",
  },
  {
    id: "hot-seat",
    handle: "#hot-seat",
    name: "Hot Seat",
    description: "Weekly longshot ritual",
    unread: 1,
    accent: "#db2777",
  },
];

const PRESENCE: Record<string, string[]> = {
  general: ["chris", "dusty", "wes", "rod"],
  masters: ["chris", "dusty", "vobe", "cody", "wes", "dan"],
  derby: ["vobe", "thom"],
  "hot-takes": ["chris", "dusty", "vobe", "cody", "dan"],
  "hot-seat": ["thom", "dan", "wes"],
};

const MESSAGES: Record<string, ChatMsg[]> = {
  general: [
    { kind: "system", id: "g1", ts: hrs(26), text: "Week 4 of the season · 3 events final" },
    { kind: "text", id: "g2", ts: hrs(26), by: "wes", text: "nice round yesterday everyone" },
    { kind: "text", id: "g3", ts: hrs(25), by: "chris", text: "tee times for Sunday just posted. Scheffler 2:45 with Rory" },
    { kind: "event-lock", id: "g4", ts: hrs(24), event: "Kentucky Derby", detail: "20-horse field posts Wednesday · entries lock Saturday 1pm ET", cta: { label: "#derby", href: "/ux/3?c=derby" } },
    { kind: "text", id: "g5", ts: hrs(6), by: "rod", text: "who else is thinking about Derby? I haven't looked yet" },
    { kind: "text", id: "g6", ts: hrs(5), by: "dan", text: "same, waiting on post positions", replyTo: "g5" },
  ],
  masters: [
    { kind: "system", id: "m1", ts: hrs(7), text: "Round 3 underway · 50 made the cut · Scheffler -11 leads" },
    { kind: "text", id: "m2", ts: hrs(3), by: "wes", text: "Aberg + Morikawa both top-5 and cruising. Bank it.", reactions: [{ emoji: "💰", count: 3 }] },
    { kind: "score", id: "m3", ts: hrs(2), golfer: "Rory McIlroy", headline: "Eagle on 8", detail: "-9 thru 8 · jumps to 2nd", drafter: "Dusty" },
    { kind: "text", id: "m4", ts: mins(90), by: "dusty", text: "Rory with the eagle on 8 🚀", reactions: [{ emoji: "🚀", count: 4 }, { emoji: "☘️", count: 2 }] },
    { kind: "text", id: "m5", ts: mins(72), by: "chris", text: "Scheffler just doing Scheffler things", reactions: [{ emoji: "🐐", count: 5 }] },
    { kind: "text", id: "m6", ts: mins(60), by: "vobe", text: "DeChambeau bombing 400+ off every tee. Can he make a putt today tho", reactions: [{ emoji: "😂", count: 3 }] },
    { kind: "score", id: "m7", ts: mins(46), golfer: "Bryson DeChambeau", headline: "Bogey on 14", detail: "-4 thru 14 · falls T5 → T7", drafter: "Vobe" },
    { kind: "text", id: "m8", ts: mins(38), by: "thom", text: "Rahm WD has me spiraling", reactions: [{ emoji: "💀", count: 7 }, { emoji: "😭", count: 2 }] },
    { kind: "text", id: "m9", ts: mins(35), by: "chris", text: "the curse continues", replyTo: "m8" },
    { kind: "bonus", id: "m10", ts: mins(22), title: "Survivor → Dusty +6", detail: "All 6 of his Masters golfers made the cut. Auto-applied at the cut line.", reactions: [{ emoji: "🎉", count: 5 }, { emoji: "💰", count: 3 }] },
    { kind: "score", id: "m11", ts: mins(12), golfer: "Robert Macintyre", headline: "Birdie 17", detail: "-5 thru 17 · ↑ Cody 6th → 4th", drafter: "Cody" },
    { kind: "text", id: "m12", ts: mins(10), by: "cody", text: "MACINTYRE LET'S GOOOOO", reactions: [{ emoji: "🔥", count: 6 }, { emoji: "🏴", count: 4 }] },
    { kind: "text", id: "m13", ts: mins(3), by: "dusty", text: "ok so if Rory holds and Scheffler blows up on Sunday…", reactions: [{ emoji: "🙏", count: 2 }, { emoji: "😤", count: 1 }] },
  ],
  derby: [
    { kind: "system", id: "d1", ts: hrs(72), text: "#derby opened · 10 days to post" },
    { kind: "text", id: "d2", ts: hrs(48), by: "thom", text: "who do we like so far" },
    { kind: "text", id: "d3", ts: hrs(40), by: "vobe", text: "I've got a few longshots circled. waiting on the draw" },
    { kind: "event-lock", id: "d4", ts: hrs(26), event: "Kentucky Derby", detail: "Entries lock Saturday 1pm ET · pick 3 horses · best-finish scoring", cta: { label: "Make picks", href: "/events/2026-kentucky-derby/entry" } },
    { kind: "text", id: "d5", ts: hrs(2), by: "thom", text: "post positions land Wednesday around 6pm. I'll drop here as soon as they're up" },
  ],
  "hot-takes": [
    { kind: "system", id: "h1", ts: hrs(96), text: "No takes too hot" },
    { kind: "text", id: "h2", ts: hrs(18), by: "dusty", text: "Rahm was a mistake for me and I'll admit it", reactions: [{ emoji: "😅", count: 3 }] },
    { kind: "text", id: "h3", ts: hrs(12), by: "cody", text: "everyone is sleeping on Macintyre. he's making the weekend fun", reactions: [{ emoji: "👀", count: 4 }] },
    { kind: "text", id: "h4", ts: hrs(6), by: "vobe", text: "DeChambeau goes -7 on Sunday. mark it.", reactions: [{ emoji: "🫣", count: 5 }, { emoji: "💀", count: 2 }] },
    { kind: "text", id: "h5", ts: hrs(3), by: "chris", text: "Scheffler +350 pre-tournament was daylight robbery", reactions: [{ emoji: "🐐", count: 3 }] },
    { kind: "poll", id: "h6", ts: hrs(1), by: "dan", prompt: "Sunday 6pm leader?", options: [
      { label: "Scheffler", votes: 4 },
      { label: "Rory", votes: 3 },
      { label: "Field", votes: 2 },
    ] },
  ],
  "hot-seat": [
    { kind: "system", id: "s1", ts: hrs(18), text: "Week of Apr 21 · Thom is up" },
    { kind: "hot-seat", id: "s2", ts: hrs(17), by: "thom", declaration: "Scottie Scheffler wins the Masters outright", odds: 400, vetosAt: "Mon 5pm" },
    { kind: "text", id: "s3", ts: hrs(16), by: "wes", text: "approve. that's a real take.", reactions: [{ emoji: "👍", count: 2 }] },
    { kind: "text", id: "s4", ts: hrs(14), by: "chris", text: "approve" },
    { kind: "text", id: "s5", ts: hrs(8), by: "dan", text: "hmm +400 feels short for a hot seat tbh", replyTo: "s2" },
    { kind: "text", id: "s6", ts: hrs(6), by: "vobe", text: "approve. the bar is 'longshot', not 'impossible'", replyTo: "s5" },
    { kind: "text", id: "s7", ts: hrs(1), by: "dan", text: "fine approve. with prejudice." },
  ],
};

const REACTIONS = ["🔥", "🫣", "😭", "🤯", "💀", "🚀"];

function Avatar({ drafter, size = "md" }: { drafter: Drafter; size?: "sm" | "md" }) {
  const dim = size === "sm" ? "h-6 w-6 text-[9px]" : "h-8 w-8 text-[10px]";
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

function ReactionRow({ list, you, onTap }: { list: Reaction[]; you?: string; onTap: (emoji: string) => void }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {list.map((r) => (
        <span key={r.emoji} className="inline-flex items-center gap-1 rounded-full border border-border/40 bg-bg/60 px-2 py-0.5 text-xs">
          <span>{r.emoji}</span>
          <span className="text-muted">{r.count}</span>
        </span>
      ))}
      {you && (
        <span className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/15 px-2 py-0.5 text-xs text-accent">
          <span>{you}</span>
          <span>you</span>
        </span>
      )}
      <div className="flex items-center gap-0.5 pl-1">
        {REACTIONS.slice(0, 4).map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => onTap(emoji)}
            className="rounded-md px-1 text-sm opacity-40 transition-opacity hover:opacity-100"
            aria-label={`React ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageBlock({
  msg,
  replyTargetAuthor,
  onReact,
  youReacted,
}: {
  msg: ChatMsg;
  replyTargetAuthor?: Drafter;
  onReact: (id: string, emoji: string) => void;
  youReacted?: string;
}) {
  if (msg.kind === "system") {
    return (
      <div className="my-2 flex justify-center">
        <div className="rounded-full border border-border/40 bg-bg/50 px-3 py-1 text-[11px] uppercase tracking-wide text-muted">
          {msg.text} · {formatAgo(msg.ts)} ago
        </div>
      </div>
    );
  }

  if (msg.kind === "text") {
    const author = drafterBySlug(msg.by);
    if (!author) return null;
    return (
      <div className="flex gap-3 px-2 py-1.5 hover:bg-surface/40">
        <div className="pt-0.5">
          <Avatar drafter={author} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold text-info">{author.name}</span>
            <span className="text-[10px] uppercase tracking-wide text-muted">{formatAgo(msg.ts)} ago</span>
          </div>
          {msg.replyTo && replyTargetAuthor && (
            <div className="mt-0.5 border-l-2 border-border pl-2 text-[11px] text-muted">
              replying to {replyTargetAuthor.name}
            </div>
          )}
          <div className="mt-0.5 text-sm leading-snug text-text">{msg.text}</div>
          <ReactionRow list={msg.reactions ?? []} you={youReacted} onTap={(emoji) => onReact(msg.id, emoji)} />
        </div>
      </div>
    );
  }

  if (msg.kind === "score") {
    return (
      <div className="my-1.5 px-2">
        <div className="overflow-hidden rounded-xl border-l-4 border-emerald-500 bg-emerald-500/5">
          <div className="flex items-start gap-3 px-3 py-2.5">
            <div className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-base">⛳</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700">Score</span>
                <span className="text-[10px] uppercase tracking-wide text-muted">{formatAgo(msg.ts)} ago</span>
              </div>
              <div className="mt-1 text-sm font-semibold text-info">{msg.golfer} · {msg.headline}</div>
              <div className="mt-0.5 text-xs text-text">{msg.detail}</div>
              <div className="mt-0.5 text-[11px] uppercase tracking-wide text-muted">drafted by {msg.drafter}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (msg.kind === "bonus") {
    return (
      <div className="my-1.5 px-2">
        <div className="overflow-hidden rounded-xl border-l-4 border-amber-500 bg-amber-500/5">
          <div className="flex items-start gap-3 px-3 py-2.5">
            <div className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-base">🏆</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700">Bonus</span>
                <span className="text-[10px] uppercase tracking-wide text-muted">{formatAgo(msg.ts)} ago</span>
              </div>
              <div className="mt-1 text-sm font-semibold text-info">{msg.title}</div>
              <div className="mt-0.5 text-xs text-text">{msg.detail}</div>
              <ReactionRow list={msg.reactions ?? []} you={youReacted} onTap={(emoji) => onReact(msg.id, emoji)} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (msg.kind === "event-lock") {
    return (
      <div className="my-1.5 px-2">
        <div className="overflow-hidden rounded-xl border-l-4 border-slate-400 bg-slate-400/10">
          <div className="flex items-start gap-3 px-3 py-2.5">
            <div className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-400/15 text-base">🔒</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-slate-400/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-700">Event</span>
                <span className="text-[10px] uppercase tracking-wide text-muted">{formatAgo(msg.ts)} ago</span>
              </div>
              <div className="mt-1 text-sm font-semibold text-info">{msg.event}</div>
              <div className="mt-0.5 text-xs text-text">{msg.detail}</div>
              {msg.cta && (
                <div className="mt-2">
                  <Link href={msg.cta.href} className="inline-flex rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white">
                    {msg.cta.label} →
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (msg.kind === "hot-seat") {
    const author = drafterBySlug(msg.by);
    return (
      <div className="my-1.5 px-2">
        <div className="overflow-hidden rounded-xl border-l-4 border-pink-500 bg-pink-500/5">
          <div className="flex items-start gap-3 px-3 py-2.5">
            <div className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-pink-500/15 text-base">🪑</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-pink-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-pink-700">Hot Seat</span>
                <span className="text-[10px] uppercase tracking-wide text-muted">{formatAgo(msg.ts)} ago</span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                {author && <Avatar drafter={author} size="sm" />}
                <span className="text-sm font-semibold text-info">{author?.name ?? "Declared"}</span>
                <span className="text-xs text-muted">declared</span>
              </div>
              <div className="mt-1 rounded-lg bg-bg/60 px-2.5 py-1.5 text-sm text-text">
                &ldquo;{msg.declaration}&rdquo;
              </div>
              <div className="mt-1 text-[11px] uppercase tracking-wide text-muted">
                +{msg.odds} · vetos due {msg.vetosAt}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (msg.kind === "pick") {
    const author = drafterBySlug(msg.by);
    if (!author) return null;
    return (
      <div className="my-1.5 px-2">
        <div className="overflow-hidden rounded-xl border-l-4 border-sky-500 bg-sky-500/5">
          <div className="flex items-start gap-3 px-3 py-2.5">
            <div className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-500/15 text-base">🎯</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-sky-700">Pick</span>
                <span className="text-[10px] uppercase tracking-wide text-muted">{formatAgo(msg.ts)} ago</span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <Avatar drafter={author} size="sm" />
                <span className="text-sm font-semibold text-info">{author.name}</span>
                <span className="text-xs text-muted">drafted</span>
                <span className="text-sm font-semibold">{msg.golfer}</span>
              </div>
              <div className="mt-0.5 text-[11px] uppercase tracking-wide text-muted">Round {msg.round}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (msg.kind === "poll") {
    const author = drafterBySlug(msg.by);
    const total = msg.options.reduce((sum, o) => sum + o.votes, 0);
    return (
      <div className="my-1.5 px-2">
        <div className="overflow-hidden rounded-xl border border-border/40 bg-surface/80">
          <div className="flex items-start gap-3 px-3 py-2.5">
            <div className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-base">📊</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                {author && <Avatar drafter={author} size="sm" />}
                <span className="text-sm font-semibold text-info">{author?.name ?? ""}</span>
                <span className="text-[10px] uppercase tracking-wide text-muted">poll · {formatAgo(msg.ts)} ago</span>
              </div>
              <div className="mt-1 text-sm font-medium text-text">{msg.prompt}</div>
              <div className="mt-2 space-y-1.5">
                {msg.options.map((opt) => {
                  const pct = total ? Math.round((opt.votes / total) * 100) : 0;
                  return (
                    <button
                      key={opt.label}
                      type="button"
                      className="group relative flex w-full items-center overflow-hidden rounded-lg border border-border/30 bg-bg/60 text-left"
                    >
                      <span
                        className="absolute inset-y-0 left-0 bg-violet-500/10 transition-all group-hover:bg-violet-500/15"
                        style={{ width: `${pct}%` }}
                        aria-hidden="true"
                      />
                      <span className="relative z-10 flex-1 px-3 py-1.5 text-sm font-medium">{opt.label}</span>
                      <span className="relative z-10 px-3 text-xs tabular-nums text-muted">{pct}%</span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-1 text-[11px] uppercase tracking-wide text-muted">{total} votes</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

export default function ClubhousePrototype() {
  const [activeChannel, setActiveChannel] = useState<string>("masters");
  const [reactions, setReactions] = useState<Record<string, string>>({});
  const [composer, setComposer] = useState("");

  const channel = CHANNELS.find((c) => c.id === activeChannel) ?? CHANNELS[0];
  const messages = MESSAGES[activeChannel] ?? [];
  const presence = useMemo(() => {
    const slugs = PRESENCE[activeChannel] ?? [];
    return slugs
      .map((slug) => drafterBySlug(slug))
      .filter((d): d is Drafter => Boolean(d));
  }, [activeChannel]);

  function tapReaction(msgId: string, emoji: string) {
    setReactions((prev) => ({ ...prev, [msgId]: emoji }));
  }

  return (
    <main className="space-y-3">
      {/* Channel pills (horizontal scroll) */}
      <nav
        aria-label="Channels"
        className="soft-card -mx-1 overflow-x-auto rounded-[1.25rem] border bg-surface/80 p-1.5 backdrop-blur-xl"
      >
        <div className="flex min-w-max items-center gap-1.5">
          {CHANNELS.map((c) => {
            const active = activeChannel === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setActiveChannel(c.id)}
                aria-current={active ? "page" : undefined}
                className={[
                  "group relative flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition-all",
                  active
                    ? "border-transparent bg-accent text-white shadow-[0_8px_18px_rgba(99,91,255,0.25)]"
                    : "border-transparent bg-surface/60 text-text hover:bg-surface",
                ].join(" ")}
              >
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: active ? "rgba(255,255,255,0.9)" : c.accent }}
                  aria-hidden="true"
                />
                <span>{c.handle}</span>
                {!active && c.unread > 0 && (
                  <span className="ml-1 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-accent/20 px-1.5 text-[10px] font-bold text-accent">
                    {c.unread}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Channel header */}
      <section className="soft-card rounded-[1.5rem] border bg-surface/70 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: channel.accent }} />
              <h1 className="text-xl font-semibold text-info">{channel.handle}</h1>
            </div>
            <p className="mt-0.5 text-sm text-muted">{channel.description}</p>
          </div>
          <div className="flex items-center gap-1.5">
            {presence.slice(0, 6).map((d) => (
              <Avatar key={d.slug} drafter={d} size="sm" />
            ))}
            {presence.length > 6 && (
              <span className="text-[10px] uppercase tracking-wide text-muted">+{presence.length - 6}</span>
            )}
            <span className="ml-1 text-[10px] uppercase tracking-[0.18em] text-muted">
              {presence.length} here
            </span>
          </div>
        </div>
      </section>

      {/* Messages */}
      <section className="soft-card rounded-[1.5rem] border bg-surface/60 py-2 backdrop-blur-xl">
        {messages.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted">
            Nothing in {channel.handle} yet. Say something.
          </div>
        ) : (
          <ul className="space-y-0.5">
            {messages.map((msg) => {
              const replyId =
                msg.kind === "text" && "replyTo" in msg && msg.replyTo ? msg.replyTo : undefined;
              const replyTarget = replyId
                ? messages.find((m) => m.id === replyId)
                : undefined;
              const replyAuthor =
                replyTarget && replyTarget.kind === "text"
                  ? drafterBySlug(replyTarget.by)
                  : replyTarget && replyTarget.kind === "hot-seat"
                    ? drafterBySlug(replyTarget.by)
                    : undefined;
              return (
                <li key={msg.id}>
                  <MessageBlock
                    msg={msg}
                    replyTargetAuthor={replyAuthor}
                    onReact={tapReaction}
                    youReacted={reactions[msg.id]}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Composer */}
      <section className="soft-card sticky bottom-2 rounded-[1.5rem] border bg-surface/95 p-2 backdrop-blur-xl">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <textarea
              value={composer}
              onChange={(e) => setComposer(e.target.value)}
              placeholder={`Message ${channel.handle}…`}
              rows={1}
              className="min-h-[44px] w-full resize-none rounded-xl border border-border/40 bg-bg/60 px-3.5 py-2.5 text-sm focus:border-accent/50 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-0.5">
            {REACTIONS.slice(0, 3).map((e) => (
              <button key={e} type="button" className="rounded-lg px-1.5 py-1 text-base transition-transform hover:scale-110" aria-label={`Send ${e}`}>
                {e}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={!composer.trim()}
            className="h-[44px] shrink-0 rounded-xl bg-accent px-4 text-sm font-semibold text-white disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </section>

      <div className="text-center text-[10px] uppercase tracking-[0.2em] text-muted">
        Clubhouse prototype · Direction 3 of 5 ·{" "}
        <Link href="/ux" className="text-accent underline-offset-4 hover:underline">
          compare
        </Link>
      </div>
    </main>
  );
}
