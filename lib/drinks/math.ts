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

export type ActivityIntensity = "light" | "moderate" | "vigorous";

export type ActivityPayload = {
  preset?: string;
  intensity: ActivityIntensity;
  duration_minutes: number;
  notes?: string;
};

// While an activity is in progress, ethanol burn rate is boosted by this
// multiplier (over baseline 0.015 BAC/hr). Conservative values picked from
// the modest range supported by Pikaar 1988 / Kechagias 2017 style studies.
export const ACTIVITY_METABOLISM_MULTIPLIER: Record<ActivityIntensity, number> = {
  light: 1.05,
  moderate: 1.15,
  vigorous: 1.25,
};

export const ACTIVITY_COLORS: Record<ActivityIntensity, string> = {
  light: "#86efac",
  moderate: "#4ade80",
  vigorous: "#22c55e",
};

export type EntryKind = "drink" | "caffeine" | "water" | "substance" | "activity" | "food" | "sleep" | "vomit" | "fish";

export type Entry = {
  entry_id: string;
  entrant_id: string | null;
  guest_id?: string | null;
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

type ActivityWindow = { startMs: number; endMs: number; mult: number };

function collectActivityWindows(entries: Entry[]): ActivityWindow[] {
  const out: ActivityWindow[] = [];
  for (const e of entries) {
    if (e.kind !== "activity") continue;
    const p = e.payload as Partial<ActivityPayload>;
    if (!p || typeof p.duration_minutes !== "number" || !p.intensity) continue;
    const t = new Date(e.occurred_at).getTime();
    if (!Number.isFinite(t)) continue;
    const mult = ACTIVITY_METABOLISM_MULTIPLIER[p.intensity] ?? 1;
    if (mult > 1 && p.duration_minutes > 0) {
      out.push({ startMs: t, endMs: t + p.duration_minutes * 60_000, mult });
    }
  }
  return out;
}

// Integrate the (possibly time-varying) burn rate between t0 and t1, applying
// activity multipliers on top of the base rate during workout windows.
// Overlapping windows take the maximum multiplier (no compounding).
function integrateBurn(
  windows: ActivityWindow[],
  baseRatePerHr: number,
  t0: number,
  t1: number,
): number {
  if (t1 <= t0) return 0;
  if (windows.length === 0) return baseRatePerHr * (t1 - t0) / 3600000;
  const bp = new Set<number>([t0, t1]);
  for (const w of windows) {
    if (w.endMs > t0 && w.startMs < t1) {
      bp.add(Math.max(t0, w.startMs));
      bp.add(Math.min(t1, w.endMs));
    }
  }
  const sorted = [...bp].sort((a, b) => a - b);
  let totalGrams = 0;
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const a = sorted[i];
    const b = sorted[i + 1];
    let mult = 1;
    for (const w of windows) {
      if (w.startMs <= a && w.endMs >= b && w.mult > mult) mult = w.mult;
    }
    totalGrams += baseRatePerHr * mult * (b - a) / 3600000;
  }
  return totalGrams;
}

// Grams of ethanol still in the body for a given member at `now`.
//
// The body has ONE elimination rate (~0.015 BAC/hr ≈ a few grams/hr depending
// on weight/sex), not one per drink. We integrate sequentially: accumulate
// grams as each drink comes in, subtract the constant metabolism rate over
// the gaps between events, then subtract once more from the last event to
// `now`. During logged activity windows the burn rate gets a small
// intensity-dependent boost (see integrateBurn).
//
// Vomit events expel a portion of *unabsorbed* stomach alcohol. We track a
// virtual per-drink stomach pool (using a 60-min absorption window) purely
// to compute that reduction — the bloodstream still uses the existing
// instant-absorption assumption so the BAC chart stays consistent.
export function alcoholGramsRemaining(
  profile: MemberProfile,
  entries: Entry[],
  now: Date,
): number {
  const weightKg = lbsToKg(profile.weight_lbs);
  const r = widmarkR(profile.sex);
  const metabRate = ALCOHOL_METABOLISM * weightKg * r * 10; // grams/hr

  const nowMs = now.getTime();
  const windows = collectActivityWindows(entries);

  type Ev =
    | { kind: "drink"; t: number; grams: number }
    | { kind: "vomit"; t: number; severity: 1 | 2 | 3 };
  const events: Ev[] = [];
  for (const e of entries) {
    const t = new Date(e.occurred_at).getTime();
    if (!Number.isFinite(t) || t > nowMs) continue;
    if (e.kind === "drink") {
      const p = e.payload as DrinkPayload;
      if (!p || typeof p.oz !== "number" || typeof p.abv !== "number") continue;
      const pct = typeof p.pct === "number" ? p.pct : 1;
      const grams = p.oz * 29.5735 * p.abv * pct * 0.789;
      if (grams > 0) events.push({ kind: "drink", t, grams });
    } else if (e.kind === "vomit") {
      const p = e.payload as Partial<VomitPayload>;
      const sevRaw = typeof p?.severity === "number" ? Math.round(p.severity) : 2;
      const severity = (Math.max(1, Math.min(3, sevRaw)) as 1 | 2 | 3);
      events.push({ kind: "vomit", t, severity });
    }
  }
  if (events.length === 0) return 0;
  events.sort((a, b) => a.t - b.t);

  // stomach pool: per-drink "grams that could still be vomited out"
  // gOriginal × (1 - ageMin/60) − gExpelled, clamped at 0.
  const stomach: Array<{ t: number; gOriginal: number; gExpelled: number }> = [];

  let grams = 0;
  let lastT = events[0].t;
  for (const ev of events) {
    const burn = integrateBurn(windows, metabRate, lastT, ev.t);
    grams = Math.max(0, grams - burn);

    if (ev.kind === "drink") {
      grams += ev.grams;
      stomach.push({ t: ev.t, gOriginal: ev.grams, gExpelled: 0 });
    } else {
      const mult = VOMIT_EXPEL_FRACTION[ev.severity];
      for (const d of stomach) {
        const ageMin = (ev.t - d.t) / 60_000;
        if (ageMin < 0 || ageMin >= ABSORPTION_WINDOW_MIN) continue;
        const stillUnabsorbed = d.gOriginal * (1 - ageMin / ABSORPTION_WINDOW_MIN);
        const inStomach = Math.max(0, stillUnabsorbed - d.gExpelled);
        if (inStomach <= 0) continue;
        const expelled = inStomach * mult;
        d.gExpelled += expelled;
        grams = Math.max(0, grams - expelled);
      }
    }
    lastT = ev.t;
  }

  const tailBurn = integrateBurn(windows, metabRate, lastT, nowMs);
  return Math.max(0, grams - tailBurn);
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

export type CongenerLoad = "low" | "med" | "high";

// `congener` tags drive the Hangover Forecast — dark spirits & red wine
// carry up to ~30× more congeners than clear spirits and correlate with
// worse next-day symptoms. Defaults to "med" when ambiguous (the drink
// could be made with any spirit).
export const ALCOHOL_PRESETS: ReadonlyArray<{
  name: string; oz: number; abv: number; congener: CongenerLoad;
}> = [
  { name: "Beer (12oz/5%)",         oz: 12,    abv: 0.05,  congener: "low" },
  { name: "Pint Beer (16oz/5%)",    oz: 16,    abv: 0.05,  congener: "low" },
  { name: "IPA (16oz/7%)",          oz: 16,    abv: 0.07,  congener: "med" },
  { name: "Pint IPA (16oz/8%)",     oz: 16,    abv: 0.08,  congener: "med" },
  { name: "Heavy IPA (16oz/9%)",    oz: 16,    abv: 0.09,  congener: "med" },
  { name: "Light Beer (12oz/4.2%)", oz: 12,    abv: 0.042, congener: "low" },
  { name: "1L Beer (5%)",           oz: 33.814, abv: 0.05, congener: "low" },
  { name: "1L Light Beer (4.2%)",   oz: 33.814, abv: 0.042, congener: "low" },
  { name: "1L IPA (7%)",            oz: 33.814, abv: 0.07, congener: "med" },
  { name: "Wine (5oz/13%)",         oz: 5,     abv: 0.13,  congener: "med" },
  { name: "Red Wine (5oz/13%)",     oz: 5,     abv: 0.13,  congener: "high" },
  { name: "Big Pour Wine (8oz/14%)", oz: 8,    abv: 0.14,  congener: "med" },
  { name: "Mimosa (6oz/6%)",        oz: 6,     abv: 0.06,  congener: "low" },
  { name: "Cocktail (1.5oz)",       oz: 1.5,   abv: 0.4,   congener: "med" },
  { name: "Strong Cocktail (2.5oz)", oz: 2.5,  abv: 0.4,   congener: "med" },
  { name: "Double (3oz)",           oz: 3,     abv: 0.4,   congener: "med" },
  { name: "Triple (4oz)",           oz: 4,     abv: 0.4,   congener: "med" },
  { name: "Heavy Pour (5oz)",       oz: 5,     abv: 0.4,   congener: "med" },
  { name: "Vodka Soda",             oz: 1.5,   abv: 0.4,   congener: "low" },
  { name: "Bourbon / Whiskey neat (2oz)", oz: 2, abv: 0.4, congener: "high" },
  { name: "Dark Rum (2oz)",         oz: 2,     abv: 0.4,   congener: "high" },
  { name: "Tequila Reposado (1.5oz)", oz: 1.5, abv: 0.4,   congener: "high" },
  { name: "Shot (1oz)",             oz: 1,     abv: 0.4,   congener: "med" },
  { name: "Jello Shot",             oz: 0.5,   abv: 0.4,   congener: "med" },
  { name: "Hard Seltzer",           oz: 12,    abv: 0.05,  congener: "low" },
];

const CONGENER_SCORE: Record<CongenerLoad, number> = { low: 0.2, med: 0.5, high: 1.0 };

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

// ─── Activities (starter set; iterate freely on this) ──────────────────────

export const ACTIVITY_PRESETS: ReadonlyArray<{
  name: string;
  intensity: ActivityIntensity;
  duration_minutes: number;
}> = [
  // Light (+5 %) — strolling around, easy movement
  { name: "Walk (30 min)",            intensity: "light",     duration_minutes: 30 },
  { name: "Walk (60 min)",            intensity: "light",     duration_minutes: 60 },
  { name: "Stretching (15 min)",      intensity: "light",     duration_minutes: 15 },
  { name: "Yoga (45 min)",            intensity: "light",     duration_minutes: 45 },
  { name: "Bowling (60 min)",         intensity: "light",     duration_minutes: 60 },
  { name: "Golf cart 9 (90 min)",     intensity: "light",     duration_minutes: 90 },
  // Moderate (+15 %) — yard games, pickup sports, party movement
  { name: "Dancing (60 min)",         intensity: "moderate",  duration_minutes: 60 },
  { name: "Cornhole / yard games (60 min)", intensity: "moderate", duration_minutes: 60 },
  { name: "Frisbee (45 min)",         intensity: "moderate",  duration_minutes: 45 },
  { name: "Volleyball (60 min)",      intensity: "moderate",  duration_minutes: 60 },
  { name: "Pickleball (45 min)",      intensity: "moderate",  duration_minutes: 45 },
  { name: "Casual basketball (45 min)", intensity: "moderate", duration_minutes: 45 },
  { name: "Bike ride (45 min)",       intensity: "moderate",  duration_minutes: 45 },
  { name: "Hike (90 min)",            intensity: "moderate",  duration_minutes: 90 },
  { name: "Pool / casual swim (30 min)", intensity: "moderate", duration_minutes: 30 },
  { name: "Golf walking 9 (2 hr)",    intensity: "moderate",  duration_minutes: 120 },
  { name: "Golf walking 18 (4 hr)",   intensity: "moderate",  duration_minutes: 240 },
  // Vigorous (+25 %) — actual workouts and competitive sports
  { name: "Jog (30 min)",             intensity: "vigorous",  duration_minutes: 30 },
  { name: "Run (45 min)",             intensity: "vigorous",  duration_minutes: 45 },
  { name: "Sprint session (20 min)",  intensity: "vigorous",  duration_minutes: 20 },
  { name: "Tennis singles (60 min)",  intensity: "vigorous",  duration_minutes: 60 },
  { name: "Soccer (60 min)",          intensity: "vigorous",  duration_minutes: 60 },
  { name: "Basketball game (45 min)", intensity: "vigorous",  duration_minutes: 45 },
  { name: "Heavy workout (45 min)",   intensity: "vigorous",  duration_minutes: 45 },
  { name: "Crossfit (45 min)",        intensity: "vigorous",  duration_minutes: 45 },
  { name: "Sweat sesh (60 min)",      intensity: "vigorous",  duration_minutes: 60 },
];

export type ActiveActivity = {
  entry_id: string;
  intensity: ActivityIntensity;
  preset: string | undefined;
  duration_minutes: number;
  minutes_elapsed: number;
  minutes_remaining: number;
  multiplier: number;
};

// Activities currently in progress at `now` — used by Stadium pills.
export function activeActivities(entries: Entry[], now: Date): ActiveActivity[] {
  const out: ActiveActivity[] = [];
  for (const e of entries) {
    if (e.kind !== "activity") continue;
    const p = e.payload as Partial<ActivityPayload>;
    if (!p || typeof p.duration_minutes !== "number" || !p.intensity) continue;
    const t = new Date(e.occurred_at).getTime();
    if (!Number.isFinite(t)) continue;
    const ageMin = (now.getTime() - t) / 60_000;
    if (ageMin < 0 || ageMin >= p.duration_minutes) continue;
    out.push({
      entry_id: e.entry_id,
      intensity: p.intensity,
      preset: p.preset,
      duration_minutes: p.duration_minutes,
      minutes_elapsed: ageMin,
      minutes_remaining: p.duration_minutes - ageMin,
      multiplier: ACTIVITY_METABOLISM_MULTIPLIER[p.intensity] ?? 1,
    });
  }
  return out;
}

// ─── Food + sleep entries (hangover-forecast inputs) ───────────────────────

export type FoodSize = "snack" | "meal" | "heavy";

export type FoodPayload = {
  preset?: string;
  size: FoodSize;
  notes?: string;
};

export const FOOD_PRESETS: ReadonlyArray<{
  name: string; size: FoodSize;
}> = [
  { name: "Light snack",       size: "snack" },
  { name: "Chips / pretzels",  size: "snack" },
  { name: "Appetizer",         size: "snack" },
  { name: "Solid meal",        size: "meal" },
  { name: "Burger / sandwich", size: "meal" },
  { name: "Pasta / pizza",     size: "meal" },
  { name: "Heavy meal",        size: "heavy" },
  { name: "Steak dinner",      size: "heavy" },
];

export type SleepPayload = {
  hours: number;
  notes?: string;
};

// ─── Vomit / GI events ─────────────────────────────────────────────────────
// Severity 1 (mild) → expels ~30 % of stomach-resident alcohol
// Severity 2 (normal) → ~50 %
// Severity 3 (heavy) → ~70 % (some alcohol always escapes; pyloric sphincter etc.)
// Only alcohol consumed within the last 60 min counts; older drinks have
// already absorbed into the bloodstream and can't be vomited back.

export type VomitPayload = {
  preset?: string;
  severity: 1 | 2 | 3;
  notes?: string;
};

export const VOMIT_PRESETS: ReadonlyArray<{ name: string; severity: 1 | 2 | 3 }> = [
  { name: "Mild",   severity: 1 },
  { name: "Normal", severity: 2 },
  { name: "Heavy",  severity: 3 },
];

const VOMIT_EXPEL_FRACTION: Record<1 | 2 | 3, number> = { 1: 0.30, 2: 0.50, 3: 0.70 };
const ABSORPTION_WINDOW_MIN = 60;

// ─── Fish catches (sober-friendly tracking) ─────────────────────────────────
// One entry per catch. Species presets tuned to northern Minnesota lakes.
// No effect on BAC math — this is a counter with bragging rights.

export type FishPayload = {
  preset?: string;          // species name
  species: string;
  length_in?: number;       // optional; logged via a future detail form
  weight_lbs?: number;
  released?: boolean;
  notes?: string;
};

export const FISH_PRESETS: ReadonlyArray<{ name: string; species: string }> = [
  { name: "Walleye",            species: "walleye" },
  { name: "Northern Pike",      species: "northern-pike" },
  { name: "Muskie",             species: "muskie" },
  { name: "Smallmouth Bass",    species: "smallmouth-bass" },
  { name: "Largemouth Bass",    species: "largemouth-bass" },
  { name: "Yellow Perch",       species: "yellow-perch" },
  { name: "Crappie",            species: "crappie" },
  { name: "Bluegill / Sunfish", species: "bluegill" },
  { name: "Lake Trout",         species: "lake-trout" },
  { name: "Whitefish",          species: "whitefish" },
  { name: "Rock Bass",          species: "rock-bass" },
  { name: "Bullhead",           species: "bullhead" },
  { name: "Channel Catfish",    species: "channel-catfish" },
  { name: "Eelpout (Burbot)",   species: "burbot" },
  { name: "Sturgeon",           species: "sturgeon" },
  { name: "Tullibee (Cisco)",   species: "cisco" },
];

export type FishTally = {
  total: number;
  by_species: Array<{ species: string; label: string; count: number }>;
};

export function fishTally(entries: Entry[]): FishTally {
  const counts = new Map<string, { label: string; count: number }>();
  let total = 0;
  for (const e of entries) {
    if (e.kind !== "fish") continue;
    const p = e.payload as Partial<FishPayload>;
    const species = typeof p?.species === "string" ? p.species : "unknown";
    const label = typeof p?.preset === "string" ? p.preset : species;
    const cur = counts.get(species) ?? { label, count: 0 };
    cur.count += 1;
    counts.set(species, cur);
    total += 1;
  }
  return {
    total,
    by_species: [...counts.entries()]
      .map(([species, v]) => ({ species, label: v.label, count: v.count }))
      .sort((a, b) => b.count - a.count),
  };
}

// ─── Hangover Forecast ─────────────────────────────────────────────────────
//
// Predicts next-day misery on a 0–100 scale from the signals we already
// have. Heavily weighted on total ethanol + peak BAC, with multipliers
// for the supporting factors (congeners, dehydration, sleep, food, etc.).

export type HangoverFactorKey =
  | "ethanol"
  | "peak_bac"
  | "congeners"
  | "dehydration"
  | "stimulant_load"
  | "pace"
  | "sleep"
  | "depressant_load"
  | "time_over_0_08"
  | "food"
  | "age"
  | "vomit";

export type HangoverFactor = {
  key: HangoverFactorKey;
  label: string;
  weight: number;       // 0–100 contribution to the score
  contribution: number; // weight × normalized intensity
  detail: string;
};

export type HangoverForecast = {
  score: number;            // 0–100
  bucket: "minimal" | "mild" | "moderate" | "rough" | "brutal";
  color: string;
  factors: HangoverFactor[];
  // Useful derived values surfaced for the UI
  total_ethanol_g: number;
  peak_bac: number;
  drink_count: number;
};

function bucketForScore(s: number): { bucket: HangoverForecast["bucket"]; color: string } {
  if (s < 15) return { bucket: "minimal", color: "#22c55e" };
  if (s < 30) return { bucket: "mild",    color: "#84cc16" };
  if (s < 50) return { bucket: "moderate", color: "#eab308" };
  if (s < 75) return { bucket: "rough",   color: "#f97316" };
  return       { bucket: "brutal",  color: "#ef4444" };
}

function peakBacOf(profile: MemberProfile, entries: Entry[], now: Date): number {
  // Sample every 5 min from the first drink to `now` (peak can't lie outside).
  let earliestDrink = Number.POSITIVE_INFINITY;
  for (const e of entries) {
    if (e.kind !== "drink") continue;
    const t = new Date(e.occurred_at).getTime();
    if (Number.isFinite(t) && t < earliestDrink) earliestDrink = t;
  }
  if (!Number.isFinite(earliestDrink)) return 0;
  const step = 5 * 60_000;
  let peak = 0;
  for (let t = earliestDrink; t <= now.getTime(); t += step) {
    const bac = calcBAC(profile, entries, new Date(t));
    if (bac > peak) peak = bac;
  }
  return peak;
}

export function hangoverForecast(
  profile: MemberProfile,
  entries: Entry[],
  now: Date,
  options?: { age_years?: number | null },
): HangoverForecast {
  // —— derive signals ——
  let totalEthanolG = 0;
  let congenerScore = 0;
  let drinkCount = 0;
  let firstDrinkMs = Number.POSITIVE_INFINITY;
  let lastDrinkMs = 0;
  const hourlyGrams = new Map<number, number>(); // hour bucket → grams
  for (const e of entries) {
    if (e.kind !== "drink") continue;
    const p = e.payload as DrinkPayload & { congener?: CongenerLoad };
    if (typeof p?.oz !== "number" || typeof p?.abv !== "number") continue;
    const grams = p.oz * 29.5735 * p.abv * (typeof p.pct === "number" ? p.pct : 1) * 0.789;
    if (grams <= 0) continue;
    totalEthanolG += grams;
    drinkCount += 1;
    congenerScore += CONGENER_SCORE[p.congener ?? "med"];
    const t = new Date(e.occurred_at).getTime();
    if (Number.isFinite(t)) {
      if (t < firstDrinkMs) firstDrinkMs = t;
      if (t > lastDrinkMs) lastDrinkMs = t;
      const hour = Math.floor(t / 3600_000);
      hourlyGrams.set(hour, (hourlyGrams.get(hour) ?? 0) + grams);
    }
  }
  const avgCongener = drinkCount > 0 ? congenerScore / drinkCount : 0;
  const peakBac = peakBacOf(profile, entries, now);

  // Time over 0.08 (rough proxy via the same 5-min sampling)
  let hoursOver08 = 0;
  if (Number.isFinite(firstDrinkMs)) {
    const step = 5 * 60_000;
    let samplesOver = 0;
    let samples = 0;
    for (let t = firstDrinkMs; t <= now.getTime(); t += step) {
      const bac = calcBAC(profile, entries, new Date(t));
      if (bac > 0.08) samplesOver += 1;
      samples += 1;
    }
    if (samples > 0) hoursOver08 = (samplesOver * step) / 3600_000;
  }

  // Dehydration: water consumed in the same window vs. a generous goal
  const sessionHours = Number.isFinite(firstDrinkMs)
    ? Math.max(0, (now.getTime() - firstDrinkMs) / 3600_000)
    : 0;
  const hydrationGoal = Math.max(HYDRATION_GOAL_OZ, sessionHours * 8); // ~8oz/h while drinking
  const waterOz = waterOzRecent(entries, now);
  const dehydrationDeficit = Math.max(0, 1 - waterOz / Math.max(1, hydrationGoal));

  // Stimulant load: residual caffeine + active nicotine + stimulants
  const cafMg = caffeineMgRemaining(entries, now);
  const drugs = activeSubstances(entries, now);
  const nicotineLoad = drugs.filter((d) => d.type === "nicotine").reduce((s, d) => s + d.severity * d.fraction, 0);
  const stimulantLoad = drugs.filter((d) => d.type === "stimulant").reduce((s, d) => s + d.severity * d.fraction, 0);
  const stimulantSignal = Math.min(1, cafMg / 400 + nicotineLoad * 0.25 + stimulantLoad * 0.2);

  // Depressants (benzos + THC + opioids): amplifies severity
  const depressantLoad = drugs
    .filter((d) => d.type === "benzo" || d.type === "thc" || d.type === "opioid")
    .reduce((s, d) => s + d.severity * d.fraction, 0);

  // Pace: grams of ethanol in the heaviest hour
  let peakHourGrams = 0;
  for (const g of hourlyGrams.values()) {
    if (g > peakHourGrams) peakHourGrams = g;
  }

  // Sleep (latest sleep entry)
  let sleepHours: number | null = null;
  for (const e of entries) {
    if (e.kind !== "sleep") continue;
    const p = e.payload as Partial<SleepPayload>;
    if (typeof p?.hours === "number" && Number.isFinite(p.hours)) sleepHours = p.hours;
  }
  const sleepDeficit = sleepHours === null ? null : Math.max(0, Math.min(1, (7.5 - sleepHours) / 7.5));

  // Vomit count — every event amplifies the hangover via dehydration + GI
  // distress + a near-certain "overshoot" signal even when BAC came down.
  let vomitCount = 0;
  let vomitWeightedSeverity = 0;
  for (const e of entries) {
    if (e.kind !== "vomit") continue;
    vomitCount += 1;
    const p = e.payload as Partial<VomitPayload>;
    const sev = typeof p?.severity === "number" ? Math.max(1, Math.min(3, p.severity)) : 2;
    vomitWeightedSeverity += sev;
  }

  // Food helpfulness: any solid food during/before drinking reduces hangover.
  let foodScore = 0; // 0 = no food, 1 = heavy meal pre-game
  for (const e of entries) {
    if (e.kind !== "food") continue;
    const p = e.payload as Partial<FoodPayload>;
    const size = p?.size === "heavy" ? 1.0 : p?.size === "meal" ? 0.7 : 0.3;
    const t = new Date(e.occurred_at).getTime();
    // Eating BEFORE the first drink helps most; during, modestly; after, little.
    let timing = 0.5;
    if (Number.isFinite(firstDrinkMs) && Number.isFinite(t)) {
      if (t <= firstDrinkMs) timing = 1.0;
      else if (t <= lastDrinkMs) timing = 0.7;
      else timing = 0.2;
    }
    foodScore = Math.max(foodScore, size * timing);
  }

  // Age multiplier (very rough): >30 starts adding misery, >50 is a big jump.
  const age = options?.age_years ?? null;
  const ageSignal = age === null
    ? 0
    : Math.max(0, Math.min(1, (age - 25) / 40)); // 25 → 0, 65 → 1

  // —— turn signals into weighted contributions ——
  const factors: HangoverFactor[] = [];
  const add = (
    key: HangoverFactorKey, label: string, weight: number, intensity: number, detail: string,
  ) => {
    const clamped = Math.max(0, Math.min(1, intensity));
    factors.push({ key, label, weight, contribution: weight * clamped, detail });
  };

  add(
    "ethanol", "Total ethanol", 30,
    Math.min(1, totalEthanolG / 200),
    `${totalEthanolG.toFixed(0)} g (≈ ${(totalEthanolG / 14).toFixed(1)} std drinks)`,
  );
  add(
    "peak_bac", "Peak BAC", 25,
    Math.min(1, peakBac / 0.20),
    `Peaked at ${peakBac.toFixed(3)}`,
  );
  add(
    "congeners", "Congeners", 12,
    avgCongener,
    drinkCount === 0 ? "—" : `avg load ${(avgCongener * 100).toFixed(0)}% (dark spirits/red wine)`,
  );
  add(
    "dehydration", "Dehydration", 10,
    dehydrationDeficit,
    `${Math.round(waterOz)} oz water vs ${Math.round(hydrationGoal)} oz goal`,
  );
  add(
    "stimulant_load", "Stimulants & nicotine", 8,
    stimulantSignal,
    `${Math.round(cafMg)} mg caffeine, ${nicotineLoad.toFixed(1)} nicotine`,
  );
  add(
    "pace", "Drinking pace", 5,
    Math.min(1, peakHourGrams / 60),
    `${peakHourGrams.toFixed(0)} g in heaviest hour`,
  );
  add(
    "time_over_0_08", "Time over 0.08 BAC", 4,
    Math.min(1, hoursOver08 / 6),
    `${hoursOver08.toFixed(1)} h above 0.08`,
  );
  add(
    "depressant_load", "Benzos / THC / opioids", 3,
    Math.min(1, depressantLoad / 5),
    depressantLoad > 0 ? `load ${depressantLoad.toFixed(1)}` : "—",
  );
  add(
    "vomit", "Vomiting", 12,
    Math.min(1, vomitWeightedSeverity / 6), // 3 normal vomits → max
    vomitCount === 0
      ? "none logged"
      : `${vomitCount} event${vomitCount > 1 ? "s" : ""}, sev sum ${vomitWeightedSeverity}`,
  );
  if (sleepDeficit !== null) {
    add(
      "sleep", "Sleep deficit", 8,
      sleepDeficit,
      `${sleepHours?.toFixed(1)} h logged`,
    );
  }
  // Food REDUCES the score — represent it as a negative-direction factor.
  if (foodScore > 0) {
    factors.push({
      key: "food",
      label: "Food intake (reduces)",
      weight: -6,
      contribution: -6 * foodScore,
      detail: foodScore >= 0.7 ? "solid meal before/during" : "snack only",
    });
  }
  add(
    "age", "Age", 5,
    ageSignal,
    age === null ? "not set" : `${age} y/o`,
  );

  const raw = factors.reduce((s, f) => s + f.contribution, 0);
  const score = Math.max(0, Math.min(100, raw));
  const { bucket, color } = bucketForScore(score);

  return {
    score,
    bucket,
    color,
    factors,
    total_ethanol_g: totalEthanolG,
    peak_bac: peakBac,
    drink_count: drinkCount,
  };
}

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
