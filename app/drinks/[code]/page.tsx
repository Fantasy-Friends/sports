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
  bacSeries,
  caffeineMgRemaining,
  caffeineSeries,
  calcBAC,
  riskLevel,
  substanceFraction,
  waterOzRecent,
  type Entry,
  type EntryKind,
  type MemberProfile,
  type SeriesPoint,
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

  async function logEntry(
    kind: EntryKind,
    payload: Record<string, unknown>,
    occurredAt: Date,
  ) {
    setBusyKind(kind);
    try {
      const res = await fetch(`/api/drinks/sessions/${code}/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, payload, occurred_at: occurredAt.toISOString() }),
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

  async function updateEntryTime(entryId: string, occurredAt: Date) {
    try {
      const res = await fetch(`/api/drinks/sessions/${code}/entries`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: entryId, occurred_at: occurredAt.toISOString() }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error ?? "Failed to update entry");
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update entry");
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
          onUpdateEntryTime={updateEntryTime}
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
  onLog: (kind: EntryKind, payload: Record<string, unknown>, occurredAt: Date) => Promise<void>;
  onDeleteEntry: (entryId: string) => Promise<void>;
  onUpdateEntryTime: (entryId: string, occurredAt: Date) => Promise<void>;
  onLeave: () => Promise<void>;
  onEnd: () => Promise<void>;
  onJoinNow: () => Promise<void>;
  error: string | null;
  busyKind: EntryKind | null;
};

function SessionView({
  state, now, tab, onTab, onLog, onDeleteEntry, onUpdateEntryTime, onLeave, onEnd, onJoinNow, error, busyKind,
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
          onUpdateEntryTime={onUpdateEntryTime}
          busyKind={busyKind}
        />
      )}

      {tab === "timeline" && (
        <Timeline
          state={state}
          now={now}
          profileById={profileById}
          entriesByMember={entriesByMember}
        />
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
                    title={`${d.preset ?? d.type} · ${Math.round(d.fraction * 100)}% effective · ${d.hours_remaining.toFixed(1)}h until cutoff`}
                  >
                    {d.preset ?? d.type} · {Math.round(d.fraction * 100)}%
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

const QUICK_AGO_OPTIONS = [0, 15, 30, 60, 120] as const;

function toDateTimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function LogTab({
  isMember, isEnded, meMember, now, myEntries, onLog, onDeleteEntry, onUpdateEntryTime, busyKind,
}: {
  isMember: boolean;
  isEnded: boolean;
  meMember: MemberRow | null;
  now: Date;
  myEntries: Entry[];
  onLog: (kind: EntryKind, payload: Record<string, unknown>, occurredAt: Date) => Promise<void>;
  onDeleteEntry: (entryId: string) => Promise<void>;
  onUpdateEntryTime: (entryId: string, occurredAt: Date) => Promise<void>;
  busyKind: EntryKind | null;
}) {
  const [quickAgoMin, setQuickAgoMin] = useState<number>(0); // 0 = now
  const [useCustom, setUseCustom] = useState(false);
  const [customLocal, setCustomLocal] = useState<string>(() => toDateTimeLocal(new Date()));

  const computePickedDate = useCallback((): Date => {
    if (useCustom) {
      const d = new Date(customLocal);
      if (!Number.isNaN(d.getTime())) return d;
    }
    if (quickAgoMin > 0) return new Date(Date.now() - quickAgoMin * 60_000);
    return new Date();
  }, [useCustom, customLocal, quickAgoMin]);

  // `now` is intentional: re-derive the preview every 15s so "Now" / "X min ago" stays current.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const previewDate = useMemo(() => computePickedDate(), [computePickedDate, now]);

  const handlePick = useCallback(
    async (kind: EntryKind, payload: Record<string, unknown>) => {
      await onLog(kind, payload, computePickedDate());
      // Snap back to "now" so the next quick log isn't accidentally back-dated.
      setQuickAgoMin(0);
      setUseCustom(false);
      setCustomLocal(toDateTimeLocal(new Date()));
    },
    [onLog, computePickedDate],
  );

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
      {/* Time picker — sticky-feeling, applies to whatever you tap next */}
      <section className="soft-card rounded-[1.5rem] border border-border/40 bg-surface/40 p-5 lg:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-info">When did it happen?</h3>
            <p className="text-xs text-muted">
              Applies to the next preset you tap. Resets to <em>Now</em> after each entry.
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-muted">Will log at</p>
            <p className="text-sm font-semibold text-text">{previewDate.toLocaleString()}</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {QUICK_AGO_OPTIONS.map((m) => {
            const isActive = !useCustom && quickAgoMin === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => { setQuickAgoMin(m); setUseCustom(false); }}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
                  isActive
                    ? "bg-accent text-white shadow-sm"
                    : "border border-border/40 bg-surface/60 text-muted hover:text-text"
                }`}
              >
                {m === 0 ? "Now" : `${m} min ago`}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => {
              setUseCustom(true);
              // Seed with current preview when switching in
              if (!useCustom) setCustomLocal(toDateTimeLocal(previewDate));
            }}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
              useCustom
                ? "bg-accent text-white shadow-sm"
                : "border border-border/40 bg-surface/60 text-muted hover:text-text"
            }`}
          >
            Custom…
          </button>
          {useCustom && (
            <input
              type="datetime-local"
              value={customLocal}
              onChange={(e) => setCustomLocal(e.target.value)}
              className="rounded-xl border border-border/40 bg-surface/60 px-3 py-1.5 text-xs"
            />
          )}
        </div>
      </section>

      <section className="soft-card rounded-[1.5rem] border border-border/40 bg-surface/40 p-5">
        <h3 className="text-lg font-semibold text-info">Drink</h3>
        <p className="text-xs text-muted">Logs as alcohol for BAC math.</p>
        <PresetGrid
          presets={ALCOHOL_PRESETS.map((p) => ({
            label: p.name,
            payload: { preset: p.name, oz: p.oz, abv: p.abv, pct: 1 },
          }))}
          disabled={busyKind !== null}
          onPick={(payload) => handlePick("drink", payload)}
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
          onPick={(payload) => handlePick("water", payload)}
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
          onPick={(payload) => handlePick("caffeine", payload)}
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
              half_life_hours: p.half_life_hours,
              onset_minutes: p.onset_minutes,
            } as SubstancePayload,
          }))}
          disabled={busyKind !== null}
          onPick={(payload) => handlePick("substance", payload as Record<string, unknown>)}
        />
      </section>

      <section className="soft-card rounded-[1.5rem] border border-border/40 bg-surface/40 p-5 lg:col-span-2">
        <h3 className="text-lg font-semibold text-info">Your log</h3>
        {meMember && (
          <p className="text-xs text-muted">
            BAC math uses {meMember.weight_lbs} lb · {meMember.sex} (your profile when you joined).
            Tap a timestamp to back-date or correct it.
          </p>
        )}
        {myEntries.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Nothing yet. Tap a preset above.</p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {myEntries
              .slice()
              .reverse()
              .slice(0, 50)
              .map((e) => (
                <EntryRow
                  key={e.entry_id}
                  entry={e}
                  now={now}
                  onDelete={() => onDeleteEntry(e.entry_id)}
                  onUpdateTime={(d) => onUpdateEntryTime(e.entry_id, d)}
                />
              ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function EntryRow({
  entry, now, onDelete, onUpdateTime,
}: {
  entry: Entry;
  now: Date;
  onDelete: () => Promise<void>;
  onUpdateTime: (d: Date) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => toDateTimeLocal(new Date(entry.occurred_at)));
  const [saving, setSaving] = useState(false);

  async function save() {
    const d = new Date(draft);
    if (Number.isNaN(d.getTime())) return;
    setSaving(true);
    try {
      await onUpdateTime(d);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-border/30 bg-surface/40 px-3 py-2 text-sm">
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-text">
          <KindBadge kind={entry.kind} /> {entryLabel(entry)}
        </p>
        {editing ? (
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <input
              type="datetime-local"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="rounded-md border border-border/40 bg-surface/60 px-2 py-1 text-[11px]"
            />
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="rounded-md bg-accent px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setDraft(toDateTimeLocal(new Date(entry.occurred_at)));
              }}
              className="rounded-md border border-border/40 px-2 py-1 text-[11px] text-muted"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="mt-0.5 block text-left text-[11px] text-muted underline decoration-dotted hover:text-text"
            title="Click to edit the time"
          >
            {new Date(entry.occurred_at).toLocaleString()} · {agoLabel(entry.occurred_at, now)}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => void onDelete()}
        className="rounded-md border border-border/40 px-2 py-1 text-[11px] font-semibold text-muted hover:border-danger/50 hover:text-danger"
        aria-label="Delete entry"
      >
        ×
      </button>
    </li>
  );
}

function agoLabel(iso: string, now: Date): string {
  const mins = Math.round((now.getTime() - new Date(iso).getTime()) / 60000);
  if (mins < 0) return `in ${Math.abs(mins)}m`;
  if (mins < 60) return `${mins}m ago`;
  const hrs = mins / 60;
  if (hrs < 24) return `${hrs.toFixed(1)}h ago`;
  return `${(hrs / 24).toFixed(1)}d ago`;
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

// ─── Timeline tab — real-time decay viewer ──────────────────────────────────
//
// For each active member we draw two stacked decay curves: BAC and caffeine.
// X axis spans from the earliest entry (or 6 hours ago, whichever is later)
// out to 4 hours in the future. Vertical dotted line marks "now". Substance
// windows render as horizontal bars in their own row beneath the charts.

const TIMELINE_LOOKBACK_HOURS = 12;
const TIMELINE_LOOKAHEAD_HOURS = 4;

function Timeline({
  state, now, profileById, entriesByMember,
}: {
  state: SessionState;
  now: Date;
  profileById: Map<string, MemberProfile>;
  entriesByMember: Map<string, Entry[]>;
}) {
  if (state.entries.length === 0) {
    return (
      <div className="rounded-[1.5rem] border border-border/40 bg-surface/35 p-6 text-sm text-muted">
        No entries logged yet. The decay curves will appear here as people log.
      </div>
    );
  }

  const members = state.members.filter((m) => !m.left_at);

  return (
    <section className="grid gap-4">
      {members.map((m) => {
        const profile = profileById.get(m.entrant_id);
        if (!profile) return null;
        const entries = entriesByMember.get(m.entrant_id) ?? [];
        if (entries.length === 0) return null;
        const isMe = m.entrant_id === state.me;
        return (
          <MemberDecayCard
            key={m.entrant_id}
            label={m.display_name}
            isMe={isMe}
            profile={profile}
            entries={entries}
            now={now}
          />
        );
      })}
    </section>
  );
}

function MemberDecayCard({
  label, isMe, profile, entries, now,
}: {
  label: string;
  isMe: boolean;
  profile: MemberProfile;
  entries: Entry[];
  now: Date;
}) {
  const [showAudit, setShowAudit] = useState(false);

  const lookbackMs = TIMELINE_LOOKBACK_HOURS * 3600_000;
  const lookaheadMs = TIMELINE_LOOKAHEAD_HOURS * 3600_000;
  // Buffer 30 min before the earliest entry so the onset ramp (and the "0"
  // baseline before it) is visible on the chart.
  const PRE_BUFFER_MS = 30 * 60_000;
  const earliestEntryMs = entries.reduce<number | null>((acc, e) => {
    const t = new Date(e.occurred_at).getTime();
    if (!Number.isFinite(t)) return acc;
    return acc === null || t < acc ? t : acc;
  }, null);
  const fromMs = Math.min(
    now.getTime() - lookbackMs,
    earliestEntryMs !== null ? earliestEntryMs - PRE_BUFFER_MS : now.getTime() - lookbackMs,
  );
  const toMs = now.getTime() + lookaheadMs;

  const bacPoints = bacSeries(profile, entries, fromMs, toMs, 5);
  const cafPoints = caffeineSeries(entries, fromMs, toMs, 5);
  const drugs = activeSubstances(entries, now);

  const currentBac = calcBAC(profile, entries, now);
  const currentCaf = caffeineMgRemaining(entries, now);

  const drinks = entries
    .filter((e) => e.kind === "drink")
    .map((e) => new Date(e.occurred_at).getTime())
    .sort((a, b) => a - b);
  const cafMarkers = entries
    .filter((e) => e.kind === "caffeine")
    .map((e) => new Date(e.occurred_at).getTime());

  // For each drink, compute BAC just after the drink lands (1 ms past) so the
  // chart's dot markers show the post-drink value, and the audit table can
  // render the step in BAC each entry produced.
  const bacAtDrink = drinks.map((t) => ({
    t,
    bac: calcBAC(profile, entries, new Date(t + 1)),
  }));
  const cafAtMarker = cafMarkers.map((t) => ({
    t,
    mg: caffeineMgRemaining(entries, new Date(t + 1)),
  }));

  return (
    <div
      className={`rounded-[1.5rem] border p-5 ${
        isMe ? "border-accent/60 bg-surface/55" : "border-border/40 bg-surface/35"
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-muted">{isMe ? "You" : "Member"}</p>
          <h3 className="mt-1 text-lg font-semibold text-text">{label}</h3>
        </div>
        <div className="flex items-baseline gap-3 text-right text-xs">
          <div>
            <p className="text-[10px] uppercase tracking-wider" style={{ color: "#ef4444" }}>BAC</p>
            <p className="font-semibold" style={{ color: "#ef4444" }}>{currentBac.toFixed(3)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider" style={{ color: "#fb923c" }}>Caffeine</p>
            <p className="font-semibold" style={{ color: "#fb923c" }}>{Math.round(currentCaf)} mg</p>
          </div>
          <button
            type="button"
            onClick={() => setShowAudit((v) => !v)}
            className="rounded-full border border-border/40 px-2 py-1 text-[10px] uppercase tracking-wider text-muted hover:text-text"
          >
            {showAudit ? "Hide math" : "Audit math"}
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        <DecayChart
          label="BAC (Widmark + 0.015/hr metabolism)"
          color="#ef4444"
          unit=""
          decimals={3}
          fromMs={fromMs}
          toMs={toMs}
          nowMs={now.getTime()}
          points={bacPoints}
          dots={bacAtDrink.map((p) => ({ t: p.t, v: p.bac }))}
        />
        <DecayChart
          label="Caffeine (5h half-life)"
          color="#fb923c"
          unit=" mg"
          decimals={0}
          fromMs={fromMs}
          toMs={toMs}
          nowMs={now.getTime()}
          points={cafPoints}
          dots={cafAtMarker.map((p) => ({ t: p.t, v: p.mg }))}
        />
        <SubstanceWindow
          entries={entries.filter((e) => e.kind === "substance")}
          fromMs={fromMs}
          toMs={toMs}
          nowMs={now.getTime()}
        />
      </div>

      {drugs.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {drugs.map((d) => (
            <span
              key={d.entry_id}
              className="rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
              style={{ backgroundColor: `${SUBSTANCE_COLORS[d.type]}24`, color: SUBSTANCE_COLORS[d.type] }}
              title={`${d.hours_remaining.toFixed(1)}h until cutoff`}
            >
              {d.preset ?? d.type} · {Math.round(d.fraction * 100)}%
            </span>
          ))}
        </div>
      )}

      {showAudit && (
        <AuditTable profile={profile} entries={entries} now={now} />
      )}
    </div>
  );
}

function AuditTable({
  profile, entries, now,
}: {
  profile: MemberProfile;
  entries: Entry[];
  now: Date;
}) {
  const drinkEntries = entries
    .filter((e) => e.kind === "drink")
    .map((e) => ({
      e,
      t: new Date(e.occurred_at).getTime(),
      grams: (() => {
        const p = e.payload as { oz?: number; abv?: number; pct?: number };
        if (typeof p.oz !== "number" || typeof p.abv !== "number") return 0;
        return p.oz * 29.5735 * p.abv * (p.pct ?? 1) * 0.789;
      })(),
    }))
    .sort((a, b) => a.t - b.t);

  return (
    <div className="mt-4 rounded-xl border border-border/40 bg-surface/50 p-3">
      <p className="mb-2 text-[11px] uppercase tracking-wider text-muted">
        Drink-by-drink math for {profile.weight_lbs} lb · {profile.sex}
      </p>
      {drinkEntries.length === 0 ? (
        <p className="text-xs text-muted">No drink entries to audit.</p>
      ) : (
        <table className="w-full text-left text-[11px] font-mono">
          <thead className="text-muted">
            <tr>
              <th className="py-1 pr-2">Time</th>
              <th className="py-1 pr-2">+ grams</th>
              <th className="py-1 pr-2">BAC just before</th>
              <th className="py-1 pr-2">BAC just after</th>
            </tr>
          </thead>
          <tbody>
            {drinkEntries.map((d) => {
              const before = calcBAC(profile, entries, new Date(d.t - 1));
              const after = calcBAC(profile, entries, new Date(d.t + 1));
              return (
                <tr key={d.e.entry_id} className="border-t border-border/20">
                  <td className="py-1 pr-2">{new Date(d.t).toLocaleString()}</td>
                  <td className="py-1 pr-2">+{d.grams.toFixed(1)} g</td>
                  <td className="py-1 pr-2">{before.toFixed(3)}</td>
                  <td className="py-1 pr-2 font-semibold" style={{ color: "#ef4444" }}>
                    {after.toFixed(3)}
                  </td>
                </tr>
              );
            })}
            <tr className="border-t border-border/20 text-muted">
              <td className="py-1 pr-2">Now ({now.toLocaleTimeString()})</td>
              <td className="py-1 pr-2">—</td>
              <td className="py-1 pr-2">—</td>
              <td className="py-1 pr-2 font-semibold" style={{ color: "#ef4444" }}>
                {calcBAC(profile, entries, now).toFixed(3)}
              </td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

function DecayChart({
  label, color, unit, decimals, fromMs, toMs, nowMs, points, dots,
}: {
  label: string;
  color: string;
  unit: string;
  decimals: number;
  fromMs: number;
  toMs: number;
  nowMs: number;
  points: SeriesPoint[];
  dots: Array<{ t: number; v: number }>;
}) {
  const W = 600;
  const H = 110;
  const padL = 36;
  const padR = 8;
  const padT = 14;
  const padB = 22;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const span = Math.max(1, toMs - fromMs);
  const maxVal = Math.max(0.001, ...points.map((p) => p.value));

  function xOf(t: number) {
    return padL + ((t - fromMs) / span) * innerW;
  }
  function yOf(v: number) {
    return padT + innerH - (v / maxVal) * innerH;
  }

  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${xOf(p.t).toFixed(1)},${yOf(p.value).toFixed(1)}`)
    .join(" ");
  const areaPath = `${path} L${xOf(points[points.length - 1].t).toFixed(1)},${padT + innerH} L${xOf(points[0].t).toFixed(1)},${padT + innerH} Z`;

  const nowX = xOf(nowMs);

  // Hour ticks every 2 hours
  const tickHours: number[] = [];
  const startHour = Math.ceil(fromMs / 3600_000) * 3600_000;
  for (let t = startHour; t <= toMs; t += 2 * 3600_000) tickHours.push(t);

  return (
    <div>
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-semibold" style={{ color }}>{label}</span>
        <span className="text-muted">
          peak {maxVal.toFixed(decimals)}{unit}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 block h-auto w-full" role="img" aria-label={label}>
        {/* Grid baseline */}
        <line x1={padL} y1={padT + innerH} x2={W - padR} y2={padT + innerH} stroke="currentColor" opacity="0.15" />
        {/* Hour ticks */}
        {tickHours.map((t) => (
          <g key={t}>
            <line x1={xOf(t)} y1={padT} x2={xOf(t)} y2={padT + innerH} stroke="currentColor" opacity="0.05" />
            <text
              x={xOf(t)}
              y={H - 6}
              textAnchor="middle"
              fontSize="9"
              fill="currentColor"
              opacity="0.5"
            >
              {new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </text>
          </g>
        ))}
        {/* Y-axis labels */}
        <text x={padL - 4} y={padT + 4} textAnchor="end" fontSize="9" fill="currentColor" opacity="0.6">
          {maxVal.toFixed(decimals)}
        </text>
        <text x={padL - 4} y={padT + innerH} textAnchor="end" fontSize="9" fill="currentColor" opacity="0.6">
          0
        </text>
        {/* Curve area + line */}
        <path d={areaPath} fill={color} opacity="0.15" />
        <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
        {/* Entry markers — vertical riser at the entry time + filled dot at
            the post-entry value, so each addition is obvious on the curve. */}
        {dots.map((d, i) => {
          const dx = xOf(d.t);
          const dy = yOf(d.v);
          return (
            <g key={`${d.t}-${i}`}>
              <line
                x1={dx}
                y1={padT + innerH}
                x2={dx}
                y2={dy}
                stroke={color}
                strokeWidth="1"
                opacity="0.35"
                strokeDasharray="2 2"
              />
              <circle cx={dx} cy={dy} r={3} fill={color} stroke="#000" strokeWidth="1" />
            </g>
          );
        })}
        {/* "Now" line */}
        <line
          x1={nowX}
          y1={padT}
          x2={nowX}
          y2={padT + innerH}
          stroke="currentColor"
          strokeDasharray="3 3"
          opacity="0.5"
        />
        <text x={nowX + 3} y={padT + 10} fontSize="9" fill="currentColor" opacity="0.6">
          now
        </text>
      </svg>
    </div>
  );
}

function SubstanceWindow({
  entries, fromMs, toMs, nowMs,
}: {
  entries: Entry[];
  fromMs: number;
  toMs: number;
  nowMs: number;
}) {
  if (entries.length === 0) return null;

  const W = 600;
  const rowH = 14;
  const gap = 2;
  const padL = 36;
  const padR = 8;
  const padT = 14;
  const padB = 14;
  const innerW = W - padL - padR;
  const span = Math.max(1, toMs - fromMs);

  const rows = entries.map((e, i) => {
    const startMs = new Date(e.occurred_at).getTime();
    const p = (e.payload ?? {}) as Partial<SubstancePayload>;
    const dur = typeof p.duration_hours === "number" ? p.duration_hours : 0;
    const endMs = startMs + dur * 3600_000;
    const color = SUBSTANCE_COLORS[(p.type as SubstancePayload["type"]) ?? "other"];
    // Sample the fraction curve along the entry's lifetime so we can render
    // a filled shape whose height tracks how active the substance still is.
    const samples: Array<{ ms: number; fraction: number }> = [];
    if (dur > 0 && p.type) {
      const N = 24;
      for (let k = 0; k <= N; k += 1) {
        const ageHrs = (k / N) * dur;
        const ms = startMs + ageHrs * 3600_000;
        samples.push({ ms, fraction: substanceFraction(p as SubstancePayload, ageHrs) });
      }
    }
    const ageNow = (nowMs - startMs) / 3600_000;
    const fractionNow = dur > 0 && p.type ? substanceFraction(p as SubstancePayload, ageNow) : 0;
    return { e, p, i, startMs, endMs, color, samples, fractionNow };
  });

  const totalH = padT + rows.length * (rowH + gap) + padB;
  const nowX = padL + ((nowMs - fromMs) / span) * innerW;
  const xOf = (ms: number) => padL + ((ms - fromMs) / span) * innerW;

  return (
    <div>
      <p className="text-[11px] font-semibold text-muted">Substance windows (height = effect remaining)</p>
      <svg viewBox={`0 0 ${W} ${totalH}`} className="mt-1 block h-auto w-full" role="img" aria-label="Substance windows">
        <line x1={padL} y1={padT} x2={W - padR} y2={padT} stroke="currentColor" opacity="0.1" />
        {rows.map((r) => {
          const y = padT + r.i * (rowH + gap);
          const baseY = y + rowH;
          const visible = r.samples.filter((s) => s.ms >= fromMs && s.ms <= toMs);
          let shapePath = "";
          if (visible.length >= 2) {
            const top = visible
              .map((s, idx) => `${idx === 0 ? "M" : "L"}${xOf(s.ms).toFixed(1)},${(baseY - s.fraction * rowH).toFixed(1)}`)
              .join(" ");
            shapePath = `${top} L${xOf(visible[visible.length - 1].ms).toFixed(1)},${baseY} L${xOf(visible[0].ms).toFixed(1)},${baseY} Z`;
          }
          const labelX = Math.max(padL + 2, xOf(Math.max(r.startMs, fromMs)) + 4);
          const pctNow = Math.round(r.fractionNow * 100);
          const label = `${r.p.preset ?? r.p.type ?? "substance"}${pctNow > 0 ? ` · ${pctNow}%` : ""}`;
          return (
            <g key={r.e.entry_id}>
              {shapePath && (
                <path d={shapePath} fill={r.color} opacity={0.6} />
              )}
              <text
                x={labelX}
                y={y + rowH - 3}
                fontSize="9"
                fill="currentColor"
                opacity="0.85"
              >
                {label}
              </text>
            </g>
          );
        })}
        <line
          x1={nowX}
          y1={padT - 2}
          x2={nowX}
          y2={totalH - padB + 2}
          stroke="currentColor"
          strokeDasharray="3 3"
          opacity="0.5"
        />
      </svg>
    </div>
  );
}
