"use client";

import { useState } from "react";

// First-visit onboarding for NFL Pick'em. Two paths from the welcome fork:
//   "navigate" — one-screen speed run of the rules
//   "boomer"   — the loving 8-slide slow tour
// The parent decides when to show it (localStorage flag) and gets onDone.

type Stage = "choice" | "pro" | "boomer";

const BOOMER_SLIDES: Array<{ emoji: string; title: string; body: string }> = [
  {
    emoji: "🧓",
    title: "We know adapting to change can be tough.",
    body:
      "One day you're licking stamps, the next your football pool is “in the cloud.” " +
      "Take a breath, adjust the bifocals, and we'll go nice and slow. " +
      "There is no quiz, nothing needs to be programmed like the VCR, and you may take breaks.",
  },
  {
    emoji: "🏈",
    title: "Step 1 · Picking a winner",
    body:
      "Each card shows two teams. Tap the one you think wins — the button is big on purpose. " +
      "It's just like circling your horse in the Sunday paper, except the paper is your phone " +
      "and nobody has to drive to the gas station for a copy.",
  },
  {
    emoji: "💊",
    title: "Step 2 · Confidence points",
    body:
      "Rank your picks 1 through 16 — think of your weekly pill organizer: the important one gets the big slot. " +
      "Each number gets used exactly once. Your surest lock gets the 16. " +
      "Your “gut feeling” about the Jets gets the 1.",
  },
  {
    emoji: "🎩",
    title: "Step 3 · The Vegas stuff",
    body:
      "“SEA -3.5” means Seattle is favored by 3 and a half points. The colored bar under each game " +
      "shows who Vegas likes, in percent. It updates all by itself — you do not have to call Gary the bookie. " +
      "Gary retired to Boca in 2011.",
  },
  {
    emoji: "💰",
    title: "Step 4 · Betting your points",
    body:
      "Tap “Bet it” to wager a pick's confidence points at the betting odds. Win and they multiply. " +
      "Lose and they're gone — like the pension, but faster. " +
      "Entirely optional, same as RSVP-ing to the HOA meeting.",
  },
  {
    emoji: "🎰",
    title: "Step 5 · The parlay",
    body:
      "Chain 2 or 3 bets together and ALL of them must win. Pays out like the good slot machine at the casino buffet; " +
      "loses like it too. Ambitious, thrilling, rarely ends well — the timeshare presentation of gambling.",
  },
  {
    emoji: "⏰",
    title: "Step 6 · Deadlines",
    body:
      "Picks lock at each game's kickoff. Sharp. Like the early-bird special ending at 5:30 — no exceptions, " +
      "even if you know the manager. Once a game kicks off, everyone's picks are revealed to the league, " +
      "so the whole crew WILL see the Jets thing.",
  },
  {
    emoji: "🏆",
    title: "Final step · The scoreboard",
    body:
      "The Scoreboard tab shows this week's carnage on top and the season standings underneath. " +
      "It flips to the new week every Wednesday automatically — like your Buick's headlights, no action required. " +
      "That's the whole tour. Go make your picks. And no, you cannot fax them in.",
  },
];

export default function PickemOnboarding({ onDone }: { onDone: () => void }) {
  const [stage, setStage] = useState<Stage>("choice");
  const [slide, setSlide] = useState(0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="soft-card w-full max-w-md rounded-[1.75rem] border border-border/50 bg-surface p-6 shadow-2xl">
        {stage === "choice" && (
          <div>
            <p className="text-[11px] uppercase tracking-[0.3em] text-muted">Surge · NFL Pick&rsquo;em</p>
            <h2 className="mt-2 text-2xl font-bold leading-tight text-info">
              Welcome to the new pick experience
            </h2>
            <p className="mt-3 text-sm text-muted">One quick question before we begin:</p>
            <p className="mt-1 text-base font-semibold text-text">
              Are you a boomer, or do you think you can navigate some bets like a man?
            </p>
            <div className="mt-5 space-y-2.5">
              <button
                type="button"
                onClick={() => { setStage("boomer"); setSlide(0); }}
                className="w-full rounded-2xl border border-border/60 bg-bg/50 px-4 py-3.5 text-left transition-colors hover:border-accent/60"
              >
                <span className="block text-base font-bold text-text">🧓 I&rsquo;m a boomer</span>
                <span className="mt-0.5 block text-xs text-muted">
                  Walk me through it slowly. And speak up.
                </span>
              </button>
              <button
                type="button"
                onClick={() => setStage("pro")}
                className="w-full rounded-2xl border border-accent/50 bg-accent/10 px-4 py-3.5 text-left transition-colors hover:bg-accent/20"
              >
                <span className="block text-base font-bold text-accent">🎰 I can navigate bets like a man</span>
                <span className="mt-0.5 block text-xs text-muted">
                  Give me the fast version. Kickoff&rsquo;s coming.
                </span>
              </button>
            </div>
            <button
              type="button"
              onClick={onDone}
              className="mt-4 w-full text-center text-[11px] text-muted underline underline-offset-2"
            >
              Skip — I was born knowing this
            </button>
          </div>
        )}

        {stage === "pro" && (
          <div>
            <p className="text-[11px] uppercase tracking-[0.3em] text-muted">The 30-second version</p>
            <h2 className="mt-2 text-xl font-bold text-info">Alright, hotshot.</h2>
            <ol className="mt-4 space-y-2.5 text-sm text-text">
              <li className="flex gap-2.5">
                <span className="font-bold text-accent">1.</span>
                <span>Pick a winner in every game.</span>
              </li>
              <li className="flex gap-2.5">
                <span className="font-bold text-accent">2.</span>
                <span>
                  Rank your confidence <span className="font-semibold">1–N</span> (N = this week&rsquo;s
                  game count — byes shrink the scale). Each number used once.
                </span>
              </li>
              <li className="flex gap-2.5">
                <span className="font-bold text-accent">3.</span>
                <span>
                  Feeling frisky? <span className="font-semibold">💰 Bet</span> a pick at the line
                  (win = points × odds, lose = −points) or <span className="font-semibold">🎰 parlay
                  2–3</span> — all legs must hit or the stake burns.
                </span>
              </li>
              <li className="flex gap-2.5">
                <span className="font-bold text-accent">4.</span>
                <span>
                  Save before kickoff — each game locks at its own kickoff, then everyone&rsquo;s
                  picks go public.
                </span>
              </li>
              <li className="flex gap-2.5">
                <span className="font-bold text-accent">5.</span>
                <span>
                  Scoreboard tab: this week&rsquo;s board (flips Wednesdays) + season standings.
                </span>
              </li>
            </ol>
            <button
              type="button"
              onClick={onDone}
              className="mt-5 w-full rounded-2xl bg-accent px-4 py-3 text-base font-bold text-black"
            >
              Let&rsquo;s ride
            </button>
            <button
              type="button"
              onClick={() => { setStage("boomer"); setSlide(0); }}
              className="mt-2.5 w-full text-center text-xs text-muted underline underline-offset-2"
            >
              Actually&hellip; show me the boomer tour 🧓
            </button>
          </div>
        )}

        {stage === "boomer" && (
          <div>
            <div className="flex items-center justify-between text-[11px] text-muted">
              <span className="uppercase tracking-[0.25em]">The gentle tour</span>
              <span className="tabular-nums">Step {slide + 1} of {BOOMER_SLIDES.length}</span>
            </div>
            <div className="mt-1.5 flex h-1.5 gap-1">
              {BOOMER_SLIDES.map((_, i) => (
                <div
                  key={i}
                  className={`h-full flex-1 rounded-full ${i <= slide ? "bg-accent" : "bg-border/40"}`}
                />
              ))}
            </div>

            <div className="mt-5 min-h-[13rem]">
              <div className="text-4xl">{BOOMER_SLIDES[slide].emoji}</div>
              {/* Big type. On purpose. You're welcome. */}
              <h2 className="mt-2.5 text-xl font-bold leading-snug text-info">
                {BOOMER_SLIDES[slide].title}
              </h2>
              <p className="mt-2.5 text-[15px] leading-relaxed text-text">
                {BOOMER_SLIDES[slide].body}
              </p>
            </div>

            <div className="mt-5 flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setSlide((s) => Math.max(0, s - 1))}
                disabled={slide === 0}
                className="rounded-2xl border border-border/60 px-4 py-3 text-sm font-semibold text-muted disabled:opacity-30"
              >
                ← Back
              </button>
              {slide < BOOMER_SLIDES.length - 1 ? (
                <button
                  type="button"
                  onClick={() => setSlide((s) => s + 1)}
                  className="flex-1 rounded-2xl bg-accent px-4 py-3 text-base font-bold text-black"
                >
                  Next →
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onDone}
                  className="flex-1 rounded-2xl bg-accent px-4 py-3 text-base font-bold text-black"
                >
                  I&rsquo;m ready (I think)
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={onDone}
              className="mt-2.5 w-full text-center text-[11px] text-muted underline underline-offset-2"
            >
              Skip the rest — my shows are on
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
