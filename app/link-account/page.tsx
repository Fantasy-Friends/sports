"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { getErrorMessage } from "@/lib/error";
import ThemeToggle from "@/components/ThemeToggle";

type Phase = "picking" | "fading" | "playing";

type Member = {
  entrant_id: string;
  display_name: string;
};

const FADE_DURATION_MS = 1200;

function LinkAccountContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo") || "/";

  const [members, setMembers] = useState<Member[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("picking");
  const [muted, setMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Drive the fading → playing transition with a timer rather than
  // onTransitionEnd, which is unreliable when phase is set before first paint.
  useEffect(() => {
    if (phase !== "fading") return;
    const t = setTimeout(() => setPhase("playing"), FADE_DURATION_MS + 100);
    return () => clearTimeout(t);
  }, [phase]);

  // Once the video element mounts, call play() explicitly.
  // autoPlay alone is sometimes ignored by Chrome when there's no user gesture
  // on the current page (OAuth redirect path). muted guarantees it.
  useEffect(() => {
    if (phase !== "playing" || !videoRef.current) return;
    videoRef.current.play().catch(() => void handleVideoEnd());
  // handleVideoEnd is stable (useCallback below)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const meRes = await fetch("/api/auth/me", { cache: "no-store" });
        const meJson = await meRes.json();
        if (cancelled) return;

        if (meJson?.entrant) {
          if (meJson.entrant.welcomed_at) {
            router.replace(returnTo);
            return;
          }
          // Already linked but not yet welcomed (e.g. retesting) — skip picker
          setLoading(false);
          setPhase("fading");
          return;
        }

        const res = await fetch("/api/season/2026/leaderboard", { cache: "no-store" });
        const json = await res.json();
        if (cancelled) return;
        const rows = (json?.rows ?? []) as Member[];
        setMembers(rows);
        if (rows.length > 0) setSelectedId(rows[0].entrant_id);
      } catch {
        if (!cancelled) setError("Failed to load pool members. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [returnTo, router]);

  const handleVideoEnd = useCallback(async () => {
    try {
      await fetch("/api/auth/welcomed", { method: "POST" });
    } catch {
      // Non-fatal
    }
    router.replace(returnTo);
  }, [returnTo, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/google/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entrant_id: selectedId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to link account");

      if (!json.welcomed_at) {
        setPhase("fading");
      } else {
        router.replace(returnTo);
      }
    } catch (err) {
      setError(getErrorMessage(err, "Failed to link account"));
      setSubmitting(false);
    }
  }

  return (
    <>
      {/* Fullscreen fade-to-black overlay */}
      <div
        aria-hidden="true"
        className="fixed inset-0 z-40 bg-black transition-opacity"
        style={{
          transitionDuration: `${FADE_DURATION_MS}ms`,
          opacity: phase === "picking" ? 0 : 1,
          pointerEvents: phase === "picking" ? "none" : "all",
        }}
      />

      {/* Welcome video — fullscreen, starts muted for guaranteed autoplay */}
      {phase === "playing" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
          <video
            ref={videoRef}
            muted={muted}
            playsInline
            className="h-full w-full object-contain sm:object-cover"
            onEnded={() => void handleVideoEnd()}
            onError={() => void handleVideoEnd()}
          >
            <source src="/cody.mov" type="video/mp4" />
            <source src="/cody.mov" type="video/quicktime" />
          </video>

          {/* Unmute button */}
          <button
            type="button"
            onClick={() => {
              setMuted((m) => !m);
              if (videoRef.current) videoRef.current.muted = !muted;
            }}
            className="absolute bottom-6 right-6 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-opacity hover:bg-black/70"
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <line x1="23" y1="9" x2="17" y2="15" />
                <line x1="17" y1="9" x2="23" y2="15" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              </svg>
            )}
          </button>
        </div>
      )}

      {/* Picker UI */}
      <main className="relative flex min-h-[calc(100vh-9rem)] items-center justify-center px-2 py-6 sm:py-12">
        <div className="absolute right-2 top-2 z-10 sm:right-4 sm:top-4">
          <ThemeToggle />
        </div>
        <section className="hero-panel soft-card relative w-full max-w-md overflow-hidden rounded-[2rem] border px-6 py-8 sm:px-8 sm:py-10">
          <div className="pointer-events-none absolute -left-16 top-8 h-44 w-44 rounded-full bg-accent/20 blur-3xl" />
          <div className="pointer-events-none absolute right-6 top-6 h-36 w-36 rounded-full bg-accent/10 blur-3xl" />

          <div className="relative">
            <p className="text-[11px] uppercase tracking-[0.3em] text-muted">One-time setup</p>
            <h1 className="mt-3 text-3xl font-semibold leading-[1.05] text-info sm:text-4xl">
              Who are you?
            </h1>
            <p className="mt-2 text-sm text-muted">
              Pick your name from the pool. We&rsquo;ll link your Google account so you&rsquo;re signed in automatically from now on.
            </p>

            {loading ? (
              <div className="mt-6 text-sm text-muted">Loading pool members…</div>
            ) : (
              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <label className="block text-xs text-muted">
                  <span className="mb-1 block uppercase tracking-[0.18em]">Your name</span>
                  <select
                    value={selectedId}
                    onChange={(e) => setSelectedId(e.target.value)}
                    className="glass-input w-full rounded-xl px-3 py-3 text-sm text-text"
                  >
                    {members.map((m) => (
                      <option key={m.entrant_id} value={m.entrant_id}>
                        {m.display_name}
                      </option>
                    ))}
                  </select>
                </label>

                {error && (
                  <div className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting || !selectedId}
                  className={[
                    "w-full rounded-xl px-4 py-3 text-sm font-semibold transition-all",
                    submitting || !selectedId
                      ? "bg-border/50 text-muted"
                      : "bg-accent text-white shadow-[0_12px_28px_rgba(99,91,255,0.28)]",
                  ].join(" ")}
                >
                  {submitting ? "Linking…" : "That's me →"}
                </button>
              </form>
            )}
          </div>
        </section>
      </main>
    </>
  );
}

export default function LinkAccountPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-[60vh] items-center justify-center">
          <div className="text-sm text-muted">Loading…</div>
        </main>
      }
    >
      <LinkAccountContent />
    </Suspense>
  );
}
