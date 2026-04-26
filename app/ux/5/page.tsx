"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

/*
 * DIRECTION 5 — PRESS BOX  (Stadium 75 / Scoreboard 25)
 *
 * The Stadium experience is the main surface — dark immersive hero,
 * pulsing LIVE marker, presence rail, chat floor. What's new: a
 * sticky scoreboard rail on the right at lg+ (stacks below on
 * mobile) showing pool standings, my picks, bonuses, next event.
 *
 * Event-first, with the numbers a glance away. Nothing breaks the
 * Stadium immersion — the rail lives outside it.
 */

type Drafter = {
  slug: string;
  name: string;
  initials: string;
  tint: string;
  hereNow: boolean;
  isMe?: boolean;
};

const DRAFTERS: Drafter[] = [
  { slug: "chris", name: "Chris", initials: "CH", tint: "#d77a3a", hereNow: true },
  { slug: "dusty", name: "Dusty", initials: "DU", tint: "#2f9e44", hereNow: true, isMe: true },
  { slug: "vobe",  name: "Vobe",  initials: "VO", tint: "#4c6ef5", hereNow: true },
  { slug: "cody",  name: "Cody",  initials: "CO", tint: "#e03131", hereNow: true },
  { slug: "wes",   name: "Wes",   initials: "WE", tint: "#e8a82a", hereNow: true },
  { slug: "dan",   name: "Dan",   initials: "DA", tint: "#a855c7", hereNow: true },
  { slug: "thom",  name: "Thom",  initials: "TH", tint: "#0ea5e9", hereNow: false },
  { slug: "rod",   name: "Rod",   initials: "RO", tint: "#14b8a6", hereNow: false },
  { slug: "nate",  name: "Nate",  initials: "NA", tint: "#64748b", hereNow: false },
];

function drafterBySlug(slug: string) {
  return DRAFTERS.find((d) => d.slug === slug);
}
function formatToPar(v: number) {
  if (v === 0) return "E";
  return v > 0 ? `+${v}` : `${v}`;
}

function Avatar({ drafter, size = "md", onDark = false }: { drafter: Drafter; size?: "xs" | "sm" | "md" | "lg"; onDark?: boolean }) {
  const dim =
    size === "lg" ? "h-11 w-11 text-sm" :
    size === "md" ? "h-9 w-9 text-[11px]" :
    size === "sm" ? "h-6 w-6 text-[9px]" :
                    "h-5 w-5 text-[8px]";
  return (
    <div
      className={`${dim} relative inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white`}
      style={{ background: drafter.tint }}
      aria-label={drafter.name}
    >
      {drafter.initials}
      {drafter.hereNow && size !== "xs" && (
        <span className={`absolute -right-0.5 -top-0.5 inline-block h-2.5 w-2.5 rounded-full border-2 bg-[#4ade80] ${onDark ? "border-[#0b2a22]" : "border-surface"}`}>
          <span className="absolute inset-0 animate-ping rounded-full bg-[#4ade80]/60" />
        </span>
      )}
    </div>
  );
}

const LIVE_LEADERBOARD = [
  { pos: "1",  golfer: "Scottie Scheffler", toPar: -11, thru: "F",   drafter: "Chris" },
  { pos: "2",  golfer: "Rory McIlroy",      toPar: -9,  thru: "F",   drafter: "Dusty" },
  { pos: "3",  golfer: "Viktor Hovland",    toPar: -7,  thru: "F",   drafter: "Chris" },
  { pos: "T4", golfer: "Ludvig Aberg",      toPar: -6,  thru: "F",   drafter: "Wes" },
  { pos: "T4", golfer: "Collin Morikawa",   toPar: -6,  thru: "F",   drafter: "Wes" },
  { pos: "6",  golfer: "Robert Macintyre",  toPar: -5,  thru: "16",  drafter: "Cody" },
];

const CHAT: Array<
  | { kind: "system"; id: string; text: string; ago: string }
  | { kind: "text"; id: string; by: string; text: string; ago: string; reactions?: Array<{ emoji: string; count: number }>; replyTo?: string }
> = [
  { kind: "system", id: "s1", text: "Round 3 underway · 50 made the cut", ago: "7h" },
  { kind: "text", id: "m1", by: "dusty", text: "Rory with the eagle on 8 🚀", ago: "2h", reactions: [{ emoji: "🚀", count: 4 }, { emoji: "☘️", count: 2 }] },
  { kind: "text", id: "m2", by: "chris", text: "Scheffler just doing Scheffler things", ago: "2h", reactions: [{ emoji: "🐐", count: 5 }] },
  { kind: "text", id: "m3", by: "cody",  text: "MACINTYRE LET'S GOOOOO", ago: "10m", reactions: [{ emoji: "🔥", count: 6 }, { emoji: "🏴", count: 4 }] },
  { kind: "text", id: "m4", by: "thom",  text: "Rahm WD has me spiraling", ago: "38m", reactions: [{ emoji: "💀", count: 7 }] },
  { kind: "text", id: "m5", by: "chris", text: "the curse continues", ago: "35m", replyTo: "m4" },
  { kind: "text", id: "m6", by: "dusty", text: "ok so if Rory holds and Scheffler blows up on Sunday…", ago: "3m", reactions: [{ emoji: "🙏", count: 2 }] },
];

const REACTIONS = ["🔥", "🫣", "😭", "🤯", "💀", "🚀"];

// -- The 25%: a companion rail --

const POOL = [
  { rank: 1, slug: "chris", total: -18 },
  { rank: 2, slug: "wes",   total: -12 },
  { rank: 3, slug: "dusty", total: -11 },
  { rank: 4, slug: "dan",   total: -8  },
  { rank: 5, slug: "cody",  total: -7  },
  { rank: 6, slug: "vobe",  total: -4  },
];

const MY_PICKS = [
  { g: "Rory McIlroy",  pos: "2",   toPar: -9 as number | null },
  { g: "Jordan Spieth", pos: "T22", toPar: -1 },
  { g: "Shane Lowry",   pos: "T15", toPar: -3 },
  { g: "Cameron Smith", pos: "T40", toPar: +4 },
  { g: "Daniel Berger", pos: "CUT", toPar: null },
  { g: "Ryan Fox",      pos: "CUT", toPar: +5 },
];

function RailTile({ label, children, extra }: { label: string; children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/40 bg-surface/70 p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted">{label}</div>
        {extra && <div className="text-[10px] text-muted">{extra}</div>}
      </div>
      {children}
    </div>
  );
}

function ScoreboardRail() {
  return (
    <div className="space-y-3">
      <RailTile label="Pool" extra="Live">
        <ol className="space-y-1">
          {POOL.map((r) => {
            const d = drafterBySlug(r.slug);
            if (!d) return null;
            return (
              <li key={r.slug} className={`flex items-center gap-2 rounded-md px-1 py-0.5 text-xs ${d.isMe ? "bg-accent/10" : ""}`}>
                <span className="w-3 shrink-0 text-[10px] tabular-nums text-muted">{r.rank}</span>
                <Avatar drafter={d} size="xs" />
                <span className="flex-1 truncate font-medium">
                  {d.name}
                  {d.isMe && <span className="ml-1 text-[9px] uppercase tracking-wide text-accent">you</span>}
                </span>
                <span className="shrink-0 font-semibold tabular-nums">{formatToPar(r.total)}</span>
              </li>
            );
          })}
        </ol>
      </RailTile>

      <RailTile label="My picks" extra="4 counting">
        <ul className="space-y-0.5 text-xs">
          {MY_PICKS.map((p) => (
            <li key={p.g} className="flex items-center gap-2">
              <span className={`flex-1 truncate ${p.toPar === null ? "text-muted line-through" : ""}`}>{p.g}</span>
              <span className="w-9 shrink-0 text-right text-[10px] tabular-nums text-muted">{p.pos}</span>
              <span className={`w-9 shrink-0 text-right font-semibold tabular-nums ${p.toPar === null ? "text-muted" : p.toPar < -5 ? "text-emerald-600" : p.toPar < 0 ? "" : p.toPar > 2 ? "text-danger" : "text-muted"}`}>
                {p.toPar === null ? "—" : formatToPar(p.toPar)}
              </span>
            </li>
          ))}
        </ul>
      </RailTile>

      <RailTile label="Bonuses" extra="Season">
        <ul className="space-y-1 text-xs">
          <li className="flex items-center gap-2">
            <Avatar drafter={drafterBySlug("dusty")!} size="xs" />
            <span className="flex-1">Dusty · Survivor</span>
            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 font-bold tabular-nums text-amber-700">+6</span>
          </li>
          <li className="flex items-center gap-2">
            <Avatar drafter={drafterBySlug("chris")!} size="xs" />
            <span className="flex-1">Chris · Golden Ticket</span>
            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 font-bold tabular-nums text-amber-700">+4</span>
          </li>
        </ul>
      </RailTile>

      <RailTile label="Next up">
        <div className="text-xs">
          <div className="font-semibold text-text">Kentucky Derby</div>
          <div className="mt-0.5 text-[10px] text-muted">Tier 2 · 2.5× · locks Sat 1pm</div>
          <Link href="/events/2026-kentucky-derby" className="mt-1.5 inline-flex rounded-md bg-accent px-2 py-1 text-[10px] font-semibold text-white">
            Make picks →
          </Link>
        </div>
      </RailTile>
    </div>
  );
}

// -- Stadium main --

export default function PressBoxPrototype() {
  const [reactions, setReactions] = useState<Record<string, string>>({});
  const [composer, setComposer] = useState("");
  const hereNow = useMemo(() => DRAFTERS.filter((d) => d.hereNow).length, []);
  const ordered = useMemo(
    () => DRAFTERS.slice().sort((a, b) => (a.hereNow === b.hereNow ? a.name.localeCompare(b.name) : a.hereNow ? -1 : 1)),
    [],
  );

  function tapReaction(id: string, emoji: string) {
    setReactions((prev) => ({ ...prev, [id]: emoji }));
  }

  return (
    <main>
      <section className="grid gap-3 lg:grid-cols-[1fr,20rem]">
        {/* 75%: Stadium */}
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
            <span className="text-[10px] uppercase tracking-[0.24em] text-white/60">The Masters · Round 3</span>
            <div className="ml-auto text-[10px] uppercase tracking-[0.18em] text-white/50">{hereNow} of {DRAFTERS.length}</div>
          </div>

          {/* Hero */}
          <section className="relative px-5 pb-6 pt-8 sm:px-8 sm:pt-10">
            <div className="text-[11px] uppercase tracking-[0.32em] text-[#f5c11c]/80">Moving Day · Round 3</div>
            <h1 className="mt-2 font-serif text-4xl font-semibold leading-[0.95] text-white sm:text-5xl">The Masters</h1>
            <p className="mt-3 max-w-md text-sm text-white/60">
              Scheffler leads by two. Rory eagled 8 and immediately gave it back. DeChambeau chasing.
            </p>
            <div className="mt-5 grid gap-2 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.2em] text-white/50">Leader</div>
                <div className="mt-1 text-sm font-semibold text-white">Scottie Scheffler</div>
                <div className="mt-0.5 text-xs text-[#4ade80]">-11 · Chris</div>
              </div>
              <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.2em] text-white/50">Chasing</div>
                <div className="mt-1 text-sm font-semibold text-white">Rory McIlroy</div>
                <div className="mt-0.5 text-xs text-[#f5c11c]">-9 · Dusty</div>
              </div>
              <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.2em] text-white/50">You</div>
                <div className="mt-1 text-sm font-semibold text-white">Dusty · 3rd</div>
                <div className="mt-0.5 text-xs text-white/60">-11 · 7 back</div>
              </div>
            </div>
          </section>

          {/* Presence */}
          <section className="border-t border-white/5 bg-[#081c17]/50 px-5 py-4 sm:px-8">
            <div className="text-[10px] uppercase tracking-[0.22em] text-white/50">Here now</div>
            <div className="-mx-1 mt-3 overflow-x-auto px-1">
              <div className="flex min-w-max items-center gap-3">
                {ordered.map((d) => (
                  <div key={d.slug} className="flex flex-col items-center gap-1">
                    <Avatar drafter={d} onDark />
                    <span className={`text-[10px] font-semibold ${d.hereNow ? "text-white" : "text-white/35"}`}>{d.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Leaderboard compact */}
          <section className="border-t border-white/5 px-5 py-5 sm:px-8">
            <div className="text-[10px] uppercase tracking-[0.22em] text-white/50">Top 6</div>
            <ul className="mt-3 divide-y divide-white/5 rounded-2xl border border-white/5 bg-white/[0.02]">
              {LIVE_LEADERBOARD.map((row) => {
                const d = DRAFTERS.find((x) => x.name === row.drafter);
                return (
                  <li key={`${row.pos}-${row.golfer}`} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="w-7 text-[11px] font-semibold text-white/60">{row.pos}</span>
                    <span className="flex-1 truncate text-sm text-white">{row.golfer}</span>
                    {d && <Avatar drafter={d} size="xs" onDark />}
                    <span className="w-8 text-right text-[10px] text-white/50">{row.thru}</span>
                    <span className={`w-10 text-right text-sm font-semibold tabular-nums ${row.toPar < -5 ? "text-[#4ade80]" : "text-white/90"}`}>
                      {formatToPar(row.toPar)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Chat floor */}
          <section className="border-t border-white/5 bg-[#081c17]/40 px-3 py-5 sm:px-6">
            <div className="mb-3 px-2 text-[10px] uppercase tracking-[0.22em] text-white/50">The floor</div>
            <ul className="space-y-3">
              {CHAT.map((msg) => {
                if (msg.kind === "system") {
                  return (
                    <li key={msg.id} className="flex justify-center">
                      <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] uppercase tracking-wide text-white/50">
                        {msg.text} · {msg.ago} ago
                      </div>
                    </li>
                  );
                }
                const author = drafterBySlug(msg.by);
                if (!author) return null;
                const replyTarget = msg.replyTo ? CHAT.find((m) => m.id === msg.replyTo) : undefined;
                const replyAuthor = replyTarget && replyTarget.kind === "text" ? drafterBySlug(replyTarget.by) : undefined;
                const reacted = reactions[msg.id];
                return (
                  <li key={msg.id} className="flex gap-3">
                    <div className="pt-1"><Avatar drafter={author} onDark /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-semibold text-white">{author.name}</span>
                        <span className="text-[10px] uppercase tracking-wide text-white/40">{msg.ago} ago</span>
                      </div>
                      {replyAuthor && (
                        <div className="mt-1 border-l-2 border-white/15 pl-2 text-[11px] text-white/40">replying to {replyAuthor.name}</div>
                      )}
                      <div className="mt-1 rounded-2xl rounded-tl-md border border-white/5 bg-white/[0.04] px-3.5 py-2 text-sm text-white/90">
                        {msg.text}
                      </div>
                      {(msg.reactions?.length || reacted) && (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {msg.reactions?.map((r) => (
                            <span key={r.emoji} className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[11px]">
                              <span>{r.emoji}</span>
                              <span className="text-white/70">{r.count}</span>
                            </span>
                          ))}
                          {reacted && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-[#4ade80]/40 bg-[#4ade80]/15 px-2 py-0.5 text-[11px] text-[#4ade80]">
                              <span>{reacted}</span>
                              <span>you</span>
                            </span>
                          )}
                        </div>
                      )}
                      <div className="mt-2 flex items-center gap-1">
                        {REACTIONS.slice(0, 5).map((e) => (
                          <button key={e} type="button" onClick={() => tapReaction(msg.id, e)} className={`rounded-md px-1.5 text-[13px] transition-transform hover:scale-110 ${reacted === e ? "bg-white/15" : "opacity-40 hover:opacity-100"}`} aria-label={`React ${e}`}>
                            {e}
                          </button>
                        ))}
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
              <textarea
                value={composer}
                onChange={(e) => setComposer(e.target.value)}
                placeholder="Drop a take…"
                rows={1}
                className="min-h-[44px] flex-1 resize-none rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-white placeholder-white/40 focus:border-[#4ade80]/50 focus:outline-none"
              />
              <button type="button" disabled={!composer.trim()} className="h-[44px] shrink-0 rounded-2xl bg-[#f5c11c] px-4 text-sm font-semibold text-[#08201a] disabled:opacity-40">
                Send
              </button>
            </div>
          </section>
        </div>

        {/* 25%: Rail */}
        <aside className="lg:sticky lg:top-3 lg:self-start">
          <div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted">
            Press box
          </div>
          <ScoreboardRail />
        </aside>
      </section>

      <div className="mt-4 text-center text-[10px] uppercase tracking-[0.2em] text-muted">
        Press Box prototype · Direction 5 of 6 ·{" "}
        <Link href="/ux" className="text-accent underline-offset-4 hover:underline">compare</Link>
      </div>
    </main>
  );
}
