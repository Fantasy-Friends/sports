"use client";

import { useEffect, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import { tintFor, initialsFor } from "@/lib/avatarTint";

function LotteryBallIcon() {
  return (
    <svg viewBox="0 0 100 100" className="mx-auto h-[70px] w-[70px]" aria-hidden="true">
      <defs>
        {/* Off-center radial gradient gives the 3D glossy illusion */}
        <radialGradient id="lb-sphere" cx="36%" cy="28%" r="68%">
          <stop offset="0%"   stopColor="#f2f7ff" />
          <stop offset="52%"  stopColor="#dce8ff" />
          <stop offset="100%" stopColor="#9ab4e0" />
        </radialGradient>
        {/* Inner panel — slightly offset so it catches the same light */}
        <radialGradient id="lb-panel" cx="38%" cy="32%" r="62%">
          <stop offset="0%"   stopColor="#ffffff" />
          <stop offset="100%" stopColor="#e4effe" />
        </radialGradient>
        <clipPath id="lb-clip">
          <circle cx="50" cy="50" r="38" />
        </clipPath>
      </defs>

      {/* Ground shadow */}
      <ellipse cx="50" cy="94" rx="25" ry="4" fill="black" opacity="0.10" />

      {/* Drum ring — back half sits behind the ball */}
      <path
        d="M 3 50 A 47 13 0 0 1 97 50"
        fill="none" stroke="#2563eb" strokeWidth="4"
        strokeOpacity="0.28" strokeLinecap="round"
      />

      {/* Ball body */}
      <circle cx="50" cy="50" r="38" fill="url(#lb-sphere)" />

      {/* Inner numbered-panel circle (like a real NBA lottery ball) */}
      <circle cx="50" cy="50" r="22" fill="url(#lb-panel)" />
      <circle cx="50" cy="50" r="22" fill="none" stroke="rgba(70,110,200,0.20)" strokeWidth="0.8" />

      {/* Question mark */}
      <text
        x="50" y="52"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="26"
        fontWeight="900"
        fill="#1e3a8a"
        fontFamily="system-ui, -apple-system, sans-serif"
      >?</text>

      {/* Specular highlights — three layers for realistic gloss */}
      <ellipse cx="31" cy="27" rx="13" ry="8"
        fill="white" opacity="0.55"
        transform="rotate(-32 31 27)" clipPath="url(#lb-clip)" />
      <ellipse cx="34" cy="22" rx="6.5" ry="3"
        fill="white" opacity="0.82"
        transform="rotate(-32 34 22)" clipPath="url(#lb-clip)" />
      <circle cx="26" cy="20" r="2.2" fill="white" opacity="0.72" />

      {/* Ball rim — subtle edge darkening */}
      <circle cx="50" cy="50" r="38" fill="none" stroke="rgba(50,80,160,0.14)" strokeWidth="1.5" />

      {/* Drum ring — front half sits in front of the ball */}
      <path
        d="M 97 50 A 47 13 0 0 1 3 50"
        fill="none" stroke="#1d4ed8" strokeWidth="4"
        strokeOpacity="0.50" strokeLinecap="round"
      />
    </svg>
  );
}

// Reveal timing in ms, indexed from pick-N (first reveal) to pick-1 (winner, last reveal)
const REVEAL_DELAYS_MS = [3500, 3500, 3500, 4000, 4000, 4500, 5500, 7000, 10000];
const HIGHLIGHT_LEAD_MS = 2000;

type LotteryEntry = {
  entrant_id: string;
  entrant_name: string;
  draft_position: number;
};

type LotteryConfig = {
  lottery_id: string;
  pool_id: string;
  scheduled_at: string | null;
  started_at: string | null;
  status: string;
  result: LotteryEntry[] | null;
};

// How many picks should already be revealed based on elapsed time since start
function getCatchUpCount(startedAt: string): number {
  const elapsed = Date.now() - new Date(startedAt).getTime();
  let cumulative = 0;
  for (let i = 0; i < REVEAL_DELAYS_MS.length; i++) {
    cumulative += REVEAL_DELAYS_MS[i];
    if (elapsed < cumulative) return i;
  }
  return REVEAL_DELAYS_MS.length;
}

function formatScheduled(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function LotteryPage() {
  const basePoolId = process.env.NEXT_PUBLIC_POOL_ID || "2026-majors";
  const poolId = `${basePoolId}-pga-championship`;

  const [config, setConfig] = useState<LotteryConfig | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [revealCount, setRevealCount] = useState(0);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const [isDrawing, setIsDrawing] = useState(false);
  const initializedRef = useRef(false);

  // Poll every 5 seconds so the page reacts when admin starts the lottery
  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch(`/api/lottery?pool_id=${encodeURIComponent(poolId)}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const json = await res.json();
          if (!cancelled) {
            setConfig(json.lottery ?? null);
            setLoaded(true);
          }
        }
      } catch {
        if (!cancelled) setLoaded(true);
      }
    }
    void poll();
    const interval = window.setInterval(() => void poll(), 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [poolId]);

  // Catch up to the correct animation position when results first arrive.
  // Anyone who loads the page late will skip ahead rather than replaying from pick-9.
  useEffect(() => {
    if (!config?.result || !config.started_at || initializedRef.current) return;
    initializedRef.current = true;
    setRevealCount(getCatchUpCount(config.started_at));
  }, [config?.result, config?.started_at]);

  // Drive the reveal animation
  useEffect(() => {
    const result = config?.result;
    if (!result || revealCount >= result.length || !initializedRef.current) return;

    const delay = REVEAL_DELAYS_MS[revealCount] ?? 3500;
    const highlightAt = Math.max(delay - HIGHLIGHT_LEAD_MS, Math.floor(delay * 0.4));

    setIsDrawing(true);
    setHighlightIdx(-1);

    const highlightTimer = setTimeout(() => setHighlightIdx(revealCount), highlightAt);
    const revealTimer = setTimeout(() => {
      setRevealCount((c) => c + 1);
      setIsDrawing(false);
      setHighlightIdx(-1);
    }, delay);

    return () => {
      clearTimeout(highlightTimer);
      clearTimeout(revealTimer);
    };
  }, [revealCount, config?.result]);

  const result = config?.result ?? null;
  const revealed = result ? result.slice(0, revealCount) : [];
  const nextEntry = result ? result[revealCount] ?? null : null;
  const complete = result !== null && revealCount >= result.length;

  return (
    <AppShell title="Draft Lottery" subtitle="Who picks where?">
      {!loaded && (
        <div className="flex items-center justify-center py-24 text-sm text-muted">
          Loading…
        </div>
      )}

      {loaded && !config && (
        <div className="soft-card rounded-2xl border border-border bg-surface p-10 text-center">
          <LotteryBallIcon />
          <h2 className="mt-4 text-xl font-semibold">No lottery scheduled</h2>
          <p className="mt-2 text-sm text-muted">
            The commissioner hasn&rsquo;t set up the draft lottery yet.
          </p>
        </div>
      )}

      {loaded && config && !result && (
        <div className="soft-card rounded-2xl border border-border bg-surface p-10 text-center">
          <LotteryBallIcon />
          <h2 className="mt-4 text-xl font-semibold">Draft Lottery</h2>
          {config.scheduled_at ? (
            <>
              <p className="mt-2 text-sm text-muted">Scheduled for</p>
              <p className="mt-1 text-lg font-bold text-info">
                {formatScheduled(config.scheduled_at)}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted">Date TBD — check back soon</p>
          )}
          <p className="mt-5 text-sm text-muted">
            The commissioner will kick it off live. This page will update automatically.
          </p>
        </div>
      )}

      {loaded && result && (
        <div className="space-y-5">
          {/* Announcement banner */}
          <div
            className="relative overflow-hidden rounded-2xl border p-7 text-center text-white"
            style={{
              background:
                "radial-gradient(circle at 30% 0%, rgba(59,130,246,0.15), transparent 50%)," +
                "linear-gradient(160deg, #0d1640 0%, #080e2a 100%)",
              borderColor: "rgba(245,193,28,0.35)",
            }}
          >
            {complete ? (
              <>
                <div className="text-[11px] uppercase tracking-[0.3em] text-[#f5c11c]/80">
                  Draft Order Set
                </div>
                <div className="mt-2 text-4xl font-bold sm:text-5xl">Lottery Complete!</div>
                <div className="mt-2 text-sm text-white/60">
                  {result[result.length - 1].entrant_name} picks first
                </div>
              </>
            ) : (
              <>
                <div className="text-[11px] uppercase tracking-[0.3em] text-[#f5c11c]/80">
                  {isDrawing ? "Drawing for" : "Up next"}
                </div>
                <div
                  className={[
                    "mt-2 text-5xl font-bold sm:text-6xl",
                    isDrawing ? "animate-pulse" : "",
                  ].join(" ")}
                >
                  Pick #{nextEntry?.draft_position}
                  {nextEntry?.draft_position === 1 ? " 🏆" : ""}
                </div>
                <div className="mt-2 text-xs text-white/40 uppercase tracking-widest">
                  {isDrawing ? "Selecting..." : "Get ready"}
                </div>
              </>
            )}
          </div>

          {/* Ball drum — only shown while animation is running */}
          {!complete && (
            <div className="soft-card rounded-2xl border border-border bg-surface p-5 sm:p-6">
              <div className="mb-4 text-center text-[11px] uppercase tracking-widest text-muted">
                {result.length - revealCount}{" "}
                {result.length - revealCount === 1 ? "ball" : "balls"} remaining
              </div>
              <div className="flex flex-wrap justify-center gap-3 sm:gap-4">
                {result.map((entry, idx) => {
                  if (idx < revealCount) return null;
                  const isHighlighted = idx === highlightIdx;
                  return (
                    <div
                      key={entry.entrant_id}
                      className={[
                        "flex flex-col items-center justify-center rounded-full text-white",
                        "h-16 w-16 sm:h-[4.5rem] sm:w-[4.5rem] select-none",
                        "transition-[transform,box-shadow] duration-300",
                        isHighlighted
                          ? "scale-[1.3] ring-4 ring-[#f5c11c] shadow-[0_0_32px_rgba(245,193,28,0.75)] animate-pulse z-10"
                          : "animate-bounce shadow-md",
                      ].join(" ")}
                      style={{
                        background: tintFor(entry.entrant_name),
                        animationDelay: `${(idx * 173) % 700}ms`,
                        animationDuration: isHighlighted
                          ? "0.5s"
                          : `${0.7 + ((idx * 137) % 500) / 1000}s`,
                      }}
                    >
                      <span className="text-[11px] font-bold leading-none">
                        {initialsFor(entry.entrant_name)}
                      </span>
                      <span className="mt-0.5 max-w-full truncate px-1 text-center text-[8px] font-semibold leading-none">
                        {entry.entrant_name.split(" ")[0]}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Results list */}
          {revealed.length > 0 && (
            <div className="soft-card rounded-2xl border border-border bg-surface p-5">
              <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted">
                {complete ? "Final Draft Order" : "Revealed so far"}
              </div>
              <ol className="space-y-2">
                {[...revealed]
                  .sort((a, b) =>
                    complete
                      ? a.draft_position - b.draft_position
                      : b.draft_position - a.draft_position
                  )
                  .map((entry) => (
                    <li
                      key={entry.entrant_id}
                      className={[
                        "animate-fade-up flex items-center gap-3 rounded-xl border px-4 py-3",
                        entry.draft_position === 1
                          ? "border-[#f5c11c]/40 bg-[#f5c11c]/[0.07]"
                          : "border-border/40 bg-bg/40",
                      ].join(" ")}
                    >
                      <div
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                        style={{ background: tintFor(entry.entrant_name) }}
                      >
                        {initialsFor(entry.entrant_name)}
                      </div>
                      <span className="flex-1 font-semibold">{entry.entrant_name}</span>
                      <span
                        className={[
                          "shrink-0 text-sm font-bold tabular-nums",
                          entry.draft_position === 1 ? "text-[#f5c11c]" : "text-muted",
                        ].join(" ")}
                      >
                        {entry.draft_position === 1 ? "🏆 Pick #1" : `Pick #${entry.draft_position}`}
                      </span>
                    </li>
                  ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
