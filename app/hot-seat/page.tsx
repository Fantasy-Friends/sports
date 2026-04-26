"use client";

import { useEffect, useMemo, useState } from "react";
import { getErrorMessage } from "@/lib/error";
import { useRequireEntrant } from "@/lib/useRequireEntrant";

type HotSeatRow = {
  hot_seat_id: string;
  season_id: string;
  week_start: string;
  entrant_id: string;
  declaration_text: string | null;
  bet_details: string | null;
  odds_american: number | null;
  declared_at: string | null;
  veto_deadline: string | null;
  status: string;
  resolved_at: string | null;
};

type Vote = { voter_entrant_id: string; vote: "veto" | "approve" };
type Member = { entrant_id: string; display_name: string };

type SessionResponse = {
  entrant?: {
    entrant_id: string;
    is_admin: boolean;
  } | null;
};

const STATUS_LABEL: Record<string, string> = {
  awaiting: "Awaiting declaration",
  pending: "Voting window open",
  approved: "Approved — waiting on result",
  vetoed: "Vetoed",
  hit: "Hit +10",
  miss: "Missed",
};

export default function HotSeatPage() {
  const [data, setData] = useState<{
    scheduled: Member | null;
    current: HotSeatRow | null;
    archive: HotSeatRow[];
    votes: Vote[];
    members: Member[];
    week_start: string;
  } | null>(null);
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [declaration, setDeclaration] = useState("");
  const [bet, setBet] = useState("");
  const [odds, setOdds] = useState<string>("400");
  const [busy, setBusy] = useState(false);

  useRequireEntrant({
    ready: !loading,
    entrant: session?.entrant ?? null,
  });

  async function load() {
    setLoading(true);
    try {
      const [hsRes, meRes] = await Promise.all([
        fetch("/api/hot-seat", { cache: "no-store" }),
        fetch("/api/auth/me", { cache: "no-store" }),
      ]);
      if (!hsRes.ok) throw new Error(`Failed (${hsRes.status})`);
      setData(await hsRes.json());
      if (meRes.ok) setSession(await meRes.json());
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const isMyWeek = useMemo(() => {
    if (!data?.scheduled || !session?.entrant) return false;
    // Best-effort: scheduled.entrant_id is the canonical season entrant;
    // /api/auth/me may return a pool-scoped entrant_id. We still show the UI
    // and let the server enforce; if you're not the canonical entrant, the
    // POST will 403.
    return true;
  }, [data, session]);

  const canVote = useMemo(() => {
    if (!data?.current || !session?.entrant) return false;
    if (data.current.status !== "pending") return false;
    return true;
  }, [data, session]);

  async function declare() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/hot-seat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          declaration_text: declaration,
          bet_details: bet,
          odds_american: Number(odds),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Failed (${res.status})`);
      }
      setDeclaration("");
      setBet("");
      setOdds("400");
      await load();
    } catch (err) {
      setError(getErrorMessage(err, "Declare failed"));
    } finally {
      setBusy(false);
    }
  }

  async function vote(choice: "veto" | "approve") {
    if (!data?.current) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/hot-seat/${data.current.hot_seat_id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vote: choice }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Failed (${res.status})`);
      }
      await load();
    } catch (err) {
      setError(getErrorMessage(err, "Vote failed"));
    } finally {
      setBusy(false);
    }
  }

  async function resolve(outcome: "hit" | "miss") {
    if (!data?.current) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/hot-seat/${data.current.hot_seat_id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Failed (${res.status})`);
      }
      await load();
    } catch (err) {
      setError(getErrorMessage(err, "Resolve failed"));
    } finally {
      setBusy(false);
    }
  }

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const row of data?.members ?? []) m.set(row.entrant_id, row.display_name);
    return m;
  }, [data?.members]);

  return (
    <main className="mx-auto max-w-3xl">
      <div className="mb-4">
        <div className="text-[11px] uppercase tracking-[0.28em] text-muted">
          Weekly +10 Longshot
        </div>
        <h1 className="text-2xl font-semibold text-info">Hot Seat</h1>
        <p className="mt-1 text-sm text-muted">
          One declaration per week. Must be +400 or longer. Other five vote to veto within 24h; 3
          vetoes kill it. If it hits, +10 bonus points added directly to the yearly total.
        </p>
      </div>

      {error ? (
        <div className="mb-3 rounded-md border border-danger/40 bg-danger/10 p-2 text-xs text-danger">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-[1.5rem] border border-border/20 bg-surface/35 p-5 text-sm text-muted">
          Loading…
        </div>
      ) : !data ? null : (
        <>
          <section className="soft-card mb-4 rounded-[1.5rem] border border-border/20 bg-surface/35 p-4 sm:p-5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-[11px] uppercase tracking-[0.28em] text-muted">
                Week of {data.week_start}
              </div>
              <span className="rounded-md bg-surface/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                {data.current ? STATUS_LABEL[data.current.status] ?? data.current.status : STATUS_LABEL.awaiting}
              </span>
            </div>
            <div className="text-sm text-text">
              On the Hot Seat:{" "}
              <strong>
                {data.current
                  ? nameById.get(data.current.entrant_id) ?? "—"
                  : data.scheduled?.display_name ?? "—"}
              </strong>
            </div>

            {data.current && data.current.declaration_text ? (
              <div className="mt-3 space-y-1 rounded-lg bg-surface/60 p-3 text-sm">
                <div className="font-semibold text-text">{data.current.declaration_text}</div>
                <div className="text-xs text-muted">
                  {data.current.bet_details} · {data.current.odds_american && data.current.odds_american > 0 ? `+${data.current.odds_american}` : data.current.odds_american}
                </div>
                {data.current.veto_deadline ? (
                  <div className="text-[11px] text-muted">
                    Veto window closes {new Date(data.current.veto_deadline).toLocaleString()}
                  </div>
                ) : null}
              </div>
            ) : null}

            {!data.current && isMyWeek ? (
              <form
                className="mt-3 space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void declare();
                }}
              >
                <label className="block text-xs text-muted">
                  <span className="mb-1 block uppercase tracking-[0.18em]">Declaration</span>
                  <input
                    value={declaration}
                    onChange={(e) => setDeclaration(e.target.value)}
                    placeholder="e.g. Scottie Scheffler wins Wells Fargo outright"
                    className="glass-input w-full rounded-xl px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-xs text-muted">
                  <span className="mb-1 block uppercase tracking-[0.18em]">Bet details</span>
                  <textarea
                    value={bet}
                    onChange={(e) => setBet(e.target.value)}
                    placeholder="Market, line, book (optional)"
                    className="glass-input w-full rounded-xl px-3 py-2 text-sm"
                    rows={2}
                  />
                </label>
                <label className="block text-xs text-muted">
                  <span className="mb-1 block uppercase tracking-[0.18em]">
                    American odds (+400 or longer)
                  </span>
                  <input
                    value={odds}
                    onChange={(e) => setOdds(e.target.value)}
                    placeholder="+400"
                    type="number"
                    inputMode="numeric"
                    className="glass-input w-full rounded-xl px-3 py-2 text-sm sm:max-w-[10rem]"
                  />
                </label>
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 sm:w-auto"
                >
                  {busy ? "Declaring…" : "Declare take"}
                </button>
              </form>
            ) : null}

            {canVote ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted">Vote:</span>
                <button
                  type="button"
                  onClick={() => void vote("approve")}
                  disabled={busy}
                  className="rounded-xl border border-info/40 bg-info/10 px-3 py-1.5 text-xs font-semibold text-info disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => void vote("veto")}
                  disabled={busy}
                  className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-1.5 text-xs font-semibold text-danger disabled:opacity-50"
                >
                  Veto
                </button>
                <span className="text-[11px] text-muted">
                  ({data.votes.filter((v) => v.vote === "veto").length} / 3 veto threshold)
                </span>
              </div>
            ) : null}

            {session?.entrant?.is_admin && data.current && (data.current.status === "approved" || data.current.status === "pending") ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/20 pt-3">
                <span className="text-[11px] uppercase tracking-[0.18em] text-muted">Admin resolve</span>
                <button
                  type="button"
                  onClick={() => void resolve("hit")}
                  disabled={busy}
                  className="rounded-xl border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent disabled:opacity-50"
                >
                  Mark hit (+10)
                </button>
                <button
                  type="button"
                  onClick={() => void resolve("miss")}
                  disabled={busy}
                  className="rounded-xl border border-border/40 bg-surface/35 px-3 py-1.5 text-xs font-semibold text-text disabled:opacity-50"
                >
                  Mark miss
                </button>
              </div>
            ) : null}
          </section>

          {data.archive.length > 0 ? (
            <section className="soft-card rounded-[1.5rem] border border-border/20 bg-surface/35 p-4 sm:p-5">
              <div className="mb-3 text-[11px] uppercase tracking-[0.28em] text-muted">
                Recent weeks
              </div>
              <ul className="space-y-2 text-sm">
                {data.archive.map((row) => (
                  <li
                    key={row.hot_seat_id}
                    className="flex flex-col gap-2 rounded-lg bg-surface/60 p-3 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-text">
                        {nameById.get(row.entrant_id) ?? row.entrant_id.slice(0, 6)} &middot; week of {row.week_start}
                      </div>
                      <div className="text-xs text-muted">
                        {row.declaration_text ?? "no declaration"}
                      </div>
                    </div>
                    <span className="inline-flex shrink-0 self-start rounded-md bg-surface/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted md:self-auto">
                      {STATUS_LABEL[row.status] ?? row.status}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </main>
  );
}
