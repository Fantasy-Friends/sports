"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { getErrorMessage } from "@/lib/error";

// The video is an env-controlled URL so the commissioner can drop in (or
// swap out) the actual file without a deploy touching this code. If not set,
// we render a themed fallback hero so the flow still works.
const WELCOME_VIDEO_URL = process.env.NEXT_PUBLIC_WELCOME_VIDEO_URL || "";

function WelcomePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo") || "/";

  const [displayName, setDisplayName] = useState<string>("");
  const [loadingSession, setLoadingSession] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoEnded, setVideoEnded] = useState(!WELCOME_VIDEO_URL);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Gate: must be authenticated. If already welcomed, bounce through.
  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        const json = await res.json();
        if (cancelled) return;
        if (!json?.entrant) {
          router.replace(`/sign-in?returnTo=${encodeURIComponent(`/welcome?returnTo=${returnTo}`)}`);
          return;
        }
        if (json.entrant.welcomed_at) {
          router.replace(returnTo);
          return;
        }
        setDisplayName(json.entrant.entrant_name ?? "");
      } catch {
        if (!cancelled) setError("Could not verify your session. Try signing in again.");
      } finally {
        if (!cancelled) setLoadingSession(false);
      }
    }
    void check();
    return () => {
      cancelled = true;
    };
  }, [returnTo, router]);

  async function handleContinue() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/welcomed", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? "Failed to continue");
      }
      router.replace(returnTo);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to continue"));
      setSubmitting(false);
    }
  }

  if (loadingSession) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center">
        <div className="text-sm text-muted">Loading&hellip;</div>
      </main>
    );
  }

  return (
    <main className="flex min-h-[calc(100vh-9rem)] items-center justify-center px-2 py-6 sm:py-10">
      <section className="hero-panel soft-card relative w-full max-w-3xl overflow-hidden rounded-[2rem] border px-5 py-8 sm:px-8 sm:py-10">
        <div className="pointer-events-none absolute -left-20 top-4 h-56 w-56 rounded-full bg-accent/25 blur-3xl" />
        <div className="pointer-events-none absolute right-0 top-12 h-48 w-48 rounded-full bg-accent/15 blur-3xl" />

        <div className="relative">
          <p className="text-[11px] uppercase tracking-[0.3em] text-muted">First time here</p>
          <h1 className="mt-3 text-3xl font-semibold leading-[1.05] text-info sm:text-4xl md:text-5xl">
            Welcome to the Surge
            {displayName ? <span className="text-text">, {displayName}</span> : null}
          </h1>
          <p className="mt-3 text-sm text-muted sm:text-base">
            The 2026 Decathlon lives here. One room per event, presence on
            the rail, hot takes in real time. This clip is the one-minute
            tour &mdash; once you&rsquo;ve watched it, you won&rsquo;t see it again.
          </p>

          <div className="mt-6 overflow-hidden rounded-[1.25rem] border border-border/30 bg-bg/40">
            {WELCOME_VIDEO_URL ? (
              <video
                ref={videoRef}
                src={WELCOME_VIDEO_URL}
                autoPlay
                playsInline
                controls
                onEnded={() => setVideoEnded(true)}
                className="aspect-video w-full bg-black"
              >
                Your browser doesn&rsquo;t support embedded video.
              </video>
            ) : (
              <div className="relative flex aspect-video w-full flex-col items-center justify-center bg-gradient-to-br from-accent/40 via-bg to-info/30 text-center">
                <div className="text-[10px] uppercase tracking-[0.3em] text-muted">
                  Welcome reel
                </div>
                <div className="mt-3 px-6 text-2xl font-semibold text-info sm:text-3xl">
                  Video coming soon
                </div>
                <div className="mt-2 max-w-md px-6 text-xs text-muted">
                  Set <code className="rounded bg-surface/60 px-1 py-0.5">NEXT_PUBLIC_WELCOME_VIDEO_URL</code> to
                  an MP4 URL and this tile will play it on first sign-in.
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="mt-4 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </div>
          )}

          <div className="mt-6 flex flex-col items-center gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-muted">
              {videoEnded
                ? "Ready when you are."
                : WELCOME_VIDEO_URL
                  ? "You can skip ahead at any time."
                  : ""}
            </div>
            <button
              type="button"
              onClick={() => void handleContinue()}
              disabled={submitting}
              className={[
                "w-full rounded-xl px-5 py-3 text-sm font-semibold transition-all sm:w-auto",
                submitting
                  ? "bg-border/50 text-muted"
                  : "bg-accent text-white shadow-[0_12px_28px_rgba(99,91,255,0.28)]",
              ].join(" ")}
            >
              {submitting ? "Entering…" : "Enter Surge →"}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

export default function WelcomePage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-[60vh] items-center justify-center">
          <div className="text-sm text-muted">Loading welcome&hellip;</div>
        </main>
      }
    >
      <WelcomePageContent />
    </Suspense>
  );
}
