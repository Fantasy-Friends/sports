import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthenticatedEntrant } from "@/lib/draftAuth";
import { getErrorMessage } from "@/lib/error";
import {
  peakBacOf,
  totalEthanolGrams,
  fishTally,
  type Entry,
  type LeaderboardRow,
  type MemberProfile,
  type Sex,
} from "@/lib/drinks/math";

export const revalidate = 0;

type MemberRow = {
  session_id: string;
  entrant_id: string;
  display_name: string;
  weight_lbs: number;
  sex: Sex;
  joined_at: string;
};

type EntryRow = {
  entry_id: string;
  session_id: string;
  entrant_id: string | null;
  guest_id: string | null;
  kind: Entry["kind"];
  payload: Record<string, unknown>;
  occurred_at: string;
};

// All-time leaderboard across every session, members only (guests are
// session-scoped and have no cross-session identity). Peak BAC is the max of
// each session's peak — never merges multi-day sessions into one BAC curve.
// Caffeine / water are lifetime totals consumed (not point-in-time).
export async function GET() {
  try {
    const auth = await getAuthenticatedEntrant();
    if (!auth) return NextResponse.json({ error: "auth required" }, { status: 401 });

    const [{ data: members }, { data: entries }] = await Promise.all([
      supabaseAdmin
        .from("drink_session_members")
        .select("session_id, entrant_id, display_name, weight_lbs, sex, joined_at"),
      supabaseAdmin
        .from("drink_session_entries")
        .select("entry_id, session_id, entrant_id, guest_id, kind, payload, occurred_at")
        .not("entrant_id", "is", null),
    ]);

    const memberRows = (members ?? []) as MemberRow[];
    const entryRows = (entries ?? []) as EntryRow[];

    // Per-session profile snapshot: (session_id, entrant_id) → profile.
    const snapshot = new Map<string, MemberProfile>();
    // Per-entrant latest display name (by joined_at).
    const latestName = new Map<string, { name: string; at: string }>();
    for (const m of memberRows) {
      snapshot.set(`${m.session_id}:${m.entrant_id}`, {
        entrant_id: m.entrant_id,
        display_name: m.display_name,
        weight_lbs: m.weight_lbs,
        sex: m.sex,
      });
      const cur = latestName.get(m.entrant_id);
      if (!cur || m.joined_at > cur.at) latestName.set(m.entrant_id, { name: m.display_name, at: m.joined_at });
    }

    // Bucket entries by (session, entrant).
    const bySessionEntrant = new Map<string, Entry[]>();
    for (const e of entryRows) {
      if (!e.entrant_id) continue;
      const key = `${e.session_id}:${e.entrant_id}`;
      const arr = bySessionEntrant.get(key) ?? [];
      arr.push({
        entry_id: e.entry_id,
        entrant_id: e.entrant_id,
        guest_id: e.guest_id,
        kind: e.kind,
        payload: e.payload ?? {},
        occurred_at: e.occurred_at,
      });
      bySessionEntrant.set(key, arr);
    }

    const now = new Date();
    const rollup = new Map<string, LeaderboardRow>();

    for (const [key, sessionEntries] of bySessionEntrant) {
      const [sessionId, entrantId] = key.split(":");
      const profile = snapshot.get(`${sessionId}:${entrantId}`);
      if (!profile) continue;

      const peak = peakBacOf(profile, sessionEntries, now);
      const drinks = sessionEntries.filter((e) => e.kind === "drink").length;
      const stdDrinks = totalEthanolGrams(sessionEntries) / 14;
      const fish = fishTally(sessionEntries).total;
      let caffeineMg = 0;
      let waterOz = 0;
      for (const e of sessionEntries) {
        if (e.kind === "caffeine" && typeof e.payload.mg === "number") caffeineMg += e.payload.mg;
        if (e.kind === "water" && typeof e.payload.oz === "number") waterOz += e.payload.oz;
      }

      const existing = rollup.get(entrantId);
      const name = latestName.get(entrantId)?.name ?? profile.display_name;
      if (!existing) {
        rollup.set(entrantId, {
          id: entrantId,
          name,
          kind: "member",
          current_bac: 0,
          peak_bac: peak,
          drinks,
          standard_drinks: stdDrinks,
          caffeine_mg: caffeineMg,
          water_oz: waterOz,
          fish,
        });
      } else {
        existing.peak_bac = Math.max(existing.peak_bac, peak);
        existing.drinks += drinks;
        existing.standard_drinks += stdDrinks;
        existing.caffeine_mg += caffeineMg;
        existing.water_oz += waterOz;
        existing.fish += fish;
      }
    }

    return NextResponse.json({ rows: [...rollup.values()] });
  } catch (err) {
    return NextResponse.json(
      { error: getErrorMessage(err, "Failed to load all-time leaderboard") },
      { status: 500 },
    );
  }
}
