"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getErrorMessage } from "@/lib/error";
import { formatLastUpdated, useAutoRefreshValue } from "@/lib/useAutoRefresh";
import { useRequireEntrant } from "@/lib/useRequireEntrant";

type Golfer = {
  id: string;
  rank: number;
  golfer: string;
  handicap: number;
};

type DraftPickRow = {
  entrant_name: string;
  golfer: string;
  pick_number: number;
};

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
  auto_draft_enabled?: boolean;
};

type TournamentMetaRow = {
  tournament_slug: string;
  label: string;
  draft_open?: boolean;
  draft_active_now?: boolean;
};

type DraftStateRow = {
  draft_open: boolean;
  draft_active_now?: boolean;
  draft_started: boolean;
  current_pick: number | null;
  current_round: number | null;
  current_entrant_id: string | null;
  current_entrant_name: string | null;
  entrant_count: number;
  expected_entrant_count: number;
  total_picks: number;
  max_picks: number;
  is_complete: boolean;
  turn_started_at: string | null;
  turn_expires_at: string | null;
};

const TOURNAMENTS: TournamentOption[] = [
  { slug: "masters", label: "The Masters" },
  { slug: "pga-championship", label: "PGA Championship" },
  { slug: "us-open", label: "U.S. Open" },
  { slug: "the-open", label: "The Open Championship" },
];

const FALLBACK_GOLFERS: Golfer[] = [
  { id: "Scottie Scheffler", rank: 1, golfer: "Scottie Scheffler", handicap: 2.1 },
  { id: "Rory McIlroy", rank: 2, golfer: "Rory McIlroy", handicap: 2.3 },
  { id: "Jon Rahm", rank: 3, golfer: "Jon Rahm", handicap: 3.0 },
  { id: "Xander Schauffele", rank: 4, golfer: "Xander Schauffele", handicap: 3.4 },
  { id: "Ludvig Aberg", rank: 5, golfer: "Ludvig Aberg", handicap: 4.2 },
  { id: "Collin Morikawa", rank: 6, golfer: "Collin Morikawa", handicap: 4.7 },
];

const MAX_PICKS_PER_ENTRANT = 6;

function createInitialPicks(entrantNames: string[]) {
  const result: Record<string, string[]> = {};
  for (const entrant of entrantNames) {
    result[entrant] = [];
  }
  return result;
}

function normalizePicks(rows: DraftPickRow[], entrantNames: string[]) {
  const base = createInitialPicks(entrantNames);
  for (const row of rows) {
    if (!base[row.entrant_name]) base[row.entrant_name] = [];
    base[row.entrant_name].push(row.golfer);
  }
  return base;
}

function formatCountdown(totalSeconds: number | null) {
  if (totalSeconds === null) return "-";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

function DraftPageContent() {
  const searchParams = useSearchParams();
  const basePoolId = process.env.NEXT_PUBLIC_POOL_ID || "2026-majors";
  const [selectedTournament, setSelectedTournament] = useState<TournamentOption["slug"]>("masters");
  const [query, setQuery] = useState("");
  const [draftOpen, setDraftOpen] = useState(false);
  const [draftState, setDraftState] = useState<DraftStateRow | null>(null);
  const refreshTick = useAutoRefreshValue(30000, draftOpen);
  const [clockTick, setClockTick] = useState(0);

  const [entrants, setEntrants] = useState<Entrant[]>([]);
  const [entrantsError, setEntrantsError] = useState<string | null>(null);

  const [sessionEntrant, setSessionEntrant] = useState<Entrant | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [togglingAutoDraft, setTogglingAutoDraft] = useState(false);

  useRequireEntrant({ ready: !sessionLoading, entrant: sessionEntrant });

  const [golfers, setGolfers] = useState<Golfer[]>(FALLBACK_GOLFERS);
  const [loadingGolfers, setLoadingGolfers] = useState(true);
  const [golfersError, setGolfersError] = useState<string | null>(null);

  const [picksByEntrant, setPicksByEntrant] = useState<Record<string, string[]>>({});
  const [loadingPicks, setLoadingPicks] = useState(true);
  const [savingPicks, setSavingPicks] = useState(false);
  const [picksError, setPicksError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const poolId = `${basePoolId}-${selectedTournament}`;
  const entrantNames = useMemo(() => entrants.map((entrant) => entrant.entrant_name), [entrants]);

  useEffect(() => {
    const tournamentParam = searchParams.get("tournament");
    if (
      tournamentParam &&
      TOURNAMENTS.some((option) => option.slug === tournamentParam)
    ) {
      setSelectedTournament(tournamentParam as TournamentOption["slug"]);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!draftOpen) return;
    const intervalId = window.setInterval(() => setClockTick((value) => value + 1), 1000);
    return () => window.clearInterval(intervalId);
  }, [draftOpen]);

  useEffect(() => {
    let cancelled = false;

    async function loadDraftState() {
      try {
        const [metaRes, stateRes] = await Promise.all([
          fetch(`/api/tournament-meta?pool_id=${encodeURIComponent(poolId)}`, { cache: "no-store" }),
          fetch(`/api/draft-state?pool_id=${encodeURIComponent(poolId)}`, { cache: "no-store" }),
        ]);
        const [metaJson, stateJson] = await Promise.all([metaRes.json(), stateRes.json()]);
        if (!metaRes.ok) throw new Error(metaJson?.error ?? "Failed to load draft state");
        if (!stateRes.ok) throw new Error(stateJson?.error ?? "Failed to load draft pointer");
        const rows = (metaJson.rows ?? []) as TournamentMetaRow[];
        if (!cancelled) {
          setDraftOpen(
            rows.find((row) => row.tournament_slug === selectedTournament)?.draft_active_now ?? false
          );
          setDraftState((stateJson ?? null) as DraftStateRow | null);
        }
      } catch {
        if (!cancelled) {
          setDraftOpen(false);
          setDraftState(null);
        }
      }
    }

    void loadDraftState();
    return () => {
      cancelled = true;
    };
  }, [poolId, selectedTournament]);

  useEffect(() => {
    let cancelled = false;

    async function loadEntrants() {
      setEntrantsError(null);
      try {
        const res = await fetch(`/api/entrants?pool_id=${encodeURIComponent(poolId)}`, { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? "Failed to load entrants");
        if (!cancelled) setEntrants((json.entrants ?? []) as Entrant[]);
      } catch (e: unknown) {
        if (!cancelled) {
          setEntrants([]);
          setEntrantsError(getErrorMessage(e, "Failed to load entrants"));
        }
      }
    }

    async function loadSession() {
      setAuthError(null);
      setSessionLoading(true);
      try {
        const res = await fetch(`/api/auth/me?pool_id=${encodeURIComponent(poolId)}`, { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? "Failed to load session");
        if (!cancelled) setSessionEntrant((json.entrant ?? null) as Entrant | null);
      } catch (e: unknown) {
        if (!cancelled) {
          setSessionEntrant(null);
          setAuthError(getErrorMessage(e, "Failed to load entrant session"));
        }
      } finally {
        if (!cancelled) setSessionLoading(false);
      }
    }

    async function loadGolfers() {
      setLoadingGolfers(true);
      setGolfersError(null);
      try {
        const res = await fetch(`/api/golfers?pool_id=${encodeURIComponent(poolId)}`, { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? "Failed to load golfers");
        const loaded = (json.golfers ?? []) as Golfer[];
        if (!cancelled) setGolfers(loaded.length > 0 ? loaded : FALLBACK_GOLFERS);
      } catch (e: unknown) {
        if (!cancelled) {
          setGolfers(FALLBACK_GOLFERS);
          setGolfersError(getErrorMessage(e, "Failed to load golfers"));
        }
      } finally {
        if (!cancelled) setLoadingGolfers(false);
      }
    }

    void loadEntrants();
    void loadSession();
    void loadGolfers();

    return () => {
      cancelled = true;
    };
  }, [poolId, refreshTick]);

  useEffect(() => {
    let cancelled = false;

    async function loadPicks() {
      setLoadingPicks(true);
      setPicksError(null);
      try {
        const res = await fetch(`/api/draft-picks?pool_id=${encodeURIComponent(poolId)}`, { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? "Failed to load draft picks");

        const rows = (json.rows ?? []) as DraftPickRow[];
        const rowEntrants = Array.from(new Set(rows.map((row) => row.entrant_name)));
        const names = entrantNames.length > 0 ? entrantNames : rowEntrants;

        if (!cancelled) {
          setPicksByEntrant(normalizePicks(rows, names));
          setLastUpdated(new Date());
        }
      } catch (e: unknown) {
        if (!cancelled) setPicksError(getErrorMessage(e, "Failed to load draft picks"));
      } finally {
        if (!cancelled) setLoadingPicks(false);
      }
    }

    void loadPicks();
    return () => {
      cancelled = true;
    };
  }, [poolId, entrantNames, refreshTick]);

  const pickedGolferIds = useMemo(() => {
    const picked = new Set<string>();
    for (const picks of Object.values(picksByEntrant)) {
      for (const golfer of picks) picked.add(golfer);
    }
    return picked;
  }, [picksByEntrant]);

  const activeEntrantName = sessionEntrant?.entrant_name ?? "";
  const activePicks = activeEntrantName ? picksByEntrant[activeEntrantName] ?? [] : [];
  const activeIsFull = activePicks.length >= MAX_PICKS_PER_ENTRANT;
  const draftSummaryNames = entrantNames.length > 0 ? entrantNames : Object.keys(picksByEntrant);
  const isOnClock = Boolean(
    sessionEntrant &&
      draftState?.current_entrant_id &&
      sessionEntrant.entrant_id === draftState.current_entrant_id
  );

  const visibleGolfers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return golfers.filter((g) => {
      if (pickedGolferIds.has(g.golfer)) return false;
      if (!q) return true;
      return g.golfer.toLowerCase().includes(q);
    });
  }, [golfers, pickedGolferIds, query]);

  const timeRemaining = useMemo(() => {
    void clockTick;
    if (!draftState?.turn_expires_at) return null;
    const ms = Date.parse(draftState.turn_expires_at) - Date.now();
    if (!Number.isFinite(ms)) return null;
    return Math.max(0, Math.ceil(ms / 1000));
  }, [draftState?.turn_expires_at, clockTick]);

  async function reloadPicks() {
    const res = await fetch(`/api/draft-picks?pool_id=${encodeURIComponent(poolId)}`, { cache: "no-store" });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error ?? "Failed to reload draft picks");
    const rows = (json.rows ?? []) as DraftPickRow[];
    const rowEntrants = Array.from(new Set(rows.map((row) => row.entrant_name)));
    const names = entrantNames.length > 0 ? entrantNames : rowEntrants;
    setPicksByEntrant(normalizePicks(rows, names));
    setLastUpdated(new Date());
    const stateRes = await fetch(`/api/draft-state?pool_id=${encodeURIComponent(poolId)}`, { cache: "no-store" });
    const stateJson = await stateRes.json();
    if (stateRes.ok) setDraftState((stateJson ?? null) as DraftStateRow | null);
  }

  async function handleLogout() {
    setAuthError(null);
    await fetch("/api/auth/logout", { method: "POST" });
    setSessionEntrant(null);
    window.location.href = "/sign-in";
  }

  async function toggleAutoDraft() {
    if (!sessionEntrant) return;

    setTogglingAutoDraft(true);
    setPicksError(null);
    try {
      const nextValue = !sessionEntrant.auto_draft_enabled;
      const res = await fetch("/api/admin/entrant-auto-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pool_id: poolId,
          entrant_id: sessionEntrant.entrant_id,
          auto_draft_enabled: nextValue,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to update auto-draft");

      setSessionEntrant((current) =>
        current ? { ...current, auto_draft_enabled: nextValue } : current
      );
      setEntrants((current) =>
        current.map((entrant) =>
          entrant.entrant_id === sessionEntrant.entrant_id
            ? { ...entrant, auto_draft_enabled: nextValue }
            : entrant
        )
      );
      if (json?.draft_state) setDraftState(json.draft_state as DraftStateRow);
      await reloadPicks();
    } catch (e: unknown) {
      setPicksError(getErrorMessage(e, "Failed to update auto-draft"));
    } finally {
      setTogglingAutoDraft(false);
    }
  }

  async function addPick(golfer: string) {
    if (!sessionEntrant || activeIsFull || pickedGolferIds.has(golfer)) return;

    setSavingPicks(true);
    setPicksError(null);
    try {
      const res = await fetch("/api/draft-picks/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pool_id: poolId,
          golfer,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to save pick");
      await reloadPicks();
    } catch (e: unknown) {
      setPicksError(getErrorMessage(e, "Failed to save pick"));
    } finally {
      setSavingPicks(false);
    }
  }

  async function clearDraftBoard() {
    if (!sessionEntrant?.is_admin) return;

    setSavingPicks(true);
    setPicksError(null);
    try {
      const res = await fetch("/api/draft-picks/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pool_id: poolId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to reset draft board");
      await reloadPicks();
    } catch (e: unknown) {
      setPicksError(getErrorMessage(e, "Failed to reset draft board"));
    } finally {
      setSavingPicks(false);
    }
  }

  const topBannerError = picksError ?? authError ?? entrantsError ?? null;

  return (
    <main className="space-y-6">
      {topBannerError ? (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger"
        >
          <div className="min-w-0 flex-1">
            <div className="font-semibold">Something went wrong.</div>
            <div className="mt-0.5 break-words text-xs">{topBannerError}</div>
          </div>
          <button
            type="button"
            onClick={() => {
              setPicksError(null);
              setAuthError(null);
              setEntrantsError(null);
            }}
            className="shrink-0 rounded-lg border border-danger/30 px-2 py-1 text-xs font-semibold text-danger hover:bg-danger/10"
            aria-label="Dismiss error"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <section className="soft-card rounded-[1.75rem] border bg-surface px-4 py-5 sm:px-6 sm:py-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-[0.28em] text-muted">
              {TOURNAMENTS.find((t) => t.slug === selectedTournament)?.label ?? "Draft Room"} &middot; Draft Room
            </p>
            <h1 className="mt-1 text-xl font-semibold sm:text-2xl">
              {draftState?.is_complete
                ? "Draft complete"
                : isOnClock
                  ? "You're on the clock"
                  : draftState?.current_entrant_name
                    ? `${draftState.current_entrant_name} is on the clock`
                    : "Waiting for draft to open"}
            </h1>
            <p className="mt-1 text-xs text-muted">
              {draftState?.current_pick
                ? `Pick ${draftState.current_pick} of ${draftState.max_picks ?? 54} · Round ${draftState.current_round ?? "-"}`
                : !draftOpen
                  ? "Draft is paused · opens 9AM–9PM Pacific when the commissioner unlocks it"
                  : "Ready for the first pick"}
              {!draftState?.is_complete && draftOpen && timeRemaining !== null
                ? ` · ${formatCountdown(timeRemaining)} on clock`
                : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.18em]">
            {!draftOpen && (
              <span className="rounded-md bg-surface/70 px-2 py-1 font-semibold text-muted">
                Paused
              </span>
            )}
            {isOnClock && draftOpen && !draftState?.is_complete && (
              <span className="rounded-md bg-accent px-2 py-1 font-semibold text-white">
                Your turn
              </span>
            )}
            {sessionEntrant?.is_admin && (
              <span className="rounded-md border border-accent/40 bg-accent/10 px-2 py-1 font-semibold text-accent">
                Admin
              </span>
            )}
          </div>
        </div>

        {sessionEntrant && (
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border/20 pt-4 text-sm">
            <span className="text-muted">You</span>
            <span className="font-semibold">{sessionEntrant.entrant_name}</span>
            <span className="text-muted">&middot;</span>
            <span>
              <span className="font-semibold">{activePicks.length}</span>
              <span className="text-muted"> / {MAX_PICKS_PER_ENTRANT} picks</span>
            </span>
            <button
              type="button"
              onClick={() => void toggleAutoDraft()}
              disabled={togglingAutoDraft || savingPicks}
              className={[
                "rounded-md px-2 py-1 text-xs font-semibold transition-colors disabled:opacity-50",
                sessionEntrant.auto_draft_enabled
                  ? "bg-accent/15 text-accent hover:bg-accent/25"
                  : "bg-surface/70 text-muted hover:bg-surface",
              ].join(" ")}
            >
              {togglingAutoDraft
                ? "Saving…"
                : `Auto-draft: ${sessionEntrant.auto_draft_enabled ? "on" : "off"}`}
            </button>
            <span className="ml-auto text-xs text-muted">
              {savingPicks
                ? "Saving…"
                : loadingPicks
                  ? "Loading…"
                  : `Updated ${formatLastUpdated(lastUpdated)}`}
            </span>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="text-xs text-muted underline underline-offset-4 hover:text-text"
            >
              Sign out
            </button>
          </div>
        )}
      </section>

      {activePicks.length > 0 && (
        <section className="soft-card rounded-[1.5rem] border bg-surface/70 p-4">
          <div className="text-[11px] uppercase tracking-[0.28em] text-muted">Your picks</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {activePicks.map((golfer, idx) => (
              <span
                key={`${golfer}-${idx}`}
                className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-bg/60 px-2 py-1 text-xs"
              >
                <span className="text-muted">{idx + 1}.</span>
                <span className="font-medium">{golfer}</span>
              </span>
            ))}
          </div>
        </section>
      )}

      <section className="soft-card rounded-2xl border border-border bg-surface p-3 sm:p-4">
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">Golfer Pool</div>
              <div className="text-xs text-muted">
                Only undrafted golfers are shown here. Once selected, a golfer disappears from the board for everyone else.
              </div>
              {loadingGolfers && <div className="text-xs text-muted">Loading golfers from Supabase...</div>}
              {golfersError && <div className="text-xs text-danger">Supabase load failed; using fallback list.</div>}
              {!draftOpen && (
                <div className="text-xs text-muted">Draft actions are disabled while the board is locked.</div>
              )}
            </div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search golfer..."
              aria-label="Search golfer"
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm sm:w-48"
            />
          </div>

          <ul className="space-y-2 md:hidden">
            {visibleGolfers.map((golfer) => {
              const picked = pickedGolferIds.has(golfer.golfer);
              const pickedBy =
                entrants.find((entrant) => (picksByEntrant[entrant.entrant_name] ?? []).includes(golfer.golfer))
                  ?.entrant_name ??
                Object.keys(picksByEntrant).find((entrantName) =>
                  (picksByEntrant[entrantName] ?? []).includes(golfer.golfer)
                ) ??
                null;
              const canPick =
                Boolean(sessionEntrant) &&
                draftOpen &&
                isOnClock &&
                !picked &&
                !activeIsFull &&
                !savingPicks &&
                !draftState?.is_complete;
              const buttonLabel = !sessionEntrant
                ? "Sign in"
                : picked
                  ? "Locked"
                  : !draftOpen
                    ? "Locked"
                    : draftState?.is_complete
                      ? "Done"
                      : isOnClock
                        ? "Draft"
                        : "Wait";
              return (
                <li
                  key={`m-${golfer.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-bg/50 px-3 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex min-w-[1.75rem] justify-center rounded-md bg-surface/60 px-1.5 py-0.5 text-xs font-semibold text-muted">
                        #{golfer.rank}
                      </span>
                      <div className="truncate text-sm font-medium">{golfer.golfer}</div>
                    </div>
                    <div className="mt-1 text-xs text-muted">
                      Hdcp {golfer.handicap.toFixed(1)}
                      {pickedBy ? (
                        <span className="text-danger"> &middot; Drafted by {pickedBy}</span>
                      ) : (
                        <span className="text-accent"> &middot; Available</span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void addPick(golfer.golfer)}
                    disabled={!canPick}
                    aria-label={`Draft ${golfer.golfer}`}
                    className={[
                      "shrink-0 rounded-lg px-4 py-2 text-sm font-semibold",
                      canPick ? "bg-accent text-black" : "bg-border text-muted",
                    ].join(" ")}
                  >
                    {buttonLabel}
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="hidden overflow-auto rounded-xl border border-border/70 md:block">
            <table className="w-full min-w-[700px] text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-3 text-left">Rank</th>
                  <th className="px-3 py-3 text-left">Golfer</th>
                  <th className="px-3 py-3 text-left">Handicap</th>
                  <th className="px-3 py-3 text-left">Status</th>
                  <th className="px-3 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {visibleGolfers.map((golfer) => {
                  const picked = pickedGolferIds.has(golfer.golfer);
                  const pickedBy =
                    entrants.find((entrant) => (picksByEntrant[entrant.entrant_name] ?? []).includes(golfer.golfer))
                      ?.entrant_name ??
                    Object.keys(picksByEntrant).find((entrantName) =>
                      (picksByEntrant[entrantName] ?? []).includes(golfer.golfer)
                    ) ??
                    null;
                  const canPick =
                    Boolean(sessionEntrant) &&
                    draftOpen &&
                    isOnClock &&
                    !picked &&
                    !activeIsFull &&
                    !savingPicks &&
                    !draftState?.is_complete;

                  return (
                    <tr key={golfer.id}>
                      <td className="px-3 py-3">{golfer.rank}</td>
                      <td className="px-3 py-3 font-medium">{golfer.golfer}</td>
                      <td className="px-3 py-3">{golfer.handicap.toFixed(1)}</td>
                      <td className="px-3 py-3">
                        {pickedBy ? (
                          <span className="text-xs text-danger">Drafted by {pickedBy}</span>
                        ) : (
                          <span className="text-xs text-accent">Available</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => void addPick(golfer.golfer)}
                          disabled={!canPick}
                          className={[
                            "rounded-lg px-3 py-1.5 text-xs font-semibold",
                            canPick ? "bg-accent text-black" : "bg-border text-muted",
                          ].join(" ")}
                        >
                          {!sessionEntrant
                            ? "Sign in"
                            : picked
                              ? "Locked"
                              : !draftOpen
                                ? "Locked"
                                : draftState?.is_complete
                                  ? "Done"
                                  : isOnClock
                                    ? "Draft"
                                    : "Wait"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
      </section>

      <section className="soft-card rounded-2xl border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold">Draft Summary</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {draftSummaryNames.map((entrantName) => {
            const picks = picksByEntrant[entrantName] ?? [];
            return (
              <div key={entrantName} className="rounded-xl border border-border/70 bg-bg/50 p-3">
                <div className="text-sm font-semibold">{entrantName}</div>
                <div className="mt-1 text-xs text-muted">
                  {picks.length} / {MAX_PICKS_PER_ENTRANT} picks
                </div>
                {entrants.find((entrant) => entrant.entrant_name === entrantName)?.auto_draft_enabled && (
                  <div className="mt-1 text-[11px] uppercase tracking-wide text-accent">Auto Draft</div>
                )}
                <div className="mt-2 space-y-1 text-xs">
                  {picks.length === 0 && <div className="text-muted">No picks yet.</div>}
                  {picks.map((golfer, idx) => (
                    <div key={`${entrantName}-${golfer}-${idx}`}>
                      {idx + 1}. {golfer}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {sessionEntrant?.is_admin && (
        <div className="flex justify-center pt-1">
          <button
            type="button"
            onClick={() => void clearDraftBoard()}
            disabled={!draftOpen}
            className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-2 text-xs font-semibold text-danger disabled:opacity-50"
          >
            Admin · Reset Draft Board
          </button>
        </div>
      )}
    </main>
  );
}

export default function DraftPage() {
  return (
    <Suspense fallback={<main className="space-y-6"><section className="soft-card rounded-[1.5rem] border bg-surface/70 p-4 text-sm text-muted backdrop-blur-xl">Loading draft room...</section></main>}>
      <DraftPageContent />
    </Suspense>
  );
}
