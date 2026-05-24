"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import type { Sex } from "@/lib/drinks/math";

type ProfileRow = {
  entrant_id: string;
  weight_lbs: number;
  sex: Sex;
  age_years: number | null;
  display_name: string | null;
};

type SessionRow = {
  session_id: string;
  code: string;
  name: string;
  created_by: string;
  started_at: string;
  ended_at: string | null;
};

export default function DrinkTrackerHubPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [entrantName, setEntrantName] = useState<string>("");
  const [sessions, setSessions] = useState<SessionRow[]>([]);

  // Profile form
  const [weight, setWeight] = useState<string>("");
  const [sex, setSex] = useState<Sex>("male");
  const [age, setAge] = useState<string>("");
  const [savingProfile, setSavingProfile] = useState(false);

  // Create / join
  const [newName, setNewName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [profileRes, sessionsRes] = await Promise.all([
          fetch("/api/drinks/profile", { cache: "no-store" }),
          fetch("/api/drinks/sessions", { cache: "no-store" }),
        ]);
        const profileJson = await profileRes.json();
        const sessionsJson = await sessionsRes.json();
        if (cancelled) return;
        if (profileJson?.profile) {
          setProfile(profileJson.profile);
          setWeight(String(profileJson.profile.weight_lbs));
          setSex(profileJson.profile.sex);
          if (profileJson.profile.age_years) setAge(String(profileJson.profile.age_years));
        }
        if (profileJson?.entrant_name) setEntrantName(profileJson.entrant_name);
        setSessions(sessionsJson?.sessions ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  async function saveProfile() {
    setError(null);
    const w = Number(weight);
    if (!Number.isFinite(w) || w <= 0) {
      setError("Enter your weight in pounds.");
      return;
    }
    setSavingProfile(true);
    try {
      const ageNum = age.trim() ? Number(age) : null;
      const res = await fetch("/api/drinks/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weight_lbs: w,
          sex,
          age_years: ageNum,
          display_name: entrantName,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to save");
      setProfile(json.profile);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save profile");
    } finally {
      setSavingProfile(false);
    }
  }

  async function createSession() {
    setError(null);
    if (!profile) {
      setError("Save your weight & sex first.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/drinks/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to create");
      router.push(`/drinks/${json.session.code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create session");
      setBusy(false);
    }
  }

  async function joinSession() {
    setError(null);
    if (!profile) {
      setError("Save your weight & sex first.");
      return;
    }
    const code = joinCode.trim().toUpperCase();
    if (!code) {
      setError("Enter a session code.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/drinks/sessions/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to join");
      router.push(`/drinks/${json.session.code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to join session");
      setBusy(false);
    }
  }

  return (
    <AppShell
      title="Drink Tracker"
      subtitle="Start a session, share the code, see everyone's live BAC"
    >
      {loading ? (
        <div className="rounded-[1.5rem] border border-border/40 bg-surface/35 p-6 text-sm text-muted">
          Loading&hellip;
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Profile */}
          <section className="soft-card rounded-[1.5rem] border border-border/40 bg-surface/40 p-6 lg:col-span-1">
            <p className="text-[11px] uppercase tracking-[0.3em] text-muted">Step 1</p>
            <h2 className="mt-1 text-xl font-semibold text-info">Your profile</h2>
            <p className="mt-2 text-xs text-muted">
              Needed for BAC math. Stays on your account.
            </p>

            <label className="mt-4 block text-xs uppercase tracking-wider text-muted">Weight (lbs)</label>
            <input
              type="number"
              inputMode="decimal"
              min={50}
              max={500}
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border/40 bg-surface/60 px-3 py-2 text-sm"
              placeholder="e.g. 180"
            />

            <label className="mt-3 block text-xs uppercase tracking-wider text-muted">Sex (for BAC formula)</label>
            <select
              value={sex}
              onChange={(e) => setSex(e.target.value as Sex)}
              className="mt-1 w-full rounded-xl border border-border/40 bg-surface/60 px-3 py-2 text-sm"
            >
              <option value="male">Male (Widmark 0.68)</option>
              <option value="female">Female (Widmark 0.55)</option>
              <option value="other">Other (Widmark 0.61)</option>
            </select>

            <label className="mt-3 block text-xs uppercase tracking-wider text-muted">
              Age (optional, used by hangover forecast)
            </label>
            <input
              type="number"
              inputMode="numeric"
              min={18}
              max={100}
              value={age}
              onChange={(e) => setAge(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border/40 bg-surface/60 px-3 py-2 text-sm"
              placeholder="e.g. 32"
            />

            <button
              type="button"
              onClick={saveProfile}
              disabled={savingProfile}
              className="mt-4 w-full rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:opacity-90 disabled:opacity-50"
            >
              {savingProfile ? "Saving…" : profile ? "Update profile" : "Save profile"}
            </button>

            {profile && (
              <p className="mt-3 text-xs text-muted">
                Saved: {profile.weight_lbs} lb · {profile.sex}
              </p>
            )}
          </section>

          {/* Create */}
          <section className="soft-card rounded-[1.5rem] border border-border/40 bg-surface/40 p-6 lg:col-span-1">
            <p className="text-[11px] uppercase tracking-[0.3em] text-muted">Step 2</p>
            <h2 className="mt-1 text-xl font-semibold text-info">Start a session</h2>
            <p className="mt-2 text-xs text-muted">
              Friends join with the code. Live BAC for everyone.
            </p>
            <label className="mt-4 block text-xs uppercase tracking-wider text-muted">Session name</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={80}
              className="mt-1 w-full rounded-xl border border-border/40 bg-surface/60 px-3 py-2 text-sm"
              placeholder={`${entrantName || "Your"}'s session`}
            />
            <button
              type="button"
              onClick={createSession}
              disabled={busy || !profile}
              className="mt-4 w-full rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Working…" : "Create"}
            </button>
          </section>

          {/* Join */}
          <section className="soft-card rounded-[1.5rem] border border-border/40 bg-surface/40 p-6 lg:col-span-1">
            <p className="text-[11px] uppercase tracking-[0.3em] text-muted">Or</p>
            <h2 className="mt-1 text-xl font-semibold text-info">Join with a code</h2>
            <p className="mt-2 text-xs text-muted">Enter the 6-character code from your host.</p>
            <label className="mt-4 block text-xs uppercase tracking-wider text-muted">Session code</label>
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              maxLength={8}
              className="mt-1 w-full rounded-xl border border-border/40 bg-surface/60 px-3 py-2 text-base font-mono tracking-[0.3em] uppercase"
              placeholder="ABC123"
            />
            <button
              type="button"
              onClick={joinSession}
              disabled={busy || !profile}
              className="mt-4 w-full rounded-xl border border-accent/60 bg-transparent px-4 py-2 text-sm font-semibold text-accent transition-all hover:bg-accent/10 disabled:opacity-50"
            >
              {busy ? "Working…" : "Join"}
            </button>
          </section>

          {error && (
            <div className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger lg:col-span-3">
              {error}
            </div>
          )}

          {/* Active sessions */}
          <section className="soft-card rounded-[1.5rem] border border-border/40 bg-surface/40 p-6 lg:col-span-3">
            <h2 className="text-lg font-semibold text-info">Active sessions you&rsquo;re in</h2>
            {sessions.length === 0 ? (
              <p className="mt-3 text-sm text-muted">No active sessions yet. Create or join one above.</p>
            ) : (
              <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {sessions.map((s) => (
                  <li key={s.session_id}>
                    <Link
                      href={`/drinks/${s.code}`}
                      className="block rounded-xl border border-border/40 bg-surface/60 p-4 transition-all hover:border-accent/60 hover:bg-surface/80"
                    >
                      <p className="text-[11px] uppercase tracking-[0.3em] text-muted">Code · {s.code}</p>
                      <p className="mt-1 text-base font-semibold text-text">{s.name}</p>
                      <p className="mt-1 text-xs text-muted">
                        Started {new Date(s.started_at).toLocaleString()}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Solo */}
          <section className="rounded-[1.5rem] border border-border/40 bg-surface/30 p-5 text-sm text-muted lg:col-span-3">
            Looking for the personal single-player tracker?{" "}
            <Link href="/drinks/solo" className="font-semibold text-accent underline">
              Open solo mode
            </Link>
            .
          </section>
        </div>
      )}
    </AppShell>
  );
}
