// BAC + caffeine + hydration + substance math, ported from the standalone
// Drink Tracker HTML. All inputs are in lb / oz / mg with ISO-8601 timestamps;
// math runs client-side from the entry log so anyone can see anyone's curve.

export const WIDMARK_R_MALE = 0.68;
export const WIDMARK_R_FEMALE = 0.55;
export const WIDMARK_R_OTHER = 0.61;
export const ALCOHOL_METABOLISM = 0.015; // BAC/hr
export const CAFFEINE_HALF_LIFE_HOURS = 5;
export const CAFFEINE_ONSET_MINUTES = 30; // peak plasma at ~30-45 min after oral intake
export const HYDRATION_GOAL_OZ = 100;

export type Sex = "male" | "female" | "other";

export type DrinkPayload = {
  preset?: string;
  oz: number;
  abv: number;     // 0..1
  pct?: number;    // 0..1, default 1 (how much of the drink was actually consumed)
};

export type CaffeinePayload = {
  preset?: string;
  mg: number;
  oz?: number;
};

export type WaterPayload = {
  preset?: string;
  oz: number;
};

export type SubstancePayload = {
  preset?: string;
  type: "stimulant" | "benzo" | "thc" | "opioid" | "nicotine" | "other";
  severity: number;     // 1..5
  duration_hours: number;       // soft cutoff after which we stop showing as "active"
  half_life_hours?: number;     // first-order elimination half-life (effect)
  onset_minutes?: number;       // linear ramp from 0 to peak over this window
  notes?: string;
};

export type EntryKind = "drink" | "caffeine" | "water" | "substance";

export type Entry = {
  entry_id: string;
  entrant_id: string;
  kind: EntryKind;
  payload: Record<string, unknown>;
  occurred_at: string; // ISO
};

export type MemberProfile = {
  entrant_id: string;
  display_name: string;
  weight_lbs: number;
  sex: Sex;
};

export function widmarkR(sex: Sex): number {
  if (sex === "male") return WIDMARK_R_MALE;
  if (sex === "female") return WIDMARK_R_FEMALE;
  return WIDMARK_R_OTHER;
}

export function lbsToKg(lbs: number): number {
  return lbs * 0.453592;
}

// Grams of ethanol still in the body for a given member at `now`.
// The body has ONE elimination rate (~0.015 BAC/hr ≈ a few grams/hr depending
// on weight/sex), not one per drink. We integrate sequentially: accumulate
// grams as each drink comes in, subtract the constant metabolism rate over
// the gaps between drinks, then subtract once more from the last drink to
// `now`. Clamping to 0 between events lets the clock "reset" cleanly when
// the system fully clears before the next drink.
export function alcoholGramsRemaining(
  profile: MemberProfile,
  entries: Entry[],
  now: Date,
): number {
  const weightKg = lbsToKg(profile.weight_lbs);
  const r = widmarkR(profile.sex);
  const metabRate = ALCOHOL_METABOLISM * weightKg * r * 10; // grams/hr (whole body)

  const nowMs = now.getTime();
  const drinks: Array<{ t: number; grams: number }> = [];
  for (const e of entries) {
    if (e.kind !== "drink") continue;
    const p = e.payload as DrinkPayload;
    if (!p || typeof p.oz !== "number" || typeof p.abv !== "number") continue;
    const t = new Date(e.occurred_at).getTime();
    if (!Number.isFinite(t) || t > nowMs) continue; // future entries don't count yet
    const pct = typeof p.pct === "number" ? p.pct : 1;
    const grams = p.oz * 29.5735 * p.abv * pct * 0.789;
    if (grams > 0) drinks.push({ t, grams });
  }
  if (drinks.length === 0) return 0;

  drinks.sort((a, b) => a.t - b.t);

  let grams = 0;
  let lastT = drinks[0].t;
  for (const d of drinks) {
    const gapHrs = Math.max(0, (d.t - lastT) / 3600000);
    grams = Math.max(0, grams - metabRate * gapHrs);
    grams += d.grams;
    lastT = d.t;
  }
  const tailHrs = Math.max(0, (nowMs - lastT) / 3600000);
  return Math.max(0, grams - metabRate * tailHrs);
}

export function calcBAC(profile: MemberProfile, entries: Entry[], now: Date): number {
  const grams = alcoholGramsRemaining(profile, entries, now);
  const weightKg = lbsToKg(profile.weight_lbs);
  const r = widmarkR(profile.sex);
  if (weightKg <= 0 || r <= 0) return 0;
  return grams / (weightKg * r * 10);
}

export function caffeineMgRemaining(entries: Entry[], now: Date): number {
  // Linear ramp to peak over ~30 min absorption, then first-order decay with
  // the 5-hour half-life. This matches the substance model and prevents the
  // chart from pinning at the peak the instant an entry is logged.
  const onsetH = CAFFEINE_ONSET_MINUTES / 60;
  let total = 0;
  for (const e of entries) {
    if (e.kind !== "caffeine") continue;
    const p = e.payload as CaffeinePayload;
    if (!p || typeof p.mg !== "number") continue;
    const t = new Date(e.occurred_at).getTime();
    const hrs = (now.getTime() - t) / 3600000;
    if (hrs < 0) continue;
    const fraction = hrs < onsetH
      ? hrs / onsetH
      : Math.pow(0.5, (hrs - onsetH) / CAFFEINE_HALF_LIFE_HOURS);
    total += p.mg * fraction;
  }
  return total;
}

// Water consumed within the last 18 hours.
export function waterOzRecent(entries: Entry[], now: Date): number {
  let total = 0;
  for (const e of entries) {
    if (e.kind !== "water") continue;
    const p = e.payload as WaterPayload;
    if (!p || typeof p.oz !== "number") continue;
    const t = new Date(e.occurred_at).getTime();
    const hrs = (now.getTime() - t) / 3600000;
    if (hrs >= 0 && hrs < 18) total += p.oz;
  }
  return total;
}

export type ActiveSubstance = {
  entry_id: string;
  type: SubstancePayload["type"];
  severity: number;
  preset: string | undefined;
  duration_hours: number;
  hours_elapsed: number;
  hours_remaining: number;
  fraction: number; // 0..1 of peak effect, after onset ramp + exponential decay
};

// Substance effect fraction at a given age (hours since intake).
// Onset is a linear ramp 0→1 over `onset_minutes`. After onset, decays with
// half-life `half_life_hours`. Falls back to a linear decline over
// `duration_hours` if half-life isn't provided.
export function substanceFraction(payload: SubstancePayload, ageHours: number): number {
  if (!Number.isFinite(ageHours) || ageHours < 0) return 0;
  const onsetH = Math.max(0, (payload.onset_minutes ?? 0) / 60);
  if (onsetH > 0 && ageHours < onsetH) return ageHours / onsetH;
  const postOnset = ageHours - onsetH;
  if (typeof payload.half_life_hours === "number" && payload.half_life_hours > 0) {
    return Math.pow(0.5, postOnset / payload.half_life_hours);
  }
  if (typeof payload.duration_hours === "number" && payload.duration_hours > 0) {
    return Math.max(0, Math.min(1, 1 - postOnset / payload.duration_hours));
  }
  return 0;
}

export function activeSubstances(entries: Entry[], now: Date): ActiveSubstance[] {
  const out: ActiveSubstance[] = [];
  for (const e of entries) {
    if (e.kind !== "substance") continue;
    const p = e.payload as SubstancePayload;
    if (!p || typeof p.duration_hours !== "number") continue;
    const t = new Date(e.occurred_at).getTime();
    const hrs = (now.getTime() - t) / 3600000;
    if (hrs < 0 || hrs >= p.duration_hours) continue;
    const fraction = substanceFraction(p, hrs);
    if (fraction < 0.05) continue; // below the noise floor → stop reporting
    out.push({
      entry_id: e.entry_id,
      type: p.type,
      severity: p.severity,
      preset: p.preset,
      duration_hours: p.duration_hours,
      hours_elapsed: hrs,
      hours_remaining: p.duration_hours - hrs,
      fraction,
    });
  }
  return out;
}

export type RiskLevel = {
  label: "Clear" | "Low" | "Moderate" | "Elevated" | "High";
  color: string;
  score: number;
};

export function riskLevel(bac: number, drugs: ActiveSubstance[]): RiskLevel {
  // Scale each drug's contribution by how much of it is still effectively
  // active right now — keeps the score honest as substances wear off.
  const benzoSev = drugs.filter((d) => d.type === "benzo").reduce((s, d) => s + d.severity * d.fraction, 0);
  const thcSev = drugs.filter((d) => d.type === "thc").reduce((s, d) => s + d.severity * d.fraction, 0);
  let score = bac * 40 + benzoSev * 1.5 + thcSev * 0.8;
  if (bac > 0 && benzoSev > 0) score += benzoSev * bac * 30;
  if (score === 0) return { label: "Clear", color: "#22c55e", score };
  if (score < 1.5) return { label: "Low", color: "#84cc16", score };
  if (score < 3) return { label: "Moderate", color: "#eab308", score };
  if (score < 5) return { label: "Elevated", color: "#f97316", score };
  return { label: "High", color: "#ef4444", score };
}

// ─── Presets (mirror the standalone HTML) ──────────────────────────────────

export const ALCOHOL_PRESETS = [
  { name: "Beer (12oz/5%)", oz: 12, abv: 0.05 },
  { name: "IPA (16oz/7%)", oz: 16, abv: 0.07 },
  { name: "Light Beer (12oz/4.2%)", oz: 12, abv: 0.042 },
  { name: "1L Beer (5%)", oz: 33.814, abv: 0.05 },
  { name: "1L Light Beer (4.2%)", oz: 33.814, abv: 0.042 },
  { name: "1L IPA (7%)", oz: 33.814, abv: 0.07 },
  { name: "Wine (5oz/13%)", oz: 5, abv: 0.13 },
  { name: "Mimosa (6oz/6%)", oz: 6, abv: 0.06 },
  { name: "Cocktail (1.5oz)", oz: 1.5, abv: 0.4 },
  { name: "Double (3oz)", oz: 3, abv: 0.4 },
  { name: "Vodka Soda", oz: 1.5, abv: 0.4 },
  { name: "Shot (1oz)", oz: 1, abv: 0.4 },
  { name: "Jello Shot", oz: 0.5, abv: 0.4 },
  { name: "Hard Seltzer", oz: 12, abv: 0.05 },
] as const;

export const WATER_PRESETS = [
  { name: "Glass (8oz)", oz: 8 },
  { name: "Bottle (16oz)", oz: 16 },
  { name: "Big bottle (20oz)", oz: 20 },
  { name: "Yeti (32oz)", oz: 32 },
  { name: "Sip (4oz)", oz: 4 },
] as const;

export const CAFFEINE_PRESETS = [
  { name: "Coffee (8oz)", mg: 95, oz: 8 },
  { name: "Drip coffee (12oz)", mg: 140, oz: 12 },
  { name: "Espresso shot", mg: 64, oz: 1 },
  { name: "Cold brew (12oz)", mg: 200, oz: 12 },
  { name: "Red Bull (8.4oz)", mg: 80, oz: 8.4 },
  { name: "Monster (16oz)", mg: 160, oz: 16 },
  { name: "Black tea (8oz)", mg: 50, oz: 8 },
  { name: "Green tea (8oz)", mg: 30, oz: 8 },
  { name: "Yerba Mate (16oz)", mg: 80, oz: 16 },
  { name: "Diet Coke (12oz)", mg: 46, oz: 12 },
] as const;

// Each preset includes a (rough) onset-to-peak time and elimination half-life
// so the substance fraction renders like caffeine: ramp up to 1.0 over the
// onset, then exponential decay with the half-life. `duration_hours` is the
// soft cutoff after which we stop showing the entry as "active."
export const SUBSTANCE_PRESETS: ReadonlyArray<{
  name: string;
  type: SubstancePayload["type"];
  severity: number;
  duration_hours: number;
  half_life_hours: number;
  onset_minutes: number;
}> = [
  // Stimulants — Vyvanse converts to d-amphetamine (half-life ~10-11 h, onset ~1.5 h).
  // Adderall IR: d-amphetamine half-life ~10 h, onset 30 min.
  { name: "Vyvanse 20mg",      type: "stimulant", severity: 1, duration_hours: 12, half_life_hours: 11, onset_minutes: 90 },
  { name: "Vyvanse 30mg",      type: "stimulant", severity: 2, duration_hours: 14, half_life_hours: 11, onset_minutes: 90 },
  { name: "Vyvanse 40mg",      type: "stimulant", severity: 2, duration_hours: 14, half_life_hours: 11, onset_minutes: 90 },
  { name: "Vyvanse 60mg",      type: "stimulant", severity: 3, duration_hours: 16, half_life_hours: 11, onset_minutes: 90 },
  { name: "Adderall 10mg",     type: "stimulant", severity: 1, duration_hours: 8,  half_life_hours: 10, onset_minutes: 30 },
  { name: "Adderall 20mg",     type: "stimulant", severity: 2, duration_hours: 10, half_life_hours: 10, onset_minutes: 30 },
  // Benzos — Lorazepam half-life ~12 h, Alprazolam (Xanax) ~11 h, onset ~30 min.
  { name: "Lorazepam 0.5mg",   type: "benzo",     severity: 2, duration_hours: 8,  half_life_hours: 12, onset_minutes: 30 },
  { name: "Lorazepam 1mg",     type: "benzo",     severity: 3, duration_hours: 10, half_life_hours: 12, onset_minutes: 30 },
  { name: "Lorazepam 2mg",     type: "benzo",     severity: 4, duration_hours: 12, half_life_hours: 12, onset_minutes: 30 },
  { name: "Xanax 0.5mg",       type: "benzo",     severity: 2, duration_hours: 6,  half_life_hours: 11, onset_minutes: 30 },
  { name: "Xanax 1mg",         type: "benzo",     severity: 3, duration_hours: 8,  half_life_hours: 11, onset_minutes: 30 },
  // THC — edibles: onset ~60 min, perceived half-life ~4 h. Smoked: onset 5 min, ~1.5 h.
  { name: "THC 5mg edible",    type: "thc",       severity: 1, duration_hours: 5,  half_life_hours: 4,  onset_minutes: 60 },
  { name: "THC 10mg edible",   type: "thc",       severity: 2, duration_hours: 7,  half_life_hours: 4,  onset_minutes: 60 },
  { name: "THC 25mg edible",   type: "thc",       severity: 3, duration_hours: 10, half_life_hours: 4,  onset_minutes: 60 },
  { name: "Cannabis (smoked)", type: "thc",       severity: 2, duration_hours: 3,  half_life_hours: 1.5, onset_minutes: 5 },
  // Nicotine pouches — plasma half-life ~2 h, onset ~10-15 min.
  { name: "Zyn 3mg pouch",     type: "nicotine",  severity: 1, duration_hours: 3,  half_life_hours: 2,  onset_minutes: 10 },
  { name: "Zyn 6mg pouch",     type: "nicotine",  severity: 2, duration_hours: 4,  half_life_hours: 2,  onset_minutes: 10 },
  { name: "Zyn 9mg pouch",     type: "nicotine",  severity: 3, duration_hours: 5,  half_life_hours: 2,  onset_minutes: 10 },
];

export const SUBSTANCE_COLORS: Record<SubstancePayload["type"], string> = {
  stimulant: "#3b82f6",
  benzo: "#f97316",
  thc: "#22c55e",
  opioid: "#a855f7",
  nicotine: "#eab308",
  other: "#9ca3af",
};

// ─── Time series for charts ─────────────────────────────────────────────────
//
// Sample BAC and caffeine at fixed intervals across a window so the timeline
// view can draw decay curves. Caller picks the window; we don't clip to
// session boundaries because entries can span multiple days and the math
// already accounts for full elapsed time.

export type SeriesPoint = { t: number; value: number };

export function bacSeries(
  profile: MemberProfile,
  entries: Entry[],
  fromMs: number,
  toMs: number,
  stepMinutes = 5,
): SeriesPoint[] {
  const stepMs = stepMinutes * 60_000;
  const out: SeriesPoint[] = [];
  for (let t = fromMs; t <= toMs; t += stepMs) {
    out.push({ t, value: calcBAC(profile, entries, new Date(t)) });
  }
  return out;
}

export function caffeineSeries(
  entries: Entry[],
  fromMs: number,
  toMs: number,
  stepMinutes = 5,
): SeriesPoint[] {
  const stepMs = stepMinutes * 60_000;
  const out: SeriesPoint[] = [];
  for (let t = fromMs; t <= toMs; t += stepMs) {
    out.push({ t, value: caffeineMgRemaining(entries, new Date(t)) });
  }
  return out;
}

// Earliest entry timestamp across a member's logs (or null if none).
export function earliestEntryMs(entries: Entry[]): number | null {
  let best: number | null = null;
  for (const e of entries) {
    const t = new Date(e.occurred_at).getTime();
    if (Number.isFinite(t) && (best === null || t < best)) best = t;
  }
  return best;
}
