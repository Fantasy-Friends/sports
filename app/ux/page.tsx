"use client";

import Link from "next/link";

type Direction = {
  id: number;
  slug: string;
  name: string;
  essence: string;
  register: string;
  pattern: string;
  status: "live" | "coming";
};

const DIRECTIONS: Direction[] = [
  {
    id: 1,
    slug: "1",
    name: "Stadium",
    essence: "When an event is live, it takes over. Scoreboard locked to top, chat rolling below, presence on the rail.",
    register: "Game-day living room",
    pattern: "Fullscreen event immersion",
    status: "live",
  },
  {
    id: 2,
    slug: "2",
    name: "Command",
    essence: "Dashboard-first with chat at hand. Most of the screen is data tiles; a chat panel sits beside them so you can drop a take without leaving.",
    register: "Trading terminal with a chat sidebar",
    pattern: "75% Scoreboard · 25% Clubhouse",
    status: "live",
  },
  {
    id: 3,
    slug: "3",
    name: "Clubhouse",
    essence: "Chat is the main surface. Channels per event. Scores and picks appear IN chat as rich cards.",
    register: "Discord for adults",
    pattern: "Channel list → active channel",
    status: "live",
  },
  {
    id: 4,
    slug: "4",
    name: "Scoreboard",
    essence: "Dense dashboard. Every event, every score, every standing visible at once. Tap any tile to zoom.",
    register: "ESPN BottomLine",
    pattern: "Card-grid dashboard",
    status: "live",
  },
  {
    id: 5,
    slug: "5",
    name: "Press Box",
    essence: "Stadium as main surface with a sticky scoreboard rail alongside. Event stays immersive; data lives beside it, not inside it.",
    register: "Watching from the press box",
    pattern: "75% Stadium · 25% Scoreboard (companion rail)",
    status: "live",
  },
  {
    id: 6,
    slug: "6",
    name: "Gameday",
    essence: "Same 75/25 ratio as Press Box, but the scoreboard is baked INTO the immersive broadcast — pool standings, your card, bonuses all share the Stadium palette.",
    register: "Broadcast booth with graphics on-screen",
    pattern: "75% Stadium · 25% Scoreboard (embedded)",
    status: "live",
  },
];

export default function UxIndexPage() {
  return (
    <main className="space-y-5">
      <section className="soft-card rounded-[1.75rem] border bg-surface/70 px-4 py-5 backdrop-blur-xl sm:px-6 sm:py-6">
        <p className="text-[11px] uppercase tracking-[0.28em] text-muted">Design lab</p>
        <h1 className="mt-1 text-xl font-semibold sm:text-2xl">Five directions, one Decathlon</h1>
        <p className="mt-2 text-sm text-muted">
          Each prototype is a distinct shape — different primary metaphor, different navigation, different feel.
          The five coexist here so you can compare. When we pick a winner, we migrate the real routes.
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        {DIRECTIONS.map((d) => {
          const isLive = d.status === "live";
          const card = (
            <div
              className={[
                "soft-card relative h-full overflow-hidden rounded-[1.5rem] border bg-surface/60 p-5 transition-all",
                isLive ? "border-accent/30 hover:border-accent/60 hover:bg-surface/80" : "opacity-80",
              ].join(" ")}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="text-[10px] uppercase tracking-[0.28em] text-muted">
                  Direction {d.id}
                </div>
                <span
                  className={[
                    "inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em]",
                    isLive
                      ? "bg-accent text-white"
                      : "border border-border/40 bg-surface/60 text-muted",
                  ].join(" ")}
                >
                  {isLive ? "Live · tap to open" : "Coming next"}
                </span>
              </div>
              <h2 className="mt-3 text-2xl font-semibold text-info">{d.name}</h2>
              <p className="mt-2 text-sm leading-6 text-text">{d.essence}</p>
              <div className="mt-4 grid gap-2 border-t border-border/15 pt-3 text-xs text-muted">
                <div>
                  <span className="uppercase tracking-[0.18em]">Register</span>
                  <span className="ml-2 text-text">{d.register}</span>
                </div>
                <div>
                  <span className="uppercase tracking-[0.18em]">Pattern</span>
                  <span className="ml-2 text-text">{d.pattern}</span>
                </div>
              </div>
            </div>
          );

          return isLive ? (
            <Link key={d.id} href={`/ux/${d.slug}`} className="block">
              {card}
            </Link>
          ) : (
            <div key={d.id}>{card}</div>
          );
        })}
      </section>

      <div className="text-center text-xs text-muted">
        Built one at a time. Pick a winner and we tear down the other four.
      </div>
    </main>
  );
}
