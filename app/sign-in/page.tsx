"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { getErrorMessage } from "@/lib/error";

type TournamentOption = {
  slug: "masters" | "pga-championship" | "us-open" | "the-open";
  label: string;
};

type Entrant = {
  entrant_id: string;
  entrant_name: string;
  entrant_slug: string;
  draft_position: number | null;
  is_admin: boolean;
};

const TOURNAMENTS: TournamentOption[] = [
  { slug: "masters", label: "The Masters" },
  { slug: "pga-championship", label: "PGA Championship" },
  { slug: "us-open", label: "U.S. Open" },
  { slug: "the-open", label: "The Open Championship" },
];

function SignInPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const basePoolId = process.env.NEXT_PUBLIC_POOL_ID || "2026-majors";
  const returnTo = searchParams.get("returnTo") || "/";

  const [selectedTournament, setSelectedTournament] = useState<TournamentOption["slug"]>("masters");
  const [entrants, setEntrants] = useState<Entrant[]>([]);
  const [entrantsLoading, setEntrantsLoading] = useState(true);

  const [loginSlug, setLoginSlug] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);

  const poolId = useMemo(
    () => `${basePoolId}-${selectedTournament}`,
    [basePoolId, selectedTournament],
  );

  // Honor ?entrant= and ?tournament= in the invite link
  useEffect(() => {
    const entrantParam = searchParams.get("entrant");
    const tournamentParam = searchParams.get("tournament");
    if (tournamentParam && TOURNAMENTS.some((t) => t.slug === tournamentParam)) {
      setSelectedTournament(tournamentParam as TournamentOption["slug"]);
    }
    if (entrantParam) setLoginSlug(entrantParam);
  }, [searchParams]);

  // If a valid session already exists, bounce to returnTo (or to /welcome
  // if they haven't seen it yet). Prevents the "I'm signed in but I'm
  // staring at a sign-in page" dead end.
  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const res = await fetch(`/api/auth/me?pool_id=${encodeURIComponent(poolId)}`, {
          cache: "no-store",
        });
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
        // ignore — just show the form
      } finally {
        if (!cancelled) setSessionChecked(true);
      }
    }
    void check();
    return () => {
      cancelled = true;
    };
  }, [poolId, returnTo, router]);

  useEffect(() => {
    let cancelled = false;
    async function loadEntrants() {
      setEntrantsLoading(true);
      try {
        const res = await fetch(`/api/entrants?pool_id=${encodeURIComponent(poolId)}`, {
          cache: "no-store",
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? "Failed to load entrants");
        if (!cancelled) {
          const rows = (json.entrants ?? []) as Entrant[];
          setEntrants(rows);
          setLoginSlug((current) => current || rows[0]?.entrant_slug || "");
        }
      } catch {
        if (!cancelled) setEntrants([]);
      } finally {
        if (!cancelled) setEntrantsLoading(false);
      }
    }
    void loadEntrants();
    return () => {
      cancelled = true;
    };
  }, [poolId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!loginSlug || !accessCode.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/entrant-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pool_id: poolId,
          entrant_slug: loginSlug,
          access_code: accessCode,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to sign in");
      // First-time sign-in → route through /welcome so the video (and a
      // one-time nickname moment later) happens before anything else.
      const welcomedAt = json?.entrant?.welcomed_at ?? null;
      if (!welcomedAt) {
        router.replace(`/welcome?returnTo=${encodeURIComponent(returnTo)}`);
      } else {
        router.replace(returnTo);
      }
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Failed to sign in"));
    } finally {
      setSubmitting(false);
    }
  }

  if (!sessionChecked) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center">
        <div className="text-sm text-muted">Checking session&hellip;</div>
      </main>
    );
  }

  return (
    <main className="flex min-h-[calc(100vh-9rem)] items-center justify-center px-2 py-6 sm:py-12">
      <section className="hero-panel soft-card relative w-full max-w-md overflow-hidden rounded-[2rem] border px-6 py-8 sm:px-8 sm:py-10">
        <div className="pointer-events-none absolute -left-16 top-8 h-44 w-44 rounded-full bg-accent/20 blur-3xl" />
        <div className="pointer-events-none absolute right-6 top-6 h-36 w-36 rounded-full bg-accent/10 blur-3xl" />

        <div className="relative">
          <p className="text-[11px] uppercase tracking-[0.3em] text-muted">Surge</p>
          <h1 className="mt-3 text-3xl font-semibold leading-[1.05] text-info sm:text-4xl">
            Sign in
          </h1>
          <p className="mt-2 text-sm text-muted">
            Enter the access code your commissioner sent you.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <label className="block text-xs text-muted">
              <span className="mb-1 block uppercase tracking-[0.18em]">Event pool</span>
              <select
                value={selectedTournament}
                onChange={(e) => setSelectedTournament(e.target.value as TournamentOption["slug"])}
                className="glass-input w-full rounded-xl px-3 py-3 text-sm text-text"
              >
                {TOURNAMENTS.map((t) => (
                  <option key={t.slug} value={t.slug}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs text-muted">
              <span className="mb-1 block uppercase tracking-[0.18em]">Entrant</span>
              <select
                value={loginSlug}
                onChange={(e) => setLoginSlug(e.target.value)}
                disabled={entrantsLoading || entrants.length === 0}
                autoComplete="username"
                name="entrant"
                className="glass-input w-full rounded-xl px-3 py-3 text-sm text-text"
              >
                <option value="">
                  {entrantsLoading ? "Loading…" : "Select entrant"}
                </option>
                {entrants.map((entrant) => (
                  <option key={entrant.entrant_id} value={entrant.entrant_slug}>
                    {entrant.entrant_name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs text-muted">
              <span className="mb-1 block uppercase tracking-[0.18em]">Access code</span>
              <input
                type="password"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                name="access-code"
                inputMode="text"
                className="glass-input w-full rounded-xl px-3 py-3 text-sm text-text"
              />
            </label>

            {error && (
              <div className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !loginSlug || !accessCode.trim()}
              className={[
                "w-full rounded-xl px-4 py-3 text-sm font-semibold transition-all",
                submitting || !loginSlug || !accessCode.trim()
                  ? "bg-border/50 text-muted"
                  : "bg-accent text-white shadow-[0_12px_28px_rgba(99,91,255,0.28)]",
              ].join(" ")}
            >
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <div className="mt-6 text-[11px] text-muted">
            Lost your access code? Ask your commissioner to regenerate it from the{" "}
            <Link href="/admin" className="underline">
              Admin
            </Link>{" "}
            page.
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
