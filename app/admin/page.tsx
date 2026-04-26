"use client";

import { useEffect, useMemo, useState } from "react";
import { getErrorMessage } from "@/lib/error";
import { useRequireEntrant } from "@/lib/useRequireEntrant";
import AdminEventFinalizer from "@/components/AdminEventFinalizer";

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

type GeneratedCodeState = {
  entrant_id: string;
  entrant_name: string;
  entrant_slug: string;
  access_code: string;
  invite_link: string;
};

type HandicapPreviewRow = {
  rank: number;
  golfer: string;
  best_odds: number;
  sportsbook: string;
  implied_probability: number;
  normalized_probability: number;
  handicap: number;
};

type LiveTournament = {
  tournament_id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  status: string | null;
  venue: string | null;
};

type TournamentMetaRow = {
  tournament_slug: string;
  label: string;
  round_count?: number;
  round_par?: number;
  draft_open?: boolean;
};

type DraftStateRow = {
  draft_open: boolean;
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
};

type NotificationSummary =
  | {
      recipients: number;
      email: { delivered: number; failed: number; skipped: number };
      sms: { delivered: number; failed: number; skipped: number };
    }
  | { error: string }
  | null;

function formatNotificationSummary(summary: NotificationSummary): string | null {
  if (!summary) return null;
  if ("error" in summary) return `Notifications failed: ${summary.error}`;
  const parts: string[] = [`Notified ${summary.recipients} members`];
  const emailTotal = summary.email.delivered + summary.email.failed;
  if (emailTotal > 0) {
    parts.push(
      `email ${summary.email.delivered}/${emailTotal}` +
        (summary.email.failed > 0 ? ` (${summary.email.failed} failed)` : ""),
    );
  }
  const smsTotal = summary.sms.delivered + summary.sms.failed;
  if (smsTotal > 0) {
    parts.push(
      `SMS ${summary.sms.delivered}/${smsTotal}` +
        (summary.sms.failed > 0 ? ` (${summary.sms.failed} failed)` : ""),
    );
  }
  return parts.join(" · ");
}

const TOURNAMENTS: TournamentOption[] = [
  { slug: "masters", label: "The Masters" },
  { slug: "pga-championship", label: "PGA Championship" },
  { slug: "us-open", label: "U.S. Open" },
  { slug: "the-open", label: "The Open Championship" },
];

type AdminTab = "draft" | "entrants" | "odds" | "scores" | "events";

const ADMIN_TABS: Array<{ id: AdminTab; label: string }> = [
  { id: "draft", label: "Draft" },
  { id: "entrants", label: "Entrants" },
  { id: "odds", label: "Odds" },
  { id: "scores", label: "Scores" },
  { id: "events", label: "Events" },
];

function defaultRoundParForTournament(tournamentSlug: string) {
  switch (tournamentSlug) {
    case "masters":
      return 72;
    case "the-open":
      return 71;
    case "pga-championship":
    case "us-open":
    default:
      return 70;
  }
}

export default function AdminPage() {
  const basePoolId = process.env.NEXT_PUBLIC_POOL_ID || "2026-majors";
  const [selectedTournament, setSelectedTournament] = useState<TournamentOption["slug"]>("masters");
  const [entrants, setEntrants] = useState<Entrant[]>([]);
  const [sessionEntrant, setSessionEntrant] = useState<Entrant | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  useRequireEntrant({
    ready: !loadingSession,
    entrant: sessionEntrant,
    requireAdmin: true,
  });

  const [previewRows, setPreviewRows] = useState<HandicapPreviewRow[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [syncingOdds, setSyncingOdds] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const [codeLoadingId, setCodeLoadingId] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [generatedCode, setGeneratedCode] = useState<GeneratedCodeState | null>(null);
  const [autoDraftLoadingId, setAutoDraftLoadingId] = useState<string | null>(null);

  const [scoreSearch, setScoreSearch] = useState("houston");
  const [scoreSeason, setScoreSeason] = useState("2026");
  const [scoreResults, setScoreResults] = useState<LiveTournament[]>([]);
  const [scoreSearchLoading, setScoreSearchLoading] = useState(false);
  const [scoreSearchError, setScoreSearchError] = useState<string | null>(null);
  const [selectedScoreTournamentId, setSelectedScoreTournamentId] = useState<string | null>(null);
  const [selectedScoreTournamentSlug, setSelectedScoreTournamentSlug] = useState("houston-open");
  const [scoreSyncLoading, setScoreSyncLoading] = useState(false);
  const [scoreSyncMessage, setScoreSyncMessage] = useState<string | null>(null);
  const [draftOpen, setDraftOpen] = useState(false);
  const [draftStateLoading, setDraftStateLoading] = useState(false);
  const [draftStateMessage, setDraftStateMessage] = useState<string | null>(null);
  const [draftStateError, setDraftStateError] = useState<string | null>(null);
  const [draftState, setDraftState] = useState<DraftStateRow | null>(null);
  const [resettingPreDraft, setResettingPreDraft] = useState(false);

  const [activeTab, setActiveTab] = useState<AdminTab>("draft");

  const poolId = useMemo(() => `${basePoolId}-${selectedTournament}`, [basePoolId, selectedTournament]);

  useEffect(() => {
    let cancelled = false;

    async function loadAdminState() {
      setLoadingSession(true);
      setPageError(null);
      try {
        const [entrantsRes, sessionRes, metaRes, draftStateRes] = await Promise.all([
          fetch(`/api/entrants?pool_id=${encodeURIComponent(poolId)}`),
          fetch(`/api/auth/me?pool_id=${encodeURIComponent(poolId)}`),
          fetch(`/api/tournament-meta?pool_id=${encodeURIComponent(poolId)}`),
          fetch(`/api/draft-state?pool_id=${encodeURIComponent(poolId)}`),
        ]);

        const entrantsJson = await entrantsRes.json();
        const sessionJson = await sessionRes.json();
        const metaJson = await metaRes.json();
        const draftStateJson = await draftStateRes.json();

        if (!entrantsRes.ok) throw new Error(entrantsJson?.error ?? "Failed to load entrants");
        if (!sessionRes.ok) throw new Error(sessionJson?.error ?? "Failed to load session");
        if (!metaRes.ok) throw new Error(metaJson?.error ?? "Failed to load draft state");
        if (!draftStateRes.ok) throw new Error(draftStateJson?.error ?? "Failed to load draft pointer");

        if (!cancelled) {
          setEntrants((entrantsJson.entrants ?? []) as Entrant[]);
          setSessionEntrant((sessionJson.entrant ?? null) as Entrant | null);
          const metaRows = (metaJson.rows ?? []) as TournamentMetaRow[];
          const draftState =
            metaRows.find((row) => row.tournament_slug === selectedTournament)?.draft_open ?? false;
          setDraftOpen(draftState);
          setDraftState((draftStateJson ?? null) as DraftStateRow | null);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setEntrants([]);
          setSessionEntrant(null);
          setDraftOpen(false);
          setDraftState(null);
          setPageError(getErrorMessage(e, "Failed to load admin state"));
        }
      } finally {
        if (!cancelled) setLoadingSession(false);
      }
    }

    void loadAdminState();
    return () => {
      cancelled = true;
    };
  }, [poolId, selectedTournament]);

  useEffect(() => {
    setPreviewRows([]);
    setPreviewError(null);
    setGeneratedCode(null);
    setCodeError(null);
    setScoreSyncMessage(null);
    setScoreResults([]);
    setSelectedScoreTournamentId(null);
    setDraftStateError(null);
    setDraftStateMessage(null);
  }, [selectedTournament]);

  async function updateDraftState(nextDraftOpen: boolean) {
    setDraftStateLoading(true);
    setDraftStateError(null);
    setDraftStateMessage(null);

    try {
      const res = await fetch("/api/admin/draft-state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pool_id: poolId,
          tournament_slug: selectedTournament,
          draft_open: nextDraftOpen,
        }),
      });
      const json = (await res.json()) as DraftStateRow & {
        notifications?: NotificationSummary;
        error?: string;
      };
      if (!res.ok) throw new Error(json?.error ?? "Failed to update draft state");
      setDraftOpen(nextDraftOpen);
      setDraftState(json as DraftStateRow);
      const base = nextDraftOpen ? "Draft is now open." : "Draft is now locked.";
      const notif = formatNotificationSummary(json.notifications ?? null);
      setDraftStateMessage(notif ? `${base} ${notif}.` : base);
    } catch (e: unknown) {
      setDraftStateError(getErrorMessage(e, "Failed to update draft state"));
    } finally {
      setDraftStateLoading(false);
    }
  }

  async function resetToPreDraftState() {
    setResettingPreDraft(true);
    setDraftStateError(null);
    setDraftStateMessage(null);
    setCodeError(null);

    try {
      const res = await fetch("/api/admin/draft-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pool_id: poolId,
          tournament_slug: selectedTournament,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to reset draft state");

      setDraftOpen(false);
      setDraftState((json ?? null) as DraftStateRow | null);
      setEntrants((current) =>
        current.map((entrant) => ({
          ...entrant,
          auto_draft_enabled: false,
        }))
      );
      setDraftStateMessage("Pool reset to pre-draft state.");
    } catch (e: unknown) {
      setDraftStateError(getErrorMessage(e, "Failed to reset pool to pre-draft state"));
    } finally {
      setResettingPreDraft(false);
    }
  }

  async function loadHandicapPreview() {
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const res = await fetch(`/api/odds/${selectedTournament}/handicaps`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to load handicap preview");
      setPreviewRows((json.handicaps ?? []) as HandicapPreviewRow[]);
    } catch (e: unknown) {
      setPreviewError(getErrorMessage(e, "Failed to load handicap preview"));
    } finally {
      setPreviewLoading(false);
    }
  }

  async function syncTournamentOdds() {
    setSyncingOdds(true);
    setSyncMessage(null);
    setPreviewError(null);
    try {
      const res = await fetch(`/api/odds/${selectedTournament}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pool_id: poolId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to sync tournament odds");
      setSyncMessage(`Synced ${json.count ?? 0} golfers for ${selectedTournament}.`);
    } catch (e: unknown) {
      setPreviewError(getErrorMessage(e, "Failed to sync tournament odds"));
    } finally {
      setSyncingOdds(false);
    }
  }

  async function generateEntrantCode(entrant: Entrant) {
    setCodeLoadingId(entrant.entrant_id);
    setCodeError(null);
    setGeneratedCode(null);
    try {
      const res = await fetch("/api/admin/entrant-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pool_id: poolId,
          entrant_id: entrant.entrant_id,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to generate access code");

      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const inviteLink = `${origin}/?tournament=${encodeURIComponent(selectedTournament)}&entrant=${encodeURIComponent(
        entrant.entrant_slug
      )}`;

      setGeneratedCode({
        entrant_id: entrant.entrant_id,
        entrant_name: entrant.entrant_name,
        entrant_slug: entrant.entrant_slug,
        access_code: json.access_code as string,
        invite_link: inviteLink,
      });
    } catch (e: unknown) {
      setCodeError(getErrorMessage(e, "Failed to generate access code"));
    } finally {
      setCodeLoadingId(null);
    }
  }

  async function updateEntrantAutoDraft(entrant: Entrant, nextValue: boolean) {
    setAutoDraftLoadingId(entrant.entrant_id);
    setCodeError(null);
    try {
      const res = await fetch("/api/admin/entrant-auto-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pool_id: poolId,
          entrant_id: entrant.entrant_id,
          auto_draft_enabled: nextValue,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to update auto-draft");
      setEntrants((current) =>
        current.map((row) =>
          row.entrant_id === entrant.entrant_id ? { ...row, auto_draft_enabled: nextValue } : row
        )
      );
      if (json?.draft_state) {
        setDraftState(json.draft_state as DraftStateRow);
      }
    } catch (e: unknown) {
      setCodeError(getErrorMessage(e, "Failed to update auto-draft"));
    } finally {
      setAutoDraftLoadingId(null);
    }
  }

  async function searchScoreTournaments() {
    setScoreSearchLoading(true);
    setScoreSearchError(null);
    setScoreSyncMessage(null);

    try {
      const res = await fetch(
        `/api/slashgolf/schedules?season=${encodeURIComponent(scoreSeason)}&q=${encodeURIComponent(scoreSearch)}`
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to load live golf schedules");

      const tournaments = ((json.tournaments ?? []) as Array<{
        tournId: number;
        name: string;
        startDate: string | null;
        endDate: string | null;
        status: string | null;
        venue: string | null;
      }>).map((tournament) => ({
        tournament_id: String(tournament.tournId).padStart(3, "0"),
        name: tournament.name,
        start_date: tournament.startDate,
        end_date: tournament.endDate,
        status: tournament.status,
        venue: tournament.venue,
      }));

      setScoreResults(tournaments);
      setSelectedScoreTournamentId(tournaments[0]?.tournament_id ?? null);
    } catch (e: unknown) {
      setScoreSearchError(getErrorMessage(e, "Failed to load live golf schedules"));
      setScoreResults([]);
      setSelectedScoreTournamentId(null);
    } finally {
      setScoreSearchLoading(false);
    }
  }

  async function syncTournamentScores() {
    if (!selectedScoreTournamentId) return;

    setScoreSyncLoading(true);
    setScoreSearchError(null);
    setScoreSyncMessage(null);

    try {
      const res = await fetch("/api/slashgolf/leaderboard/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pool_id: poolId,
          tournament_slug: selectedScoreTournamentSlug.trim(),
          tournament_id: selectedScoreTournamentId,
          year: scoreSeason,
          round_par: defaultRoundParForTournament(selectedScoreTournamentSlug.trim()),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to sync scores");
      setScoreSyncMessage(`Synced ${json.count ?? 0} round-score rows for tournament ${json.tournament_id}.`);
    } catch (e: unknown) {
      setScoreSearchError(getErrorMessage(e, "Failed to sync scores"));
    } finally {
      setScoreSyncLoading(false);
    }
  }

  return (
    <main className="space-y-5">
      <section className="soft-card rounded-[1.75rem] border border-border bg-surface px-4 py-5 sm:px-6 sm:py-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.28em] text-muted">Commissioner</p>
            <h1 className="mt-1 text-xl font-semibold sm:text-2xl">Admin</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedTournament}
              onChange={(e) => setSelectedTournament(e.target.value as TournamentOption["slug"])}
              aria-label="Event pool"
              className="rounded-lg border border-border bg-bg px-3 py-2 text-sm"
            >
              {TOURNAMENTS.map((tournament) => (
                <option key={tournament.slug} value={tournament.slug}>
                  {tournament.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {sessionEntrant && (
          <div className="mt-3 text-xs text-muted">
            Signed in as <span className="font-semibold text-text">{sessionEntrant.entrant_name}</span>
          </div>
        )}
      </section>

      {!loadingSession && !pageError && sessionEntrant?.is_admin && (
        <nav
          aria-label="Admin tools"
          className="soft-card -mx-1 overflow-x-auto rounded-[1.25rem] border border-border bg-surface/60 p-1"
        >
          <div className="flex min-w-max gap-1">
            {ADMIN_TABS.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  aria-current={active ? "page" : undefined}
                  className={[
                    "whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold transition-colors",
                    active
                      ? "bg-accent text-white shadow-[0_10px_24px_rgba(99,91,255,0.22)]"
                      : "text-muted hover:bg-surface/80 hover:text-text",
                  ].join(" ")}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </nav>
      )}

      {loadingSession && (
        <section className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
          Loading admin tools...
        </section>
      )}

      {pageError && (
        <section className="rounded-2xl border border-danger/40 bg-surface p-4 text-sm text-danger">
          {pageError}
        </section>
      )}

      {!loadingSession && !pageError && sessionEntrant?.is_admin && (
        <>
          {activeTab === "draft" && (
            <section className="soft-card rounded-2xl border border-border bg-surface p-4 sm:p-5">
              <div className="rounded-xl border border-border/70 bg-bg/40 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-sm font-semibold">Draft Controls</h2>
                    <p className="mt-1 text-xs text-muted">
                      Open the draft when players are allowed to make picks. Lock it to freeze draft actions and pause auto-refresh on the live pages.
                    </p>
                  </div>
                  <div className="flex flex-col items-start gap-2 sm:items-end">
                    <div className="text-xs text-muted">
                      Status:{" "}
                      <span className={draftOpen ? "font-semibold text-accent" : "font-semibold text-text"}>
                        {draftOpen ? "Open" : "Locked"}
                      </span>
                    </div>
                    <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
                      <button
                        type="button"
                        onClick={() => void updateDraftState(true)}
                        disabled={draftStateLoading || resettingPreDraft || draftOpen}
                        className={[
                          "rounded-lg px-3 py-2 text-sm font-semibold",
                          draftStateLoading || resettingPreDraft || draftOpen ? "bg-border text-muted" : "bg-accent text-black",
                        ].join(" ")}
                      >
                        Open Draft
                      </button>
                      <button
                        type="button"
                        onClick={() => void updateDraftState(false)}
                        disabled={draftStateLoading || resettingPreDraft || !draftOpen}
                        className={[
                          "rounded-lg px-3 py-2 text-sm font-semibold",
                          draftStateLoading || resettingPreDraft || !draftOpen
                            ? "bg-border text-muted"
                            : "border border-border bg-bg text-text",
                        ].join(" ")}
                      >
                        Lock Draft
                      </button>
                      <button
                        type="button"
                        onClick={() => void resetToPreDraftState()}
                        disabled={draftStateLoading || resettingPreDraft}
                        className={[
                          "col-span-2 rounded-lg px-3 py-2 text-sm font-semibold sm:col-span-1",
                          draftStateLoading || resettingPreDraft
                            ? "bg-border text-muted"
                            : "border border-danger/40 bg-danger/10 text-danger",
                        ].join(" ")}
                      >
                        {resettingPreDraft ? "Resetting..." : "Reset To Pre-Draft"}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border border-border/70 bg-surface px-3 py-3">
                    <div className="text-[11px] uppercase tracking-wide text-muted">Entrants</div>
                    <div className="mt-1 text-sm font-semibold text-text">
                      {draftState?.entrant_count ?? entrants.length} / {draftState?.expected_entrant_count ?? 9}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-surface px-3 py-3">
                    <div className="text-[11px] uppercase tracking-wide text-muted">Current Pick</div>
                    <div className="mt-1 text-sm font-semibold text-text">
                      {draftState?.is_complete ? "Complete" : draftState?.current_pick ?? "-"}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-surface px-3 py-3">
                    <div className="text-[11px] uppercase tracking-wide text-muted">On The Clock</div>
                    <div className="mt-1 text-sm font-semibold text-text">
                      {draftState?.is_complete ? "Draft complete" : draftState?.current_entrant_name ?? "Not started"}
                    </div>
                  </div>
                </div>
                {draftStateMessage && <div className="mt-3 text-xs text-accent">{draftStateMessage}</div>}
                {draftStateError && <div className="mt-3 text-xs text-danger">{draftStateError}</div>}
              </div>
            </section>
          )}

          {activeTab === "odds" && (
            <section className="soft-card rounded-2xl border border-border bg-surface p-4 sm:p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-sm font-semibold">Odds And Handicap Sync</h2>
                  <p className="mt-1 text-xs text-muted">
                    Use this before the draft starts. Preview the model, then sync golfers and handicaps into the pool.
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => void loadHandicapPreview()}
                    disabled={previewLoading}
                    className={[
                      "rounded-lg px-3 py-2 text-sm font-semibold sm:min-w-[160px]",
                      previewLoading ? "bg-border text-muted" : "border border-border bg-bg text-text",
                    ].join(" ")}
                  >
                    {previewLoading ? "Loading preview..." : "Preview Handicaps"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void syncTournamentOdds()}
                    disabled={syncingOdds}
                    className={[
                      "rounded-lg px-3 py-2 text-sm font-semibold sm:min-w-[180px]",
                      syncingOdds ? "bg-border text-muted" : "bg-accent text-black",
                    ].join(" ")}
                  >
                    {syncingOdds ? "Syncing odds..." : "Sync Odds + Handicaps"}
                  </button>
                </div>
              </div>
              {syncMessage && <div className="mt-3 text-xs text-accent">{syncMessage}</div>}
              {previewError && <div className="mt-3 text-xs text-danger">{previewError}</div>}

              {previewRows.length === 0 && !previewLoading ? (
                <div className="mt-4 rounded-xl border border-border/70 bg-bg/40 p-4 text-sm text-muted">
                  No preview loaded yet. Use this when you want to sanity-check odds-derived handicaps before they go live.
                </div>
              ) : (
                previewRows.length > 0 && (
                  <div className="mt-4 overflow-auto rounded-xl border border-border/70">
                    <table className="w-full min-w-[860px] text-sm">
                      <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
                        <tr>
                          <th className="px-3 py-3 text-left">Rank</th>
                          <th className="px-3 py-3 text-left">Golfer</th>
                          <th className="px-3 py-3 text-right">Odds</th>
                          <th className="px-3 py-3 text-right">Implied Prob</th>
                          <th className="px-3 py-3 text-right">Norm Prob</th>
                          <th className="px-3 py-3 text-right">Handicap</th>
                          <th className="px-3 py-3 text-left">Book</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/70">
                        {previewRows.map((row) => (
                          <tr key={row.golfer}>
                            <td className="px-3 py-3">{row.rank}</td>
                            <td className="px-3 py-3 font-medium">{row.golfer}</td>
                            <td className="px-3 py-3 text-right">
                              {row.best_odds > 0 ? `+${row.best_odds}` : row.best_odds}
                            </td>
                            <td className="px-3 py-3 text-right">{(row.implied_probability * 100).toFixed(2)}%</td>
                            <td className="px-3 py-3 text-right">{(row.normalized_probability * 100).toFixed(2)}%</td>
                            <td className="px-3 py-3 text-right font-semibold">-{row.handicap}</td>
                            <td className="px-3 py-3">{row.sportsbook}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              )}
            </section>
          )}

          {activeTab === "entrants" && (
            <section className="soft-card rounded-2xl border border-border bg-surface p-4 sm:p-5">
              <h2 className="text-sm font-semibold">Entrant Access</h2>
              <p className="mt-1 text-xs text-muted">
                Use this when inviting players or rotating access codes. Generate a code, then send the invite link and code together.
              </p>

              {codeError && <div className="mt-3 text-xs text-danger">{codeError}</div>}
              {generatedCode && (
                <div className="mt-4 rounded-xl border border-accent/40 bg-accent/10 p-4">
                  <div className="text-sm font-semibold">Access code ready for {generatedCode.entrant_name}</div>
                  <div className="mt-2 text-sm">
                    Code: <span className="font-mono font-semibold">{generatedCode.access_code}</span>
                  </div>
                  <div className="mt-2 break-all text-xs text-muted">Invite link: {generatedCode.invite_link}</div>
                  <div className="mt-2 text-xs text-muted">
                    Use this when a player is joining for the first time or if you need to reset their access.
                  </div>
                </div>
              )}

              <ul className="mt-4 space-y-2 md:hidden">
                {entrants.map((entrant) => (
                  <li
                    key={`m-${entrant.entrant_id}`}
                    className="rounded-xl border border-border/70 bg-bg/40 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">{entrant.entrant_name}</div>
                        <div className="truncate text-xs text-muted">{entrant.entrant_slug}</div>
                      </div>
                      <span
                        className={[
                          "shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em]",
                          entrant.is_admin ? "bg-accent/15 text-accent" : "bg-surface/70 text-muted",
                        ].join(" ")}
                      >
                        {entrant.is_admin ? "Admin" : "Player"}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => void updateEntrantAutoDraft(entrant, !entrant.auto_draft_enabled)}
                        disabled={autoDraftLoadingId === entrant.entrant_id}
                        className={[
                          "rounded-lg px-3 py-2 text-xs font-semibold",
                          autoDraftLoadingId === entrant.entrant_id
                            ? "bg-border text-muted"
                            : entrant.auto_draft_enabled
                              ? "bg-accent text-black"
                              : "border border-border bg-bg text-text",
                        ].join(" ")}
                      >
                        {autoDraftLoadingId === entrant.entrant_id
                          ? "Saving..."
                          : entrant.auto_draft_enabled
                            ? "Auto On"
                            : "Auto Off"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void generateEntrantCode(entrant)}
                        disabled={codeLoadingId === entrant.entrant_id}
                        className={[
                          "rounded-lg px-3 py-2 text-xs font-semibold",
                          codeLoadingId === entrant.entrant_id
                            ? "bg-border text-muted"
                            : "border border-border bg-bg text-text",
                        ].join(" ")}
                      >
                        {codeLoadingId === entrant.entrant_id ? "Generating..." : "Generate Code"}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="mt-4 hidden overflow-auto rounded-xl border border-border/70 md:block">
                <table className="w-full min-w-[540px] text-sm">
                  <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
                    <tr>
                      <th className="px-3 py-3 text-left">Entrant</th>
                      <th className="px-3 py-3 text-left">Slug</th>
                      <th className="px-3 py-3 text-left">Role</th>
                      <th className="px-3 py-3 text-left">Auto</th>
                      <th className="px-3 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/70">
                    {entrants.map((entrant) => (
                      <tr key={entrant.entrant_id}>
                        <td className="px-3 py-3 font-medium">{entrant.entrant_name}</td>
                        <td className="px-3 py-3 text-xs text-muted">{entrant.entrant_slug}</td>
                        <td className="px-3 py-3 text-xs">
                          {entrant.is_admin ? <span className="text-accent">Admin</span> : <span className="text-muted">Player</span>}
                        </td>
                        <td className="px-3 py-3 text-xs">
                          <button
                            type="button"
                            onClick={() => void updateEntrantAutoDraft(entrant, !entrant.auto_draft_enabled)}
                            disabled={autoDraftLoadingId === entrant.entrant_id}
                            className={[
                              "rounded-lg px-3 py-1.5 font-semibold",
                              autoDraftLoadingId === entrant.entrant_id
                                ? "bg-border text-muted"
                                : entrant.auto_draft_enabled
                                  ? "bg-accent text-black"
                                  : "border border-border bg-bg text-text",
                            ].join(" ")}
                          >
                            {autoDraftLoadingId === entrant.entrant_id
                              ? "Saving..."
                              : entrant.auto_draft_enabled
                                ? "Auto On"
                                : "Auto Off"}
                          </button>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => void generateEntrantCode(entrant)}
                            disabled={codeLoadingId === entrant.entrant_id}
                            className={[
                              "rounded-lg px-3 py-1.5 text-xs font-semibold",
                              codeLoadingId === entrant.entrant_id
                                ? "bg-border text-muted"
                                : "border border-border bg-bg text-text",
                            ].join(" ")}
                          >
                            {codeLoadingId === entrant.entrant_id ? "Generating..." : "Generate / Reset Code"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {activeTab === "scores" && (
          <section className="soft-card rounded-2xl border border-border bg-surface p-4 sm:p-5">
            <h2 className="text-sm font-semibold">Tournament Score Sync</h2>
            <p className="mt-1 text-xs text-muted">
              Use this during live events or after a round finishes. Search the schedule, select the tournament, and sync leaderboard scores into the app.
            </p>

            <div className="mt-4 grid gap-3 md:grid-cols-[120px,1fr,160px,auto]">
              <input
                value={scoreSeason}
                onChange={(e) => setScoreSeason(e.target.value)}
                placeholder="Season"
                className="rounded-lg border border-border bg-bg px-3 py-2 text-sm"
              />
              <input
                value={scoreSearch}
                onChange={(e) => setScoreSearch(e.target.value)}
                placeholder="Search tournament..."
                className="rounded-lg border border-border bg-bg px-3 py-2 text-sm"
              />
              <input
                value={selectedScoreTournamentSlug}
                onChange={(e) => setSelectedScoreTournamentSlug(e.target.value)}
                placeholder="tournament-slug"
                className="rounded-lg border border-border bg-bg px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => void searchScoreTournaments()}
                disabled={scoreSearchLoading}
                className={[
                  "rounded-lg px-4 py-2 text-sm font-semibold",
                  scoreSearchLoading ? "bg-border text-muted" : "border border-border bg-bg text-text",
                ].join(" ")}
              >
                {scoreSearchLoading ? "Searching..." : "Search"}
              </button>
            </div>

            {scoreSearchError && <div className="mt-3 text-xs text-danger">{scoreSearchError}</div>}
            {scoreSyncMessage && <div className="mt-3 text-xs text-accent">{scoreSyncMessage}</div>}

            {scoreResults.length > 0 && (
              <div className="mt-4 rounded-xl border border-border/70 bg-bg/40 p-3">
                <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Search Results</div>
                <div className="space-y-2">
                  {scoreResults.map((tournament) => {
                    const selected = selectedScoreTournamentId === tournament.tournament_id;
                    return (
                      <label
                        key={tournament.tournament_id}
                        className={[
                          "flex cursor-pointer items-start justify-between gap-3 rounded-lg border px-3 py-3",
                          selected ? "border-accent bg-accent/10" : "border-border/70 bg-surface",
                        ].join(" ")}
                      >
                        <div className="flex gap-3">
                          <input
                            type="radio"
                            name="score-tournament"
                            checked={selected}
                            onChange={() => setSelectedScoreTournamentId(tournament.tournament_id)}
                            className="mt-1"
                          />
                          <div>
                            <div className="text-sm font-semibold">{tournament.name}</div>
                            <div className="mt-1 text-xs text-muted">
                              {tournament.start_date?.slice(0, 10) ?? "?"} to {tournament.end_date?.slice(0, 10) ?? "?"}
                            </div>
                            <div className="mt-1 text-xs text-muted">
                              {tournament.venue ?? "Unknown venue"}{tournament.status ? ` | ${tournament.status}` : ""}
                            </div>
                          </div>
                        </div>
                        <div className="text-xs text-muted">TournId {tournament.tournament_id}</div>
                      </label>
                    );
                  })}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void syncTournamentScores()}
                    disabled={!selectedScoreTournamentId || scoreSyncLoading}
                    className={[
                      "rounded-lg px-4 py-2 text-sm font-semibold sm:min-w-[140px]",
                      !selectedScoreTournamentId || scoreSyncLoading ? "bg-border text-muted" : "bg-accent text-black",
                    ].join(" ")}
                  >
                    {scoreSyncLoading ? "Syncing scores..." : "Sync Scores"}
                  </button>
                  <div className="text-xs text-muted">
                    Selected tournament id: {selectedScoreTournamentId ?? "none"}
                  </div>
                </div>
              </div>
            )}
          </section>
          )}

          {activeTab === "events" && <AdminEventFinalizer />}
        </>
      )}
    </main>
  );
}
