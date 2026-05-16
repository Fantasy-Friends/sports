"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import {
  ALCOHOL_PRESETS,
  CAFFEINE_PRESETS,
  HYDRATION_GOAL_OZ,
  SUBSTANCE_COLORS,
  SUBSTANCE_PRESETS,
  WATER_PRESETS,
  activeSubstances,
  caffeineMgRemaining,
  calcBAC,
  riskLevel,
  waterOzRecent,
  type Entry,
  type EntryKind,
  type MemberProfile,
  type Sex,
  type SubstancePayload,
} from "@/lib/drinks/math";

type SessionRow = {
  session_id: string;
  code: string;
  name: string;
  created_by: string;
  started_at: string;
  ended_at: string | null;
};

type MemberRow = {
  session_id: string;
  entrant_id: string;
  display_name: string;
  weight_lbs: number;
  sex: Sex;
  joined_at: string;
  left_at: string | null;
};

type SessionState = {
  session: SessionRow;
  members: MemberRow[];
  entries: Entry[];
  is_member: boolean;
  me: string;
};

const TABS = [
  { id: "stadium", label: "Stadium" },
  { id: "log", label: "Log" },
  { id: "timeline", label: "Timeline" },
] as const;

type Tab = (typeof TABS)[number]["id"];

export default function DrinkSessionPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = (params.code ?? "").toString().toUpperCase();

  const [state, setState] = useState<SessionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState<Date>(() => new Date());
  const [tab, setTab] = useState<Tab>("stadium");
  const [error, setError] = useState<string | null>(null);
  const [busyKind, setBusyKind] = useState<EntryKind | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/drinks/sessions/${code}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? "Failed to load session");
        return;
      }
      setState(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load session");
    } finally {
      setLoading(false);
    }
  }, [code]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Re-render every 15s to keep BAC/caffeine curves current; refetch every 20s
  // for new entries from other members.
  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 15_000);
    const poll = setInterval(() => void refresh(), 20_000);
    return () => { clearInterval(tick); clearInterval(poll); };
  }, [refresh]);

  async function logEntry(kind: EntryKind, payload: Record<string, unknown>) {
    setBusyKind(kind);
    try {
      const res = await fetch(`/api/drinks/sessions/${code}/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, payload, occurred_at: new Date().toISOString() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to log");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to log entry");
    } finally {
      setBusyKind(null);
    }
  }

  async function deleteEntry(entryId: string) {
    try {
      const res = await fetch(`/api/drinks/sessions/${code}/entries?id=${entryId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  async function leaveSession() {
    if (!confirm("Leave this session? You can rejoin with the code later.")) return;
    await fetch(`/api/drinks/sessions/${code}/leave`, { method: "POST" });
    router.push("/drinks");
  }

  async function endSession() {
    if (!confirm("End this session for everyone? Logs stay viewable.")) return;
    await fetch(`/api/drinks/sessions/${code}/end`, { method: "POST" });
    await refresh();
  }

  async function joinNow() {
    const res = await fetch("/api/drinks/sessions/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json?.error ?? "Could not join");
      return;
    }
    await refresh();
  }

  return (
    <AppShell
      title={state?.session?.name ?? "Drink session"}
      subtitle={`Code · ${code}${state?.session?.ended_at ? " · ended" : ""}`}
    >
      {loading ? (
        <div className="rounded-[1.5rem] border border-border/40 bg-surface/35 p-6 text-sm text-muted">
          Loading session&hellip;
        </div>
      ) : !state ? (
        <div className="rounded-[1.5rem] border border-danger/40 bg-danger/10 p-6 text-sm text-danger">
          {error ?? "Session not found"}
          <div className="mt-3">
            <Link href="/drinks" className="font-semibold underline">Back to hub</Link>
          </div>
        </div>
      ) : (
        <SessionView
          state={state}
          now={now}
          tab={tab}
          onTab={setTab}
          onLog={logEntry}
          onDeleteEntry={deleteEntry}
          onLeave={leaveSession}
          onEnd={endSession}
          onJoinNow={joinNow}
          error={error}
          busyKind={busyKind}
        />
      )}
    </AppShell>
  );
}

// ─── Inner view ──────────────────────────────────────────────────────────────

type ViewProps = {
  state: SessionState;
  now: Date;
  tab: Tab;
  onTab: (t: Tab) => void;
  onLog: (kind: EntryKind, payload: Record<string, unknown>) => Promise<void>;
  onDeleteEntry: (entryId: string) => Promise<void>;
  onLeave: () => Promise<void>;
  onEnd: () => Promise<void>;
  onJoinNow: () => Promise<void>;
  error: string | null;
  busyKind: EntryKind | null;
};

function SessionView({
  state, now, tab, onTab, onLog, onDeleteEntry, onLeave, onEnd, onJoinNow, error, busyKind,
}: ViewProps) {
  const meMember = useMemo(
    () => state.members.find((m) => m.entrant_id === state.me && !m.left_at) ?? null,
    [state.members, state.me],
  );

  const profileById = useMemo(() => {
    const map = new Map<string, MemberProfile>();
    for (const m of state.members) {
      map.set(m.entrant_id, {
        entrant_id: m.entrant_id,
        display_name: m.display_name,
        weight_lbs: m.weight_lbs,
        sex: m.sex,
      });
    }
    return map;
  }, [state.members]);

  const entriesByMember = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const e of state.entries) {
      const arr = map.get(e.entrant_id) ?? [];
      arr.push(e);
      map.set(e.entrant_id, arr);
    }
    return map;
  }, [state.entries]);

  const myEntries = entriesByMember.get(state.me) ?? [];
  const isCreator = state.session.created_by === state.me;
  const isEnded = !!state.session.ended_at;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[1.25rem] border border-border/40 bg-surface/35 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onTab(t.id)}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wider transition-all ${
                tab === t.id
                  ? "bg-accent text-white shadow-sm"
                  : "border border-border/40 bg-transparent text-muted hover:text-text"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {state.is_member ? (
            <button
              type="button"
              onClick={() => void onLeave()}
              className="rounded-full border border-border/40 px-3 py-1.5 text-xs font-semibold text-muted hover:text-text"
            >
              Leave
            </button>
          ) : (
            !isEnded && (
              <button
                type="button"
                onClick={() => void onJoinNow()}
                className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-white"
              >
                Join this session
              </button>
            )
          )}
          {isCreator && !isEnded && (
            <button
              type="button"
              onClick={() => void onEnd()}
              className="rounded-full border border-danger/50 px-3 py-1.5 text-xs font-semibold text-danger hover:bg-danger/10"
            >
              End session
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {tab === "stadium" && (
        <Stadium state={state} now={now} profileById={profileById} entriesByMember={entriesByMember} />
      )}

      {tab === "log" && (
        <LogTab
          isMember={state.is_member}
          isEnded={isEnded}
          meMember={meMember}
          now={now}
          myEntries={myEntries}
          onLog={onLog}
          onDeleteEntry={onDeleteEntry}
          busyKind={busyKind}
        />
      )}

      {tab === "timeline" && (
        <Timeline state={state} profileById={profileById} />
      )}
    </>
  );
}

// ─── Stadium tab — everyone's live state ────────────────────────────────────

function Stadium({
  state, now, profileById, entriesByMember,
}: {
  state: SessionState;
  now: Date;
  profileById: Map<string, MemberProfile>;
  entriesByMember: Map<string, Entry[]>;
}) {
  const activeMembers = state.members.filter((m) => !m.left_at);

  return (
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {activeMembers.length === 0 && (
        <div className="rounded-[1.5rem] border border-border/40 bg-surface/35 p-6 text-sm text-muted sm:col-span-2 lg:col-span-3">
          No active members yet.
        </div>
      )}
      {activeMembers.map((m) => {
        const profile = profileById.get(m.entrant_id);
        if (!profile) return null;
        const entries = entriesByMember.get(m.entrant_id) ?? [];
        const bac = calcBAC(profile, entries, now);
        const caffeine = caffeineMgRemaining(entries, now);
        const water = waterOzRecent(entries, now);
        const drugs = activeSubstances(entries, now);
        const risk = riskLevel(bac, drugs);
        const drinkCount = entries.filter((e) => e.kind === "drink").length;
        const isMe = m.entrant_id === state.me;

        return (
          <div
            key={m.entrant_id}
            className={`relative overflow-hidden rounded-[1.5rem] border p-5 ${
              isMe ? "border-accent/60 bg-surface/55" : "border-border/40 bg-surface/35"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.3em] text-muted">
                  {isMe ? "You" : "Member"}
                </p>
                <h3 className="mt-1 text-lg font-semibold text-text">{m.display_name}</h3>
                <p className="text-xs text-muted">
                  {m.weight_lbs} lb · {m.sex}
                </p>
              </div>
              <span
                className="rounded-lg px-3 py-1.5 text-xs font-bold"
                style={{ backgroundColor: `${risk.color}1f`, color: risk.color }}
                title={`Risk score ${risk.score.toFixed(1)}`}
              >
                {risk.label}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <Metric label="BAC" value={bac.toFixed(3)} sub={`${drinkCount} dr`} />
              <Metric label="Caf mg" value={Math.round(caffeine).toString()} />
              <Metric
                label="Water"
                value={`${Math.round(water)}/${HYDRATION_GOAL_OZ}`}
                sub="oz · 18h"
              />
            </div>

            {drugs.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                {drugs.map((d) => (
                  <span
                    key={d.entry_id}
                    className="rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                    style={{ backgroundColor: `${SUBSTANCE_COLORS[d.type]}24`, color: SUBSTANCE_COLORS[d.type] }}
                    title={`${d.preset ?? d.type} · ${d.hours_remaining.toFixed(1)}h left`}
                  >
                    {d.preset ?? d.type}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border/40 bg-surface/55 px-2 py-2">
      <p className="text-[10px] uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-0.5 text-base font-semibold text-text">{value}</p>
      {sub && <p className="text-[10px] text-muted">{sub}</p>}
    </div>
  );
}

// ─── Log tab — quick-add buttons + my recent entries ────────────────────────

function LogTab({
  isMember, isEnded, meMember, now, myEntries, onLog, onDeleteEntry, busyKind,
}: {
  isMember: boolean;
  isEnded: boolean;
  meMember: MemberRow | null;
  now: Date;
  myEntries: Entry[];
  onLog: (kind: EntryKind, payload: Record<string, unknown>) => Promise<void>;
  onDeleteEntry: (entryId: string) => Promise<void>;
  busyKind: EntryKind | null;
}) {
  if (isEnded) {
    return (
      <div className="rounded-[1.5rem] border border-border/40 bg-surface/35 p-6 text-sm text-muted">
        This session has ended. No new entries.
      </div>
    );
  }
  if (!isMember) {
    return (
      <div className="rounded-[1.5rem] border border-border/40 bg-surface/35 p-6 text-sm text-muted">
        Join the session above to log entries.
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="soft-card rounded-[1.5rem] border border-border/40 bg-surface/40 p-5">
        <h3 className="text-lg font-semibold text-info">Drink</h3>
        <p className="text-xs text-muted">Logs as alcohol for BAC math.</p>
        <PresetGrid
          presets={ALCOHOL_PRESETS.map((p) => ({
            label: p.name,
            payload: { preset: p.name, oz: p.oz, abv: p.abv, pct: 1 },
          }))}
          disabled={busyKind !== null}
          onPick={(payload) => onLog("drink", payload)}
        />
      </section>

      <section className="soft-card rounded-[1.5rem] border border-border/40 bg-surface/40 p-5">
        <h3 className="text-lg font-semibold text-info">Water</h3>
        <p className="text-xs text-muted">Counts toward 18-hour hydration.</p>
        <PresetGrid
          presets={WATER_PRESETS.map((p) => ({
            label: p.name,
            payload: { preset: p.name, oz: p.oz },
          }))}
          disabled={busyKind !== null}
          onPick={(payload) => onLog("water", payload)}
        />
      </section>

      <section className="soft-card rounded-[1.5rem] border border-border/40 bg-surface/40 p-5">
        <h3 className="text-lg font-semibold text-info">Caffeine</h3>
        <p className="text-xs text-muted">5-hour half-life curve.</p>
        <PresetGrid
          presets={CAFFEINE_PRESETS.map((p) => ({
            label: p.name,
            payload: { preset: p.name, mg: p.mg, oz: p.oz },
          }))}
          disabled={busyKind !== null}
          onPick={(payload) => onLog("caffeine", payload)}
        />
      </section>

      <section className="soft-card rounded-[1.5rem] border border-border/40 bg-surface/40 p-5">
        <h3 className="text-lg font-semibold text-info">Substance</h3>
        <p className="text-xs text-muted">Severity & duration drive risk.</p>
        <PresetGrid
          presets={SUBSTANCE_PRESETS.map((p) => ({
            label: p.name,
            payload: {
              preset: p.name,
              type: p.type,
              severity: p.severity,
              duration_hours: p.duration_hours,
            } as SubstancePayload,
          }))}
          disabled={busyKind !== null}
          onPick={(payload) => onLog("substance", payload as Record<string, unknown>)}
        />
      </section>

      <section className="soft-card rounded-[1.5rem] border border-border/40 bg-surface/40 p-5 lg:col-span-2">
        <h3 className="text-lg font-semibold text-info">Your recent log</h3>
        {meMember && (
          <p className="text-xs text-muted">
            BAC math uses {meMember.weight_lbs} lb · {meMember.sex} (your profile when you joined).
          </p>
        )}
        {myEntries.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Nothing yet. Tap a preset above.</p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {myEntries
              .slice()
              .reverse()
              .slice(0, 30)
              .map((e) => (
                <li
                  key={e.entry_id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/30 bg-surface/40 px-3 py-2 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-text">
                      <KindBadge kind={e.kind} /> {entryLabel(e)}
                    </p>
                    <p className="text-[11px] text-muted">
                      {new Date(e.occurred_at).toLocaleTimeString()} · {minutesAgo(e.occurred_at, now)}m ago
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void onDeleteEntry(e.entry_id)}
                    className="rounded-md border border-border/40 px-2 py-1 text-[11px] font-semibold text-muted hover:border-danger/50 hover:text-danger"
                    aria-label="Delete entry"
                  >
                    ×
                  </button>
                </li>
              ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function PresetGrid({
  presets, disabled, onPick,
}: {
  presets: Array<{ label: string; payload: Record<string, unknown> }>;
  disabled: boolean;
  onPick: (payload: Record<string, unknown>) => Promise<void>;
}) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
      {presets.map((p) => (
        <button
          key={p.label}
          type="button"
          disabled={disabled}
          onClick={() => void onPick(p.payload)}
          className="rounded-lg border border-border/40 bg-surface/60 px-3 py-2 text-left text-xs font-semibold text-text transition-all hover:border-accent/60 hover:bg-surface/80 disabled:opacity-50"
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

function KindBadge({ kind }: { kind: EntryKind }) {
  const color =
    kind === "drink" ? "#ef4444" :
    kind === "caffeine" ? "#fb923c" :
    kind === "water" ? "#22d3ee" :
    "#a855f7";
  return (
    <span
      className="mr-1 inline-block rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
      style={{ backgroundColor: `${color}24`, color }}
    >
      {kind}
    </span>
  );
}

function entryLabel(e: Entry): string {
  const p = (e.payload ?? {}) as Record<string, unknown>;
  const preset = typeof p.preset === "string" ? p.preset : null;
  if (preset) return preset;
  if (e.kind === "drink") return `${p.oz ?? "?"}oz @ ${Math.round(Number(p.abv ?? 0) * 100)}%`;
  if (e.kind === "caffeine") return `${p.mg ?? "?"}mg`;
  if (e.kind === "water") return `${p.oz ?? "?"}oz`;
  if (e.kind === "substance") return `${p.type ?? "substance"} (sev ${p.severity ?? "?"})`;
  return e.kind;
}

function minutesAgo(iso: string, now: Date): number {
  return Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60000));
}

// ─── Timeline tab ────────────────────────────────────────────────────────────

function Timeline({
  state, profileById,
}: {
  state: SessionState;
  profileById: Map<string, MemberProfile>;
}) {
  const sorted = useMemo(
    () => state.entries.slice().sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)),
    [state.entries],
  );

  if (sorted.length === 0) {
    return (
      <div className="rounded-[1.5rem] border border-border/40 bg-surface/35 p-6 text-sm text-muted">
        No entries logged yet.
      </div>
    );
  }

  return (
    <section className="soft-card rounded-[1.5rem] border border-border/40 bg-surface/35 p-5">
      <ul className="grid gap-2">
        {sorted.map((e) => {
          const m = profileById.get(e.entrant_id);
          return (
            <li
              key={e.entry_id}
              className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg border border-border/30 bg-surface/50 px-3 py-2 text-sm"
            >
              <KindBadge kind={e.kind} />
              <div className="min-w-0">
                <p className="truncate font-semibold text-text">{entryLabel(e)}</p>
                <p className="text-[11px] text-muted">{m?.display_name ?? "—"}</p>
              </div>
              <p className="whitespace-nowrap text-[11px] text-muted">
                {new Date(e.occurred_at).toLocaleString()}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
