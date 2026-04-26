"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

/*
 * DIRECTION 1 — STADIUM
 *
 * The event takes over. Dark immersive palette, pulsing LIVE marker,
 * presence rail, rolling chat "floor", sticky one-tap reaction bar.
 *
 * Data is a mix of: real entrant names from the Masters import,
 * representative live tournament scores, and scripted chat that reads
 * like this group would actually talk. It's a prototype, not a live
 * page — the goal is to answer "does this register feel right?" fast.
 */

type Drafter = {
  slug: string;
  name: string;
  initials: string;
  tint: string;
  hereNow: boolean;
};

type TeeUp = {
  pos: string;
  golfer: string;
  toPar: number;
  thru: string;
  drafter: string;
};

type Standing = {
  rank: number;
  name: string;
  toPar: number;
  topGolfer: { name: string; toPar: number };
};

type Reaction = { emoji: string; count: number };

type ChatMessage = {
  id: string;
  by: string;
  text: string;
  ago: string;
  replyTo?: string;
  reactions: Reaction[];
  pinned?: boolean;
};

const DRAFTERS: Drafter[] = [
  { slug: "chris", name: "Chris", initials: "CH", tint: "#d77a3a", hereNow: true },
  { slug: "dusty", name: "Dusty", initials: "DU", tint: "#2f9e44", hereNow: true },
  { slug: "vobe", name: "Vobe", initials: "VO", tint: "#4c6ef5", hereNow: true },
  { slug: "cody", name: "Cody", initials: "CO", tint: "#e03131", hereNow: true },
  { slug: "wes", name: "Wes", initials: "WE", tint: "#e8a82a", hereNow: true },
  { slug: "dan", name: "Dan", initials: "DA", tint: "#a855c7", hereNow: true },
  { slug: "thom", name: "Thom", initials: "TH", tint: "#6b7280", hereNow: false },
  { slug: "rod", name: "Rod", initials: "RO", tint: "#14b8a6", hereNow: false },
  { slug: "nate", name: "Nate", initials: "NA", tint: "#64748b", hereNow: false },
];

const LIVE_LEADERBOARD: TeeUp[] = [
  { pos: "1",  golfer: "Scottie Scheffler", toPar: -11, thru: "F",   drafter: "Chris" },
  { pos: "2",  golfer: "Rory McIlroy",      toPar: -9,  thru: "F",   drafter: "Dusty" },
  { pos: "3",  golfer: "Viktor Hovland",    toPar: -7,  thru: "F",   drafter: "Chris" },
  { pos: "T4", golfer: "Ludvig Aberg",      toPar: -6,  thru: "F",   drafter: "Wes" },
  { pos: "T4", golfer: "Collin Morikawa",   toPar: -6,  thru: "F",   drafter: "Wes" },
  { pos: "6",  golfer: "Robert Macintyre",  toPar: -5,  thru: "16",  drafter: "Cody" },
  { pos: "T7", golfer: "Bryson DeChambeau", toPar: -4,  thru: "15",  drafter: "Vobe" },
  { pos: "T7", golfer: "Xander Schauffele", toPar: -4,  thru: "14",  drafter: "Dan" },
];

const POOL_STANDINGS: Standing[] = [
  { rank: 1, name: "Chris", toPar: -18, topGolfer: { name: "Scheffler", toPar: -11 } },
  { rank: 2, name: "Wes",   toPar: -12, topGolfer: { name: "Aberg",     toPar: -6  } },
  { rank: 3, name: "Dusty", toPar: -11, topGolfer: { name: "McIlroy",   toPar: -9  } },
  { rank: 4, name: "Dan",   toPar: -8,  topGolfer: { name: "Schauffele", toPar: -4 } },
  { rank: 5, name: "Cody",  toPar: -7,  topGolfer: { name: "Macintyre", toPar: -5  } },
  { rank: 6, name: "Vobe",  toPar: -4,  topGolfer: { name: "DeChambeau", toPar: -4 } },
];

const CHAT: ChatMessage[] = [
  {
    id: "m1",
    by: "system",
    text: "Round 3 is underway at Augusta · post-cut · 50 made it",
    ago: "7h",
    reactions: [],
    pinned: true,
  },
  {
    id: "m2",
    by: "dusty",
    text: "Rory with the eagle on 8 🚀",
    ago: "2h",
    reactions: [{ emoji: "🚀", count: 4 }, { emoji: "☘️", count: 2 }],
  },
  {
    id: "m3",
    by: "chris",
    text: "Scheffler just doing Scheffler things",
    ago: "2h",
    reactions: [{ emoji: "🐐", count: 5 }, { emoji: "🥱", count: 2 }],
  },
  {
    id: "m4",
    by: "vobe",
    text: "DeChambeau bombing 400+ off the tee. Can he make a putt today tho",
    ago: "1h",
    reactions: [{ emoji: "😂", count: 3 }],
  },
  {
    id: "m5",
    by: "cody",
    text: "MACINTYRE LET'S GOOOOO",
    ago: "1h",
    reactions: [{ emoji: "🔥", count: 6 }, { emoji: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", count: 4 }],
  },
  {
    id: "m6",
    by: "wes",
    text: "Aberg + Morikawa both top-5. Bank it",
    ago: "52m",
    reactions: [{ emoji: "💰", count: 3 }],
  },
  {
    id: "m7",
    by: "thom",
    text: "Rahm WD has me spiraling",
    ago: "38m",
    reactions: [{ emoji: "💀", count: 7 }, { emoji: "😭", count: 2 }],
  },
  {
    id: "m8",
    by: "chris",
    replyTo: "thom",
    text: "the curse continues",
    ago: "35m",
    reactions: [],
  },
  {
    id: "m9",
    by: "dan",
    text: "Matsuyama quietly -3 through 12 btw",
    ago: "22m",
    reactions: [{ emoji: "👀", count: 2 }],
  },
  {
    id: "m10",
    by: "cody",
    text: "Macintyre about to birdie 17 on the screen rn — someone see this",
    ago: "12m",
    reactions: [{ emoji: "🔥", count: 2 }],
  },
  {
    id: "m11",
    by: "dusty",
    text: "ok so if Rory holds and Scheffler blows up on Sunday...",
    ago: "3m",
    reactions: [{ emoji: "🙏", count: 2 }, { emoji: "😤", count: 1 }],
  },
];

const REACTIONS = ["🔥", "🫣", "😭", "🤯", "💀", "🚀"];

function drafterBySlug(slug: string): Drafter | undefined {
  return DRAFTERS.find((d) => d.slug === slug);
}

function formatToPar(value: number): string {
  if (value === 0) return "E";
  return value > 0 ? `+${value}` : `${value}`;
}

function Avatar({ drafter, size = "md" }: { drafter: Drafter; size?: "sm" | "md" | "lg" }) {
  const dim =
    size === "lg" ? "h-12 w-12 text-sm" : size === "sm" ? "h-6 w-6 text-[9px]" : "h-9 w-9 text-[11px]";
  return (
    <div
      className={`${dim} relative inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white`}
      style={{ background: drafter.tint }}
      aria-label={drafter.name}
    >
      {drafter.initials}
      {drafter.hereNow && size !== "sm" && (
        <span className="absolute -right-0.5 -top-0.5 inline-block h-2.5 w-2.5 rounded-full border-2 border-[#0b2a22] bg-[#4ade80]">
          <span className="absolute inset-0 animate-ping rounded-full bg-[#4ade80]/60" />
        </span>
      )}
    </div>
  );
}

export default function StadiumPrototype() {
  const [activeReactionByMsg, setActiveReactionByMsg] = useState<Record<string, string>>({});
  const [composer, setComposer] = useState("");

  const hereNowCount = useMemo(() => DRAFTERS.filter((d) => d.hereNow).length, []);
  const orderedDrafters = useMemo(
    () =>
      DRAFTERS.slice().sort((a, b) => {
        if (a.hereNow && !b.hereNow) return -1;
        if (!a.hereNow && b.hereNow) return 1;
        return a.name.localeCompare(b.name);
      }),
    [],
  );

  function tapReaction(msgId: string, emoji: string) {
    setActiveReactionByMsg((prev) => ({ ...prev, [msgId]: emoji }));
  }

  return (
    <div className="relative">
      {/* Stadium is a dark, immersive surface — override the default theme. */}
      <div
        className="relative overflow-hidden rounded-[1.75rem] border border-[#143a30] text-[#e9e3d1]"
        style={{
          background:
            "radial-gradient(circle at 20% 0%, rgba(74, 222, 128, 0.12), transparent 35%)," +
            "radial-gradient(circle at 82% 12%, rgba(245, 193, 28, 0.08), transparent 30%)," +
            "linear-gradient(180deg, #0b2a22 0%, #08201a 70%, #06181430 100%)",
        }}
      >
        {/* Live banner */}
        <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-white/5 bg-[#0b2a22]/80 px-4 py-2 backdrop-blur">
          <span className="relative inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.24em] text-[#4ade80]">
            <span className="relative inline-flex h-2 w-2">
              <span className="absolute inset-0 animate-ping rounded-full bg-[#4ade80]/70" />
              <span className="relative inline-block h-2 w-2 rounded-full bg-[#4ade80]" />
            </span>
            Live
          </span>
          <span className="text-[10px] uppercase tracking-[0.24em] text-white/60">
            The Masters · Round 3 · Augusta, Saturday
          </span>
          <div className="ml-auto flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] text-white/50">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="h-3.5 w-3.5"
              aria-hidden="true"
            >
              <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            {hereNowCount} of {DRAFTERS.length}
          </div>
        </div>

        {/* Hero takeover */}
        <section className="relative px-5 pb-6 pt-10 sm:px-8 sm:pt-14">
          <svg
            viewBox="0 0 80 120"
            className="pointer-events-none absolute right-6 top-10 h-24 w-16 text-white/[0.04] sm:right-10 sm:h-36 sm:w-24"
            aria-hidden="true"
          >
            <path
              d="M40 0 v120 M40 10 Q60 20 60 30 Q60 40 40 36"
              fill="currentColor"
              stroke="currentColor"
              strokeWidth="3"
            />
          </svg>
          <div className="text-[11px] uppercase tracking-[0.32em] text-[#f5c11c]/80">
            Moving Day · Round 3
          </div>
          <h1 className="mt-3 font-serif text-4xl font-semibold leading-[0.95] text-white sm:text-5xl md:text-6xl">
            The Masters
          </h1>
          <p className="mt-4 max-w-md text-sm text-white/60 sm:text-base">
            50 made the cut. Scheffler leads Rory by two. DeChambeau chasing. It&rsquo;s loud in
            here already.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3 backdrop-blur">
              <div className="text-[10px] uppercase tracking-[0.2em] text-white/50">Leader</div>
              <div className="mt-1 text-base font-semibold text-white">Scottie Scheffler</div>
              <div className="mt-0.5 text-xs text-[#4ade80]">-11 · drafted by Chris</div>
            </div>
            <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3 backdrop-blur">
              <div className="text-[10px] uppercase tracking-[0.2em] text-white/50">Chasing</div>
              <div className="mt-1 text-base font-semibold text-white">Rory McIlroy</div>
              <div className="mt-0.5 text-xs text-[#f5c11c]">-9 · drafted by Dusty</div>
            </div>
            <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3 backdrop-blur">
              <div className="text-[10px] uppercase tracking-[0.2em] text-white/50">Pool leader</div>
              <div className="mt-1 text-base font-semibold text-white">Chris</div>
              <div className="mt-0.5 text-xs text-white/60">-18 combined · top 3 picks in top 10</div>
            </div>
          </div>
        </section>

        {/* Presence rail */}
        <section className="border-t border-white/5 bg-[#081c17]/50 px-5 py-4 sm:px-8">
          <div className="flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-[0.22em] text-white/50">Here now</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-white/40">
              Lurk off · tap name to mute
            </div>
          </div>
          <div className="-mx-1 mt-3 overflow-x-auto px-1">
            <div className="flex min-w-max items-center gap-3">
              {orderedDrafters.map((d) => (
                <div key={d.slug} className="flex flex-col items-center gap-1.5">
                  <Avatar drafter={d} />
                  <span
                    className={[
                      "text-[10px] font-semibold uppercase tracking-wide",
                      d.hereNow ? "text-white" : "text-white/35",
                    ].join(" ")}
                  >
                    {d.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Live tournament leaderboard (compact) */}
        <section className="border-t border-white/5 px-5 py-5 sm:px-8">
          <div className="flex items-end justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-white/50">
                Tournament leaderboard
              </div>
              <h2 className="mt-1 text-lg font-semibold text-white">Top 8 on the course</h2>
            </div>
            <Link
              href="/tournament"
              className="text-xs font-semibold text-[#f5c11c]/90 underline-offset-4 hover:underline"
            >
              Full board →
            </Link>
          </div>
          <ul className="mt-4 divide-y divide-white/5 rounded-2xl border border-white/5 bg-white/[0.02]">
            {LIVE_LEADERBOARD.map((row) => {
              const drafter = DRAFTERS.find((d) => d.name === row.drafter);
              return (
                <li
                  key={`${row.pos}-${row.golfer}`}
                  className="flex items-center gap-4 px-4 py-3"
                >
                  <div className="w-8 text-[11px] font-semibold text-white/60">{row.pos}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-white">{row.golfer}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-white/50">
                      {drafter && <Avatar drafter={drafter} size="sm" />}
                      <span>{row.drafter} · thru {row.thru}</span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div
                      className={[
                        "text-sm font-semibold tabular-nums",
                        row.toPar < -5 ? "text-[#4ade80]" : row.toPar < 0 ? "text-[#e6f1dd]" : "text-white/60",
                      ].join(" ")}
                    >
                      {formatToPar(row.toPar)}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Pool standings (compact) */}
        <section className="border-t border-white/5 px-5 py-5 sm:px-8">
          <div className="flex items-end justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-white/50">
                Pool standings
              </div>
              <h2 className="mt-1 text-lg font-semibold text-white">Best 4 net · live</h2>
            </div>
            <Link
              href="/leaderboard"
              className="text-xs font-semibold text-[#f5c11c]/90 underline-offset-4 hover:underline"
            >
              Scorecards →
            </Link>
          </div>
          <ol className="mt-4 space-y-2">
            {POOL_STANDINGS.map((s) => {
              const drafter = DRAFTERS.find((d) => d.name === s.name);
              return (
                <li
                  key={s.name}
                  className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-3"
                >
                  <div className="w-6 text-sm font-semibold text-white/50 tabular-nums">{s.rank}</div>
                  {drafter && <Avatar drafter={drafter} size="sm" />}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-white">{s.name}</div>
                    <div className="mt-0.5 text-[11px] text-white/50">
                      top: {s.topGolfer.name} {formatToPar(s.topGolfer.toPar)}
                    </div>
                  </div>
                  <div className="shrink-0 text-lg font-semibold tabular-nums text-white">
                    {formatToPar(s.toPar)}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        {/* The Floor — chat */}
        <section className="border-t border-white/5 bg-[#081c17]/40 px-3 py-5 sm:px-6">
          <div className="mb-3 flex items-end justify-between px-2">
            <div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-white/50">The floor</div>
              <h2 className="mt-1 text-lg font-semibold text-white">Talk &amp; takes</h2>
            </div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-white/40">
              {CHAT.filter((m) => m.by !== "system").length} messages today
            </div>
          </div>

          <ul className="space-y-3">
            {CHAT.map((msg) => {
              if (msg.by === "system") {
                return (
                  <li key={msg.id} className="flex justify-center">
                    <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] uppercase tracking-wide text-white/50">
                      {msg.text} · {msg.ago} ago
                    </div>
                  </li>
                );
              }
              const d = drafterBySlug(msg.by);
              if (!d) return null;
              const replyTarget = msg.replyTo ? drafterBySlug(msg.replyTo) : undefined;
              const activeReaction = activeReactionByMsg[msg.id];
              return (
                <li key={msg.id} className="flex gap-3">
                  <div className="pt-1">
                    <Avatar drafter={d} size="md" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-semibold text-white">{d.name}</span>
                      <span className="text-[10px] uppercase tracking-wide text-white/40">
                        {msg.ago} ago
                      </span>
                    </div>
                    {replyTarget && (
                      <div className="mt-1 border-l-2 border-white/15 pl-2 text-[11px] text-white/40">
                        replying to {replyTarget.name}
                      </div>
                    )}
                    <div className="mt-1 rounded-2xl rounded-tl-md border border-white/5 bg-white/[0.04] px-3.5 py-2 text-sm leading-6 text-white/90">
                      {msg.text}
                    </div>
                    {(msg.reactions.length > 0 || activeReaction) && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {msg.reactions.map((r) => (
                          <span
                            key={r.emoji}
                            className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[11px]"
                          >
                            <span>{r.emoji}</span>
                            <span className="text-white/70">{r.count}</span>
                          </span>
                        ))}
                        {activeReaction && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-[#4ade80]/40 bg-[#4ade80]/15 px-2 py-0.5 text-[11px] text-[#4ade80]">
                            <span>{activeReaction}</span>
                            <span>you</span>
                          </span>
                        )}
                      </div>
                    )}
                    <div className="mt-2 flex items-center gap-1">
                      {REACTIONS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => tapReaction(msg.id, emoji)}
                          className={[
                            "rounded-md px-1.5 py-0.5 text-[13px] transition-transform hover:scale-110",
                            activeReactionByMsg[msg.id] === emoji
                              ? "bg-white/15"
                              : "opacity-40 hover:opacity-100",
                          ].join(" ")}
                          aria-label={`React with ${emoji}`}
                        >
                          {emoji}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="ml-1 rounded-md px-2 py-0.5 text-[11px] text-white/40 hover:bg-white/10 hover:text-white/80"
                      >
                        reply
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Composer */}
        <section className="border-t border-white/5 bg-[#08201a] px-3 py-3 sm:px-6">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <textarea
                value={composer}
                onChange={(e) => setComposer(e.target.value)}
                placeholder="Drop a take…"
                rows={1}
                className="min-h-[44px] w-full resize-none rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-white placeholder-white/40 focus:border-[#4ade80]/50 focus:outline-none focus:ring-0"
              />
            </div>
            <button
              type="button"
              disabled={!composer.trim()}
              className="h-[44px] shrink-0 rounded-2xl bg-[#f5c11c] px-4 text-sm font-semibold text-[#08201a] transition-opacity disabled:opacity-40"
            >
              Send
            </button>
          </div>
          <div className="mt-2 flex items-center gap-1 overflow-x-auto">
            <span className="text-[10px] uppercase tracking-[0.2em] text-white/40">Quick takes</span>
            {REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="rounded-lg px-2 py-1 text-base transition-transform hover:scale-110"
                aria-label={`Send ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </section>

        {/* Foot note */}
        <div className="border-t border-white/5 px-5 py-4 text-center text-[10px] uppercase tracking-[0.2em] text-white/35 sm:px-8">
          Stadium prototype · Direction 1 of 5 ·{" "}
          <Link href="/ux" className="text-[#f5c11c]/80 underline-offset-4 hover:underline">
            compare
          </Link>
        </div>
      </div>
    </div>
  );
}
