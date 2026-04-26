"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

/*
 * DIRECTION 6 — GAMEDAY  (Stadium 75 / Scoreboard 25)
 *
 * Same 75/25 ratio as Press Box, but opposite integration strategy:
 * the scoreboard is NOT a companion rail — it's baked INTO the
 * Stadium immersion. The dark hero expands to carry pool standings,
 * my picks, and bonuses inside the same palette, so you get the
 * numbers without ever leaving the broadcast feel.
 *
 * Presence and chat then live below, also inside the immersive
 * frame until chat turns into the light composer at the bottom.
 *
 * Broadcast booth with the graphics permanently on-screen.
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

const POOL = [
  { rank: 1, slug: "chris", total: -18, delta: -2 },
  { rank: 2, slug: "wes",   total: -12, delta: -1 },
  { rank: 3, slug: "dusty", total: -11, delta: +1 },
  { rank: 4, slug: "dan",   total: -8,  delta:  0 },
  { rank: 5, slug: "cody",  total: -7,  delta: -2 },
  { rank: 6, slug: "vobe",  total: -4,  delta: +1 },
];

const MY_PICKS = [
  { g: "Rory McIlroy",  pos: "2",   toPar: -9 as number | null },
  { g: "Jordan Spieth", pos: "T22", toPar: -1 },
  { g: "Shane Lowry",   pos: "T15", toPar: -3 },
  { g: "Cameron Smith", pos: "T40", toPar: +4 },
  { g: "Daniel Berger", pos: "CUT", toPar: null },
  { g: "Ryan Fox",      pos: "CUT", toPar: +5 },
];

const LIVE_LEADERBOARD = [
  { pos: "1",  golfer: "Scottie Scheffler", toPar: -11, thru: "F",  drafter: "Chris" },
  { pos: "2",  golfer: "Rory McIlroy",      toPar: -9,  thru: "F",  drafter: "Dusty" },
  { pos: "3",  golfer: "Viktor Hovland",    toPar: -7,  thru: "F",  drafter: "Chris" },
  { pos: "T4", golfer: "Ludvig Aberg",      toPar: -6,  thru: "F",  drafter: "Wes" },
  { pos: "T4", golfer: "Collin Morikawa",   toPar: -6,  thru: "F",  drafter: "Wes" },
  { pos: "6",  golfer: "Robert Macintyre",  toPar: -5,  thru: "16", drafter: "Cody" },
];

const CHAT: Array<
  | { kind: "system"; id: string; text: string; ago: string }
  | { kind: "text"; id: string; by: string; text: string; ago: string; reactions?: Array<{ emoji: string; count: number }>; replyTo?: string }
> = [
  { kind: "system", id: "s1", text: "Round 3 underway · 50 made the cut", ago: "7h" },
  { kind: "text", id: "m1", by: "dusty", text: "Rory with the eagle on 8 🚀", ago: "2h", reactions: [{ emoji: "🚀", count: 4 }] },
  { kind: "text", id: "m2", by: "cody",  text: "MACINTYRE LET'S GOOOOO", ago: "10m", reactions: [{ emoji: "🔥", count: 6 }] },
  { kind: "text", id: "m3", by: "thom",  text: "Rahm WD has me spiraling", ago: "38m", reactions: [{ emoji: "💀", count: 7 }] },
  { kind: "text", id: "m4", by: "chris", text: "the curse continues", ago: "35m", replyTo: "m3" },
  { kind: "text", id: "m5", by: "dusty", text: "ok so if Rory holds and Scheffler blows up on Sunday…", ago: "3m" },
];

const REACTIONS = ["🔥", "🫣", "😭", "💀", "🚀"];

// -- Embedded broadcast graphics (the 25% on-screen) --

function BroadcastTile({ label, children, accent }: { label: string; children: React.ReactNode; accent?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
      <div className="mb-2 flex items-center gap-2">
        {accent && <span className="inline-block h-1.5 w-6 rounded-full" style={{ background: accent }} />}
        <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/50">{label}</div>
      </div>
      {children}
    </div>
  );
}

// -- Main --

export default function GamedayPrototype() {
  const [reactions, setReactions] = useState<Record<string, string>>({});
  const [composer, setComposer] = useState("");
  const hereNow = useMemo(() => DRAFTERS.filter((d) => d.hereNow).length, []);

  function tapReaction(id: string, emoji: string) {
    setReactions((prev) => ({ ...prev, [id]: emoji }));
  }

  return (
    <main>
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
        <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-white/5 bg-[#0b2a22]/85 px-4 py-2 backdrop-blur">
          <span className="relative inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.24em] text-[#4ade80]">
            <span className="relative inline-flex h-2 w-2">
              <span className="absolute inset-0 animate-ping rounded-full bg-[#4ade80]/70" />
              <span className="relative inline-block h-2 w-2 rounded-full bg-[#4ade80]" />
            </span>
            Live
          </span>
          <span className="text-[10px] uppercase tracking-[0.24em] text-white/60">
            Masters · R3 · Scheffler -11 · Rory -9 · DeChambeau -4
          </span>
          <div className="ml-auto text-[10px] uppercase tracking-[0.18em] text-white/50">{hereNow}/{DRAFTERS.length} watching</div>
        </div>

        {/* Hero */}
        <section className="relative px-5 pb-6 pt-8 sm:px-8 sm:pt-10">
          <div className="text-[11px] uppercase tracking-[0.32em] text-[#f5c11c]/80">Moving Day · Round 3</div>
          <h1 className="mt-2 font-serif text-4xl font-semibold leading-[0.95] text-white sm:text-5xl md:text-6xl">The Masters</h1>
          <p className="mt-3 max-w-md text-sm text-white/60 sm:text-base">
            Scheffler leads by two. Rory eagled 8 and handed two back. DeChambeau chasing.
          </p>
        </section>

        {/* The 25% — scoreboard graphics EMBEDDED in the immersive frame.
            Grid at sm+ so these sit in three columns like broadcast graphics
            stacked on a live feed. */}
        <section className="border-y border-white/5 bg-[#081c17]/60 px-5 py-5 sm:px-8">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-[0.22em] text-white/50">On the broadcast</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">Graphics package</div>
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            <BroadcastTile label="Pool · live" accent="#4ade80">
              <ol className="space-y-1">
                {POOL.map((r) => {
                  const d = drafterBySlug(r.slug);
                  if (!d) return null;
                  const sign = r.delta === 0 ? "" : r.delta < 0 ? "↓" : "↑";
                  return (
                    <li key={r.slug} className={`flex items-center gap-2 rounded-md px-1 py-0.5 text-xs ${d.isMe ? "bg-white/[0.08]" : ""}`}>
                      <span className="w-3 shrink-0 text-[10px] tabular-nums text-white/45">{r.rank}</span>
                      <Avatar drafter={d} size="xs" onDark />
                      <span className="flex-1 truncate text-white/90">
                        {d.name}
                        {d.isMe && <span className="ml-1 text-[9px] uppercase tracking-wide text-[#f5c11c]">you</span>}
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums text-white">{formatToPar(r.total)}</span>
                      <span className="w-4 shrink-0 text-right text-[10px] tabular-nums text-white/50">{sign}{r.delta ? Math.abs(r.delta) : ""}</span>
                    </li>
                  );
                })}
              </ol>
            </BroadcastTile>

            <BroadcastTile label="Your card · Dusty" accent="#f5c11c">
              <ul className="space-y-0.5 text-xs">
                {MY_PICKS.map((p) => (
                  <li key={p.g} className="flex items-center gap-2">
                    <span className={`flex-1 truncate ${p.toPar === null ? "text-white/35 line-through" : "text-white/90"}`}>{p.g}</span>
                    <span className="w-9 shrink-0 text-right text-[10px] tabular-nums text-white/45">{p.pos}</span>
                    <span className={`w-9 shrink-0 text-right font-semibold tabular-nums ${p.toPar === null ? "text-white/35" : p.toPar < -5 ? "text-[#4ade80]" : p.toPar < 0 ? "text-white" : "text-white/60"}`}>
                      {p.toPar === null ? "—" : formatToPar(p.toPar)}
                    </span>
                  </li>
                ))}
              </ul>
            </BroadcastTile>

            <BroadcastTile label="Bonuses · season" accent="#e8a82a">
              <ul className="space-y-1.5 text-xs">
                <li className="flex items-center gap-2">
                  <Avatar drafter={drafterBySlug("dusty")!} size="xs" onDark />
                  <span className="flex-1 truncate text-white/90">Dusty · Survivor</span>
                  <span className="rounded bg-[#f5c11c]/25 px-1.5 py-0.5 font-bold tabular-nums text-[#f5c11c]">+6</span>
                </li>
                <li className="flex items-center gap-2">
                  <Avatar drafter={drafterBySlug("chris")!} size="xs" onDark />
                  <span className="flex-1 truncate text-white/90">Chris · Golden Ticket</span>
                  <span className="rounded bg-[#f5c11c]/25 px-1.5 py-0.5 font-bold tabular-nums text-[#f5c11c]">+4</span>
                </li>
                <li className="mt-1 border-t border-white/10 pt-1.5 text-[10px] uppercase tracking-wide text-white/45">
                  Season total: +18 pts · 4 bonuses
                </li>
              </ul>
            </BroadcastTile>
          </div>
        </section>

        {/* Tournament leaderboard — still inside the broadcast frame */}
        <section className="border-b border-white/5 px-5 py-5 sm:px-8">
          <div className="text-[10px] uppercase tracking-[0.22em] text-white/50">Tournament · Top 6</div>
          <ul className="mt-3 divide-y divide-white/5 rounded-2xl border border-white/5 bg-white/[0.02]">
            {LIVE_LEADERBOARD.map((row) => {
              const d = DRAFTERS.find((x) => x.name === row.drafter);
              return (
                <li key={`${row.pos}-${row.golfer}`} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="w-7 text-[11px] font-semibold text-white/60">{row.pos}</span>
                  <span className="flex-1 truncate text-sm text-white">{row.golfer}</span>
                  {d && <Avatar drafter={d} size="xs" onDark />}
                  <span className="w-8 text-right text-[10px] text-white/45">{row.thru}</span>
                  <span className={`w-10 text-right text-sm font-semibold tabular-nums ${row.toPar < -5 ? "text-[#4ade80]" : "text-white/90"}`}>
                    {formatToPar(row.toPar)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Presence */}
        <section className="border-b border-white/5 bg-[#081c17]/50 px-5 py-4 sm:px-8">
          <div className="text-[10px] uppercase tracking-[0.22em] text-white/50">Here now</div>
          <div className="-mx-1 mt-3 flex items-center gap-3 overflow-x-auto px-1">
            {DRAFTERS.sort((a, b) => (a.hereNow === b.hereNow ? 0 : a.hereNow ? -1 : 1)).map((d) => (
              <div key={d.slug} className="flex flex-col items-center gap-1">
                <Avatar drafter={d} onDark />
                <span className={`text-[10px] font-semibold ${d.hereNow ? "text-white" : "text-white/35"}`}>{d.name}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Chat floor */}
        <section className="bg-[#081c17]/40 px-3 py-5 sm:px-6">
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
                      {REACTIONS.map((e) => (
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

      <div className="mt-4 text-center text-[10px] uppercase tracking-[0.2em] text-muted">
        Gameday prototype · Direction 6 of 6 ·{" "}
        <Link href="/ux" className="text-accent underline-offset-4 hover:underline">compare</Link>
      </div>
    </main>
  );
}
