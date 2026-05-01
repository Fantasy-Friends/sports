"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import ThemeToggle from "@/components/ThemeToggle";

function SignInPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo") || "/";
  const oauthError = searchParams.get("error");

  const [sessionChecked, setSessionChecked] = useState(false);

  // If already signed in, skip this page
  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        const json = await res.json();
        if (!cancelled && json?.entrant) {
          if (!json.entrant.welcomed_at) {
            router.replace(`/welcome?returnTo=${encodeURIComponent(returnTo)}`);
          } else {
            router.replace(returnTo);
          }
          return;
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setSessionChecked(true);
      }
    }
    void check();
    return () => { cancelled = true; };
  }, [returnTo, router]);

  const errorMessages: Record<string, string> = {
    oauth_denied: "Sign-in was cancelled.",
    invalid_state: "Something went wrong with the sign-in flow. Please try again.",
    token_failed: "Couldn't complete sign-in with Google. Please try again.",
    userinfo_failed: "Couldn't retrieve your Google account info. Please try again.",
    no_email: "Your Google account doesn't have a verified email address.",
    server_error: "An unexpected error occurred. Please try again.",
  };

  if (!sessionChecked) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center">
        <div className="text-sm text-muted">Checking session&hellip;</div>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-[calc(100vh-9rem)] items-center justify-center px-2 py-6 sm:py-12">
      <div className="absolute right-2 top-2 z-10 sm:right-4 sm:top-4">
        <ThemeToggle />
      </div>
      <section className="hero-panel soft-card relative w-full max-w-md overflow-hidden rounded-[2rem] border px-6 py-8 sm:px-8 sm:py-10">
        <div className="pointer-events-none absolute -left-16 top-8 h-44 w-44 rounded-full bg-accent/20 blur-3xl" />
        <div className="pointer-events-none absolute right-6 top-6 h-36 w-36 rounded-full bg-accent/10 blur-3xl" />

        <div className="relative">
          <p className="text-[11px] uppercase tracking-[0.3em] text-muted">Surge</p>
          <h1 className="mt-3 text-3xl font-semibold leading-[1.05] text-info sm:text-4xl">
            Sign in
          </h1>
          <p className="mt-2 text-sm text-muted">
            Use your Google account to access the pool.
          </p>

          {oauthError && (
            <div className="mt-4 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
              {errorMessages[oauthError] ?? "Something went wrong. Please try again."}
            </div>
          )}

          <div className="mt-6">
            <a
              href={`/api/auth/google?returnTo=${encodeURIComponent(returnTo)}`}
              className="flex w-full items-center justify-center gap-3 rounded-xl border border-border/60 bg-white px-4 py-3 text-sm font-semibold text-gray-700 shadow-sm transition-all hover:bg-gray-50 hover:shadow-md"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" aria-hidden="true">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Sign in with Google
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-[60vh] items-center justify-center">
          <div className="text-sm text-muted">Loading sign-in&hellip;</div>
        </main>
      }
    >
      <SignInPageContent />
    </Suspense>
  );
}
